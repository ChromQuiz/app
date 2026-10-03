// V7: 当日受付QRの署名付きトークンを、実装を直接 import して検証する。
//
// qr_token.ts は署名鍵を Deno.env から取るため、Node(vitest)では Deno グローバルをスタブして実行する。
// HMAC は WebCrypto(crypto.subtle)で、Node 18+ でもそのまま動作する。

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SECRET = 'test-signing-secret-0123456789abcdef';   // 32文字以上（V1 の下限を満たす）
const ENTRY_ID = '080410bf-8742-4a6b-80db-139a680e3e53';

let issueQrToken, verifyQrToken, hmacHex;

beforeAll(async () => {
  globalThis.Deno = { env: { get: (k) => (k === 'CIQ_EMAIL_SIGNING_SECRET' ? SECRET : undefined) } };
  ({ issueQrToken, verifyQrToken } = await import('../supabase/functions/_shared/qr_token.ts'));
  ({ hmacHex } = await import('../supabase/functions/_shared/signing.ts'));
});

describe('signed check-in QR tokens (V7)', () => {
  it('issues a token that is not the bare entry UUID', async () => {
    const token = await issueQrToken(ENTRY_ID);
    expect(token).not.toBe(ENTRY_ID);
    expect(token.split('.')).toHaveLength(2);
    expect(token.startsWith(`${ENTRY_ID}.`)).toBe(true);
  });

  it('round-trips: a freshly issued token verifies back to the entry id', async () => {
    const token = await issueQrToken(ENTRY_ID);
    await expect(verifyQrToken(token)).resolves.toBe(ENTRY_ID);
  });

  it('verifies the upper-case form that is embedded in the image', async () => {
    const token = await issueQrToken(ENTRY_ID);
    await expect(verifyQrToken(token.toUpperCase())).resolves.toBe(ENTRY_ID);
    await expect(verifyQrToken(`  ${token.toUpperCase()}\n`)).resolves.toBe(ENTRY_ID);
  });

  it('rejects a legacy bare UUID (old QR format)', async () => {
    await expect(verifyQrToken(ENTRY_ID)).resolves.toBeNull();
  });

  it('rejects a token whose entry id was swapped (forgery)', async () => {
    const token = await issueQrToken(ENTRY_ID);
    const [, sig] = token.split('.');
    const otherId = '0909e458-681c-4b4f-9d8e-f8ec6806c9d0';
    await expect(verifyQrToken(`${otherId}.${sig}`)).resolves.toBeNull();
  });

  it('rejects a tampered, truncated, padded or non-hex signature', async () => {
    const token = await issueQrToken(ENTRY_ID);
    const [id, sig] = token.split('.');
    const flipped = (sig[0] === '0' ? '1' : '0') + sig.slice(1);
    for (const bad of [
      '0'.repeat(sig.length), flipped, sig.slice(0, -1), `${sig}0`, sig.replace(/./, 'z'), '',
    ]) {
      await expect(verifyQrToken(`${id}.${bad}`)).resolves.toBeNull();
    }
  });

  it('carries no expiry: the same entry always gets the same token, whatever the old TTL setting says', async () => {
    const first = await issueQrToken(ENTRY_ID);
    globalThis.Deno = { env: { get: (k) => (k === 'CIQ_QR_TTL_DAYS' ? '1' : (k === 'CIQ_EMAIL_SIGNING_SECRET' ? SECRET : undefined)) } };
    const second = await issueQrToken(ENTRY_ID);
    globalThis.Deno = { env: { get: (k) => (k === 'CIQ_EMAIL_SIGNING_SECRET' ? SECRET : undefined) } };
    expect(second).toBe(first);
    expect(first.split('.')).toHaveLength(2);
  });

  it('is short enough to stay at QR version 3 with error correction L, using only alphanumeric-mode characters', async () => {
    const token = (await issueQrToken(ENTRY_ID)).toUpperCase();
    // version 3-L の英数字モードの容量は 77 文字。英数字モード: 0-9 A-Z 空白 $%*+-./:
    expect(token.length).toBeLessThanOrEqual(77);
    expect(token).toMatch(/^[0-9A-F.\-]+$/);
  });

  it('binds a purpose+version tag so signatures cannot cross protocols', async () => {
    const src = readFileSync(resolve(ROOT, 'supabase/functions/_shared/qr_token.ts'), 'utf8');
    expect(src).toMatch(/const TOKEN_VERSION = 'qr3'/);
    expect(src).toMatch(/const LEGACY_TOKEN_VERSION = 'qr1'/);
    expect(src).toMatch(/`\$\{TOKEN_VERSION\}:\$\{entryId\}`/);
  });

  it('does not accept a current-format signature as a legacy one, or the other way round', async () => {
    const token = await issueQrToken(ENTRY_ID);
    const [id, sig] = token.split('.');
    // 現行の署名(32文字)を旧形式の枠(3パート)に入れても通らない
    await expect(verifyQrToken(`${id}.${Date.now() + 1e9}.${sig}`)).resolves.toBeNull();
    // 旧形式の署名を現行の枠(2パート)に入れても通らない
    const exp = Date.now() + 86400000;
    const legacySig = await hmacHex(SECRET, `qr1:${ENTRY_ID}:${exp}`);
    await expect(verifyQrToken(`${ENTRY_ID}.${legacySig}`)).resolves.toBeNull();
  });

  it('rejects malformed input', async () => {
    for (const bad of ['', 'a.b', 'a.b.c.d', null, undefined, 42, `${ENTRY_ID}.notanumber.abc`, `${ENTRY_ID}.`, `.${'a'.repeat(32)}`]) {
      await expect(verifyQrToken(bad)).resolves.toBeNull();
    }
  });
});

describe('legacy tokens that were already issued (expiring format)', () => {
  const legacy = async (id, expMs) => `${id}.${expMs}.${await hmacHex(SECRET, `qr1:${id}:${expMs}`)}`;

  it('still verify while they are within their expiry', async () => {
    const token = await legacy(ENTRY_ID, Date.now() + 5 * 86400000);
    await expect(verifyQrToken(token)).resolves.toBe(ENTRY_ID);
    await expect(verifyQrToken(token.toUpperCase())).resolves.toBe(ENTRY_ID);
  });

  it('are rejected once expired', async () => {
    await expect(verifyQrToken(await legacy(ENTRY_ID, Date.now() - 1000))).resolves.toBeNull();
  });

  it('are rejected when the entry id, the expiry or the signature is tampered with', async () => {
    const exp = Date.now() + 86400000;
    const token = await legacy(ENTRY_ID, exp);
    const [id, , sig] = token.split('.');
    await expect(verifyQrToken(`0909e458-681c-4b4f-9d8e-f8ec6806c9d0.${exp}.${sig}`)).resolves.toBeNull();
    await expect(verifyQrToken(`${id}.${exp + 1}.${sig}`)).resolves.toBeNull();
    await expect(verifyQrToken(`${id}.${exp}.${'0'.repeat(64)}`)).resolves.toBeNull();
    await expect(verifyQrToken(`${id}.${exp}.${sig.slice(0, 32)}`)).resolves.toBeNull();
  });
});

describe('the QR image is generated small', () => {
  const qrSrc = readFileSync(resolve(ROOT, 'supabase/functions/_shared/qr.ts'), 'utf8');

  it('upper-cases the value so it is encoded in alphanumeric mode', () => {
    expect(qrSrc).toMatch(/String\(value\)\.toUpperCase\(\)/);
  });

  it('uses error correction level L', () => {
    expect(qrSrc).toMatch(/errorCorrectionLevel: 'L'/);
  });
});

describe('QR generation paths embed the signed token, never the raw UUID (V7)', () => {
  const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

  for (const [fn, call] of Object.entries({
    'my-entry': /makeQrSvg\(await issueQrToken\(entryId\)\)/,
    'admin-entry-qr': /makeQrSvg\(await issueQrToken\(entry\.id\)\)/,
    'checkin-qr': /makeQrSvg\(await issueQrToken\(data\)\)/,
  })) {
    it(`${fn}: encodes a signed token`, () => {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src).toMatch(call);
      expect(src).toMatch(/issueQrToken/);
    });
  }

  it('check-in verifies the token and refuses a bare UUID', () => {
    const src = read('supabase/functions/check-in/index.ts');
    expect(src).toMatch(/const verifiedId = await verifyQrToken\(scanned\)/);
    expect(src).toMatch(/findEntry\(supabase, req, projectId, \{ id: verifiedId \}\)/);
    // 未検証の値で直接引かない
    expect(src).not.toMatch(/\.eq\('id', entryId\)/);
  });

  // 受付番号フォールバックは残すが、参加者に向いた受付画面(checkin.html)からは外し、
  // 運営専用ページ + owner/admin 限定 + 照会を挟む2段階に移した。
  // entry_number は public_entry_list で anon に公開されており、認証材料にならないため。
  it('check-in keeps a receipt-number fallback, but only on the staff-only path', () => {
    const src = read('supabase/functions/check-in/index.ts');
    expect(src).toMatch(/entryNumber: number/);
    expect(src).toMatch(/query\.eq\('entry_number', by\.entryNumber\)/);

    // QR 経路(check)では番号を一切見ない
    const checkBranch = src.slice(
      src.indexOf("if (action === 'check')"),
      src.indexOf("if (action === 'lookup')"),
    );
    expect(checkBranch).not.toMatch(/entryNumber/);

    // 番号起点の経路は運営限定で、照会で得た id との一致を要求する
    expect(src).toMatch(/const STAFF_ONLY_ROLES: Role\[\] = \['owner', 'admin'\]/);
    expect(src).toMatch(/String\(entry\.id\) !== String\(confirmedEntryId\)/);
  });
});

describe('the public entry list no longer exposes entry UUIDs (V7)', () => {
  it('migration revokes blanket SELECT and re-grants without entry_id', () => {
    const mig = readFileSync(resolve(ROOT, 'supabase/migrations/202607260002_hide_public_entry_uuid.sql'), 'utf8');
    expect(mig).toMatch(/revoke select on public\.public_entry_list from anon, authenticated/);
    const grant = mig.match(/grant select \(([\s\S]*?)\) on public\.public_entry_list/);
    expect(grant).toBeTruthy();
    expect(grant[1]).not.toMatch(/entry_id/);
  });

  it('the public-list query no longer selects or exposes entry_id', () => {
    const src = readFileSync(resolve(ROOT, 'js/supabase_api.js'), 'utf8');
    expect(src).not.toMatch(/uuid: row\.entry_id/);
    // 公開リストの取得クエリだけを見る(answer_pages 等の管理者専用テーブルは entry_id を使ってよい)
    const publicQuery = src.slice(src.indexOf('async getPublicEntries'), src.indexOf('subscribePublicEntries'));
    expect(publicQuery).toMatch(/from\('public_entry_list'\)/);
    expect(publicQuery).not.toMatch(/entry_id/);
  });
});
