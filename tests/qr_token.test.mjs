// V8: 当日受付QRの受付コードを、実装を直接 import して検証する。
//
// qr_token.ts は署名鍵を Deno.env から取るため、Node(vitest)では Deno グローバルをスタブして実行する。
// HMAC・SHA-256 は WebCrypto(crypto.subtle)で、Node 18+ でもそのまま動作する。

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SECRET = 'test-signing-secret-0123456789abcdef';   // 32文字以上（V1 の下限を満たす）
const OTHER_SECRET = 'another-signing-secret-0123456789abcdef';
const ENTRY_ID = '080410bf-8742-4a6b-80db-139a680e3e53';
const OTHER_ID = '0909e458-681c-4b4f-9d8e-f8ec6806c9d0';

let deriveCheckinCode, normalizeCheckinCode, hashCheckinCode, ensureCheckinCode;
const withSecret = (secret) => { globalThis.Deno = { env: { get: (k) => (k === 'CIQ_EMAIL_SIGNING_SECRET' ? secret : undefined) } }; };

beforeAll(async () => {
  withSecret(SECRET);
  ({ deriveCheckinCode, normalizeCheckinCode, hashCheckinCode, ensureCheckinCode } = await import('../supabase/functions/_shared/qr_token.ts'));
});

describe('check-in codes (V8)', () => {
  it('is 20 base32 characters and does not contain the entry id', async () => {
    const code = await deriveCheckinCode(ENTRY_ID);
    expect(code).toMatch(/^[A-Z2-7]{20}$/);
    expect(code.toLowerCase()).not.toContain(ENTRY_ID.slice(0, 8).replace(/-/g, ''));
    expect(code).not.toBe(ENTRY_ID);
  });

  it('is deterministic: the same entry and rotation always get the same code (no expiry)', async () => {
    expect(await deriveCheckinCode(ENTRY_ID)).toBe(await deriveCheckinCode(ENTRY_ID, 0));
    expect(await deriveCheckinCode(ENTRY_ID)).toBe(await deriveCheckinCode(ENTRY_ID.toUpperCase()));
  });

  it('differs per entry, per rotation and per signing secret', async () => {
    const base = await deriveCheckinCode(ENTRY_ID);
    expect(await deriveCheckinCode(OTHER_ID)).not.toBe(base);
    expect(await deriveCheckinCode(ENTRY_ID, 1)).not.toBe(base);
    withSecret(OTHER_SECRET);
    const otherKey = await deriveCheckinCode(ENTRY_ID);
    withSecret(SECRET);
    expect(otherKey).not.toBe(base);
  });

  it('refuses a non-UUID entry id, a bad rotation and a missing signing secret', async () => {
    await expect(deriveCheckinCode('abc')).rejects.toThrow();
    await expect(deriveCheckinCode(ENTRY_ID, -1)).rejects.toThrow();
    await expect(deriveCheckinCode(ENTRY_ID, 1.5)).rejects.toThrow();
    withSecret('');
    await expect(deriveCheckinCode(ENTRY_ID)).rejects.toThrow();
    withSecret(SECRET);
  });

  it('spreads over the whole alphabet and has no obvious bias (100 bits taken from the HMAC)', async () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      for (const ch of await deriveCheckinCode(id)) seen.add(ch);
    }
    expect(seen.size).toBe(32);
  });

  it('has no collisions across a few thousand entries', async () => {
    const codes = new Set();
    for (let i = 0; i < 2000; i++) codes.add(await deriveCheckinCode(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`));
    expect(codes.size).toBe(2000);
  });

  it('binds a purpose+version tag so codes cannot cross protocols', () => {
    const src = readFileSync(resolve(ROOT, 'supabase/functions/_shared/qr_token.ts'), 'utf8');
    expect(src).toMatch(/const TOKEN_VERSION = 'qr4'/);
    expect(src).toMatch(/`\$\{TOKEN_VERSION\}:\$\{id\}:\$\{rotation\}`/);
    expect(src).toMatch(/const HASH_PREFIX = 'ciq-checkin:'/);
  });

  it('is exactly 20 uppercase alphanumeric-mode characters, the capacity of QR version 1 with error correction M', async () => {
    const code = await deriveCheckinCode(ENTRY_ID);
    // version 1-M の英数字モードの容量は 20 文字。英数字モード: 0-9 A-Z 空白 $%*+-./:
    expect(code.length).toBe(20);
    expect(code).toMatch(/^[0-9A-Z]+$/);
  });
});

describe('normalizing what the reader returned', () => {
  it('accepts the code in any case with surrounding whitespace', async () => {
    const code = await deriveCheckinCode(ENTRY_ID);
    expect(normalizeCheckinCode(code)).toBe(code);
    expect(normalizeCheckinCode(` ${code.toLowerCase()}\r\n`)).toBe(code);
  });

  it('rejects the old formats, a bare UUID, wrong length, characters outside base32 and non-strings', async () => {
    const code = await deriveCheckinCode(ENTRY_ID);
    const sig = 'a'.repeat(32);
    for (const bad of [
      '', 'abc', ENTRY_ID, `${ENTRY_ID}.${sig}`, `${ENTRY_ID}.${Date.now() + 1e9}.${sig}${sig}`,
      code.slice(1), `${code}A`, `${code.slice(1)}1`, `${code.slice(1)}0`, `${code.slice(1)}8`, `${code.slice(1)}-`,
      `${code.slice(0, 10)} ${code.slice(10)}`,
    ]) {
      expect(normalizeCheckinCode(bad), bad).toBeNull();
    }
    for (const bad of [null, undefined, 12, {}, []]) expect(normalizeCheckinCode(bad)).toBeNull();
  });
});

describe('the stored hash', () => {
  it('is a sha256 hex digest, different from the code and per code', async () => {
    const code = await deriveCheckinCode(ENTRY_ID);
    const hash = await hashCheckinCode(code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(code.toLowerCase());
    expect(await hashCheckinCode(code)).toBe(hash);
    expect(await hashCheckinCode(await deriveCheckinCode(OTHER_ID))).not.toBe(hash);
  });

  it('migration adds the columns, a per-project unique index, and a trigger that keeps them server-only', () => {
    const mig = readFileSync(resolve(ROOT, 'supabase/migrations/202610160002_checkin_code_hash.sql'), 'utf8');
    expect(mig).toMatch(/add column if not exists checkin_token_hash text/);
    expect(mig).toMatch(/add column if not exists checkin_token_rotation integer not null default 0/);
    expect(mig).toMatch(/checkin_token_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
    expect(mig).toMatch(/unique index if not exists entries_checkin_token_hash_unique[\s\S]*\(project_id, checkin_token_hash\)/);
    expect(mig).toMatch(/current_user in \('anon', 'authenticated'\)/);
    expect(mig).toMatch(/before insert or update on public\.entries/);
    // 画面(authenticated)の select 権限に、この 2 列を加えない
    expect(mig).not.toMatch(/grant\s+select/i);
  });
});

describe('ensureCheckinCode keeps the stored hash in step with the code', () => {
  const makeStore = (row) => {
    const writes = [];
    const rows = row ? [row] : [];
    const store = {
      writes,
      from: () => {
        const st = { id: null, patch: null };
        const api = {
          select: () => api,
          update: (patch) => { st.patch = patch; return api; },
          eq: (_k, v) => { st.id = v; return api; },
          single: () => {
            const found = rows.find((r) => r.id === st.id);
            return Promise.resolve(found ? { data: { ...found }, error: null } : { data: null, error: { message: 'none' } });
          },
          then: (resolve, reject) => {
            const found = rows.find((r) => r.id === st.id);
            if (found && st.patch) { Object.assign(found, st.patch); writes.push(st.patch); }
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          },
        };
        return api;
      },
    };
    return store;
  };

  it('writes the hash on first display, and nothing when it already matches', async () => {
    const row = { id: ENTRY_ID, checkin_token_hash: null, checkin_token_rotation: 0 };
    const store = makeStore(row);
    const code = await ensureCheckinCode(store, ENTRY_ID);
    expect(code).toBe(await deriveCheckinCode(ENTRY_ID));
    expect(row.checkin_token_hash).toBe(await hashCheckinCode(code));
    expect(store.writes).toHaveLength(1);
    expect(await ensureCheckinCode(store, ENTRY_ID)).toBe(code);
    expect(store.writes).toHaveLength(1);
  });

  it('follows rotation: the next display replaces the stored hash, so the old code stops working', async () => {
    const row = { id: ENTRY_ID, checkin_token_hash: null, checkin_token_rotation: 0 };
    const store = makeStore(row);
    const first = await ensureCheckinCode(store, ENTRY_ID);
    row.checkin_token_rotation = 1;
    const second = await ensureCheckinCode(store, ENTRY_ID);
    expect(second).not.toBe(first);
    expect(row.checkin_token_hash).toBe(await hashCheckinCode(second));
    expect(row.checkin_token_hash).not.toBe(await hashCheckinCode(first));
  });

  it('follows a signing-secret change the same way', async () => {
    const row = { id: ENTRY_ID, checkin_token_hash: null, checkin_token_rotation: 0 };
    const store = makeStore(row);
    const before = await ensureCheckinCode(store, ENTRY_ID);
    withSecret(OTHER_SECRET);
    const after = await ensureCheckinCode(store, ENTRY_ID);
    withSecret(SECRET);
    expect(after).not.toBe(before);
    expect(row.checkin_token_hash).toBe(await hashCheckinCode(after));
  });

  it('returns null for an unknown entry', async () => {
    expect(await ensureCheckinCode(makeStore(null), ENTRY_ID)).toBeNull();
  });
});

describe('the QR image is generated small', () => {
  const qrSrc = readFileSync(resolve(ROOT, 'supabase/functions/_shared/qr.ts'), 'utf8');

  it('upper-cases the value so it is encoded in alphanumeric mode', () => {
    expect(qrSrc).toMatch(/String\(value\)\.toUpperCase\(\)/);
  });

  it('uses error correction level M (the highest that still fits a 20-character code in version 1)', () => {
    expect(qrSrc).toMatch(/errorCorrectionLevel: 'M'/);
  });
});

describe('QR generation paths embed the check-in code, never the raw UUID (V8)', () => {
  const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

  for (const [fn, call] of Object.entries({
    'my-entry': /ensureCheckinCode\(supabase, entryId\)[\s\S]*makeQrSvg\(checkinCode\)/,
    'admin-entry-qr': /ensureCheckinCode\(supabase, String\(entry\.id\)\)[\s\S]*makeQrSvg\(code\)/,
    'checkin-qr': /ensureCheckinCode\(createServiceClient\(\), data\)[\s\S]*makeQrSvg\(code\)/,
  })) {
    it(`${fn}: encodes the check-in code and syncs the stored hash`, () => {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src).toMatch(call);
          });
  }

  it('check-in looks the code up by project and hash, and refuses a bare UUID', () => {
    const src = read('supabase/functions/check-in/index.ts');
    expect(src).toMatch(/const code = normalizeCheckinCode\(scanned\)/);
    expect(src).toMatch(/hashCheckinCode\(code\)/);
    expect(src).toMatch(/rpc\('check_in_by_code'/);
    expect(src).toMatch(/\.eq\('project_id', projectId\)/);
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
