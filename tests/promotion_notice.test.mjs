// 繰り上げ通知の自動送信（FND-14）。サーバーが宛先を復号して送り、状態を更新することを確かめる。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

describe('promotion_notice（処理の本体）', () => {
  const src = read('supabase/functions/_shared/promotion_notice.ts');

  it('「送信待ち」から「送信中」にできたものだけを処理する（二重送信を防ぐ）', () => {
    expect(src).toMatch(/\.update\(\{ waitlist_promotion_notice: 'sending' \}\)[\s\S]*\.eq\('waitlist_promotion_notice', 'pending'\)/);
    expect(src).toMatch(/claimed\.length === 0/);
  });

  it('途中で止まった「送信中」は取り直す', () => {
    expect(src).toMatch(/STALE_SENDING_MS/);
    expect(src).toMatch(/\.lt\('updated_at', staleBefore\)/);
  });

  it('通知の対象は、登録済みか遅刻の人だけ（キャンセル・キャンセル待ちには送らない）', () => {
    expect(src).toMatch(/\.in\('status', \['registered', 'late'\]\)/);
  });

  it('復号した個人情報や宛先をログに出さない', () => {
    for (const m of src.matchAll(/console\.(log|error|warn)\(([^;]*)\)/g)) {
      expect(m[2]).not.toMatch(/email|pii|familyName|firstName/);
    }
    expect(src).toMatch(/error\.name/);
  });

  it('失敗は failed にして、1 件の失敗で残りを止めない', () => {
    expect(src).toMatch(/setState\(String\(row\.id\), 'failed'\)/);
    expect(src).toMatch(/for \(const row of rows/);
  });

  it('合言葉が未設定なら、呼び出し元を止めずに何もしない', () => {
    expect(src).toMatch(/if \(!secret \|\| !base \|\| !projectId\) return/);
  });
});

describe('send-email の process_promotions', () => {
  const full = read('supabase/functions/send-email/index.ts');
  const block = full.slice(full.indexOf("if (type === 'process_promotions')"), full.indexOf('if (!type || !to)'));

  it('呼べるのは、合言葉を持つ内部の処理か、その大会の管理者だけ', () => {
    expect(block).toMatch(/safeEqual\(given, cronSecret\)/);
    expect(block).toMatch(/requireAdminMember\(supabase, scopeProjectId/);
    expect(block).toMatch(/Boolean\(cronSecret\)/);
  });

  it('管理者は自分の大会しか指定できない（大会の指定が必須）', () => {
    expect(block).toMatch(/if \(!scopeProjectId\) return jsonResponse/);
  });

  it('既存の繰り上げ文面と送信記録（email_events）を使う', () => {
    expect(block).toMatch(/waitlistPromoted\(/);
    expect(block).toMatch(/recordAndSend\(/);
    expect(block).toMatch(/template: 'waitlist_promoted'/);
  });
});

describe('呼び出し元', () => {
  it('キャンセルと編集のあとに、繰り上げ通知を始める', () => {
    expect(read('supabase/functions/cancel-entry/index.ts')).toMatch(/triggerPromotionNotices\(projectId\)/);
    expect(read('supabase/functions/edit-entry/index.ts')).toMatch(/triggerPromotionNotices\(projectId\)/);
  });

  it('管理画面はブラウザで宛先を復号して送らず、サーバーに依頼する', () => {
    const admin = read('js/admin_settings.js');
    expect(admin).toMatch(/CIQSupabaseAPI\.processPromotionNotices\(projectId\)/);
    expect(admin).not.toMatch(/CIQEmail\.sendWaitlistPromotion/);
    expect(read('js/email.js')).not.toMatch(/sendWaitlistPromotion/);
  });

  it('定期実行が取りこぼしを拾う', () => {
    expect(read('cloudflare/keepalive/src/index.js')).toMatch(/process_promotions/);
    expect(read('cloudflare/keepalive/wrangler.toml')).toMatch(/\*\/5 \* \* \* \*/);
  });
});

describe('pii_decrypt', () => {
  it('ブラウザの AppCrypto と同じ形式（IV12 + 鍵長2 + 鍵 + 本文）で復号する', () => {
    const src = read('supabase/functions/_shared/pii_decrypt.ts');
    expect(src).toMatch(/slice\(0, 12\)/);
    expect(src).toMatch(/combined\[12\] << 8\) \| combined\[13\]/);
    expect(src).toMatch(/RSA-OAEP/);
  });
});

describe('pii_decrypt（実際にブラウザの暗号化と突き合わせる）', () => {
  it('AppCrypto.encryptRSA で暗号化したものを、サーバー側の decryptPii で復号できる', async () => {
    const { decryptPii } = await import('../supabase/functions/_shared/pii_decrypt.ts');
    const source = read('js/crypto.js').replace(/^const AppCrypto =/m, 'globalThis.AppCrypto =').replace(/window\.AppCrypto = AppCrypto;/, '');
    new Function(source)();
    const { publicKeyJwk, privateKeyJwk } = await globalThis.AppCrypto.generateRSAKeyPair();
    const pii = { email: 'taro@example.com', familyName: '山田', firstName: '太郎' };
    const encrypted = await globalThis.AppCrypto.encryptRSA(JSON.stringify(pii), publicKeyJwk);
    expect(await decryptPii(encrypted, privateKeyJwk)).toEqual(pii);
  });
});

// 小さな偽の DB（entries と project_private_keys だけ）で、処理の流れを動かして確かめる。
function fakeSupabase(tables) {
  function builder(table) {
    const state = { filters: [], patch: null, limit: null, selectCols: false };
    const run = () => {
      let rows = tables[table].filter((r) => state.filters.every((f) => f(r)));
      if (state.patch) {
        rows.forEach((r) => Object.assign(r, state.patch));
      }
      if (state.limit != null) rows = rows.slice(0, state.limit);
      return { data: rows.map((r) => ({ ...r })), error: null };
    };
    const api = {
      select: () => { state.selectCols = true; return api; },
      update: (patch) => { state.patch = patch; return api; },
      eq: (k, v) => { state.filters.push((r) => r[k] === v); return api; },
      in: (k, vs) => { state.filters.push((r) => vs.includes(r[k])); return api; },
      lt: (k, v) => { state.filters.push((r) => r[k] < v); return api; },
      order: () => api,
      limit: (n) => { state.limit = n; return api; },
      maybeSingle: () => Promise.resolve({ data: run().data[0] ?? null, error: null }),
      then: (resolve) => resolve(run()),
    };
    return api;
  }
  return { from: builder };
}

describe('processPromotionNotices（流れを動かす）', () => {
  async function setup(entryOverrides = {}, keyRow = true) {
    const { processPromotionNotices } = await import('../supabase/functions/_shared/promotion_notice.ts');
    const { wrapPrivateKey } = await import('../supabase/functions/_shared/project_key.ts');
    const source = read('js/crypto.js').replace(/^const AppCrypto =/m, 'globalThis.AppCrypto =').replace(/window\.AppCrypto = AppCrypto;/, '');
    new Function(source)();
    process.env.PROJECT_KEY_ENCRYPTION_SECRET = 'x'.repeat(40);
    globalThis.Deno ??= { env: { get: (k) => process.env[k] } };
    const { publicKeyJwk, privateKeyJwk } = await globalThis.AppCrypto.generateRSAKeyPair();
    const encrypted = await globalThis.AppCrypto.encryptRSA(JSON.stringify({ email: 'a@example.com', familyName: '山田', firstName: '太郎' }), publicKeyJwk);
    const tables = {
      entries: [
        { id: 'e1', project_id: 'p1', entry_number: 7, status: 'registered', waitlist_promotion_notice: 'pending', encrypted_pii: encrypted, updated_at: new Date().toISOString(), created_at: '1', ...entryOverrides },
      ],
      project_private_keys: keyRow ? [{ project_id: 'p1', encrypted_private_key: await wrapPrivateKey(privateKeyJwk) }] : [],
    };
    return { tables, supabase: fakeSupabase(tables), processPromotionNotices };
  }

  it('宛先を復号して送り、sent にする', async () => {
    const { tables, supabase, processPromotionNotices } = await setup();
    const sent = [];
    const result = await processPromotionNotices(supabase, { send: async (item) => { sent.push(item); } });
    expect(result).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(sent[0]).toMatchObject({ email: 'a@example.com', familyName: '山田', entryNumber: 7, projectId: 'p1' });
    expect(tables.entries[0].waitlist_promotion_notice).toBe('sent');
  });

  it('送れなかったら failed にして、そのまま再送しない', async () => {
    const { tables, supabase, processPromotionNotices } = await setup();
    let calls = 0;
    const send = async () => { calls += 1; throw new Error('boom'); };
    expect(await processPromotionNotices(supabase, { send })).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(tables.entries[0].waitlist_promotion_notice).toBe('failed');
    await processPromotionNotices(supabase, { send });
    expect(calls).toBe(1);
  });

  it('鍵が保存されていなければ failed（送らない）', async () => {
    const { tables, supabase, processPromotionNotices } = await setup({}, false);
    let calls = 0;
    const result = await processPromotionNotices(supabase, { send: async () => { calls += 1; } });
    expect(result.failed).toBe(1);
    expect(calls).toBe(0);
    expect(tables.entries[0].waitlist_promotion_notice).toBe('failed');
  });

  it('キャンセル済み・キャンセル待ちの人には送らない', async () => {
    for (const status of ['canceled', 'waitlist']) {
      const { tables, supabase, processPromotionNotices } = await setup({ status });
      let calls = 0;
      await processPromotionNotices(supabase, { send: async () => { calls += 1; } });
      expect(calls).toBe(0);
      expect(tables.entries[0].waitlist_promotion_notice).toBe('pending');
    }
  });

  it('すでに送信中・送信済みのものは取らない', async () => {
    for (const state of ['sending', 'sent']) {
      const { supabase, processPromotionNotices } = await setup({ waitlist_promotion_notice: state });
      let calls = 0;
      await processPromotionNotices(supabase, { send: async () => { calls += 1; } });
      expect(calls).toBe(0);
    }
  });

  it('止まったまま古くなった送信中は、取り直して送る', async () => {
    const old = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { supabase, processPromotionNotices, tables } = await setup({ waitlist_promotion_notice: 'sending', updated_at: old });
    let calls = 0;
    await processPromotionNotices(supabase, { send: async () => { calls += 1; } });
    expect(calls).toBe(1);
    expect(tables.entries[0].waitlist_promotion_notice).toBe('sent');
  });
});
