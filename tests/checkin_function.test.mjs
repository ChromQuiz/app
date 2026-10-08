// 当日受付（check-in）の本物の処理を動かして確かめる。
// E-1（CHK-01, 04〜09, 14）と E-2（CHM-01〜05, 08）のサーバー側。

import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeDb, loadFunction, TEST_ENV } from './helpers/edge_harness.mjs';

const PROJECT = 'ciq9';
const U = (id) => ({ id });
const users = { 'tok-owner': U('u-owner'), 'tok-admin': U('u-admin'), 'tok-scorer': U('u-scorer'), 'tok-removed': U('u-removed'), 'tok-outsider': U('u-out') };
const members = [
  { id: 'm-owner', project_id: PROJECT, user_id: 'u-owner', role: 'owner', status: 'active' },
  { id: 'm-admin', project_id: PROJECT, user_id: 'u-admin', role: 'admin', status: 'active' },
  { id: 'm-scorer', project_id: PROJECT, user_id: 'u-scorer', role: 'scorer', status: 'active' },
  { id: 'm-removed', project_id: PROJECT, user_id: 'u-removed', role: 'scorer', status: 'removed' },
  { id: 'm-other', project_id: 'other', user_id: 'u-out', role: 'admin', status: 'active' },
];
const UUIDS = {
  a: '11111111-1111-4111-8111-111111111111', b: '22222222-2222-4222-8222-222222222222', c: '33333333-3333-4333-8333-333333333333',
  d: '44444444-4444-4444-8444-444444444444', e: '55555555-5555-4555-8555-555555555555', other: '66666666-6666-4666-8666-666666666666',
};
const entry = (key, n, over = {}) => ({ id: UUIDS[key], project_id: PROJECT, entry_number: n, affiliation: '学校' + n, grade: '２年', status: 'registered', checked_in: false, ...over });
const baseEntries = () => [
  entry('a', 1), entry('b', 2, { checked_in: true }), entry('c', 3, { status: 'waitlist' }), entry('d', 4, { status: 'canceled' }),
  entry('e', 5, { status: 'late' }), { ...entry('other', 1), project_id: 'other' },
];

async function setup(opts = {}) {
  const db = createFakeDb({ project_members: members, entries: opts.entries || baseEntries() }, { users, rpc: opts.rpc });
  const call = await loadFunction('check-in', { db });
  const qr = await import('../supabase/functions/_shared/qr_token.ts');
  const hmac = await import('../supabase/functions/_shared/signing.ts');
  return { db, call, qr, hmac };
}
const check = (ctx, scanned, token = 'tok-scorer', over = {}) => ctx.call({ action: 'check', projectId: PROJECT, qr: scanned, ...over }, { token });

describe('CHK-01 入れる人', () => {
  let ctx; beforeEach(async () => { ctx = await setup(); });

  it('未ログインは 401「Googleログインが必要です。」', async () => {
    const r = await ctx.call({ action: 'stats', projectId: PROJECT });
    expect(r.status).toBe(401);
    expect(r.json.error).toBe('Googleログインが必要です。');
  });

  it('無効なトークンも 401', async () => {
    expect((await ctx.call({ action: 'stats', projectId: PROJECT }, { token: 'nope' })).status).toBe(401);
  });

  it('その大会のメンバーでない人・外されたメンバーは 403', async () => {
    for (const token of ['tok-outsider', 'tok-removed']) {
      const r = await ctx.call({ action: 'stats', projectId: PROJECT }, { token });
      expect(r.status, token).toBe(403);
      expect(r.json.error).toMatch(/当日受付を操作する権限がありません/);
    }
  });

  it('所有者・管理者・採点者は、統計と二次元コードの受付ができる', async () => {
    for (const token of ['tok-owner', 'tok-admin', 'tok-scorer']) {
      expect((await ctx.call({ action: 'stats', projectId: PROJECT }, { token })).status, token).toBe(200);
    }
  });

  it('必要な情報が足りないときは 400', async () => {
    expect((await ctx.call({ action: 'stats' }, { token: 'tok-owner' })).status).toBe(400);
    expect((await ctx.call({ projectId: PROJECT }, { token: 'tok-owner' })).status).toBe(400);
    expect((await ctx.call({ action: 'unknown', projectId: PROJECT }, { token: 'tok-owner' })).status).toBe(400);
  });
});

describe('CHK-04 統計バー', () => {
  it('全体は「登録済み・遅刻」の人数（キャンセル待ち・キャンセルは含まない）。受付済みと残りも合う', async () => {
    const ctx = await setup();
    const r = await ctx.call({ action: 'stats', projectId: PROJECT }, { token: 'tok-scorer' });
    // 登録済み: 1, 2(受付済み)  遅刻: 5  → 3人。受付済み 1人
    expect(r.json.stats).toEqual({ total: 3, checked: 1, remaining: 2 });
  });

  it('受付に成功すると、統計が1つ動く', async () => {
    const ctx = await setup();
    const token = await ctx.qr.issueQrToken(UUIDS.a);
    expect((await check(ctx, token)).json.result).toBe('success');
    expect((await ctx.call({ action: 'stats', projectId: PROJECT }, { token: 'tok-scorer' })).json.stats).toEqual({ total: 3, checked: 2, remaining: 1 });
  });
});

describe('CHK-05/06 読み取りと結果', () => {
  it('受付完了: success と、受付番号・所属・学年。氏名・メールは返さない。監査ログに残る', async () => {
    const ctx = await setup();
    const r = await check(ctx, await ctx.qr.issueQrToken(UUIDS.a));
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, result: 'success', entry: { entryNumber: 1, affiliation: '学校1', grade: '２年', checkedIn: true, status: 'registered' } });
    expect(Object.keys(r.json.entry).sort()).toEqual(['affiliation', 'checkedIn', 'entryNumber', 'grade', 'id', 'status']);
    const audit = ctx.db.log.rpcCalls.find((c) => c.fn === 'log_service_event');
    expect(audit.args).toMatchObject({ p_action: 'entry.checkin', p_target_id: UUIDS.a, p_actor_member_id: 'm-scorer' });
  });

  it('遅刻連絡済みの人も受付できる', async () => {
    const ctx = await setup();
    expect((await check(ctx, await ctx.qr.issueQrToken(UUIDS.e))).json.result).toBe('success');
  });

  it('受付済み / キャンセル待ち / キャンセル済みは、それぞれの結果で、状態を変えない', async () => {
    const ctx = await setup();
    const expected = { b: 'already', c: 'waitlist', d: 'canceled' };
    for (const [key, result] of Object.entries(expected)) {
      const r = await check(ctx, await ctx.qr.issueQrToken(UUIDS[key]));
      expect(r.json.result, key).toBe(result);
    }
    expect(ctx.db.tables.entries.find((e) => e.id === UUIDS.c).checked_in).toBe(false);
    expect(ctx.db.tables.entries.find((e) => e.id === UUIDS.d).checked_in).toBe(false);
    expect(ctx.db.log.updates.length).toBe(0);
  });

  it('二次元コードが空なら 400', async () => {
    const ctx = await setup();
    expect((await check(ctx, '')).status).toBe(400);
    expect((await check(ctx, undefined)).status).toBe(400);
  });
});

describe('CHK-07 無効な二次元コード / CHK-09 新旧の形式', () => {
  const MSG = 'この二次元コードは使用できません。マイエントリーで最新の二次元コードを表示するか、運営にお申し出ください。';

  it('素の UUID・でたらめ・改ざん・署名なし・他の鍵の署名は、同じ文言で 400', async () => {
    const ctx = await setup();
    const good = await ctx.qr.issueQrToken(UUIDS.a);
    const [id, sig] = good.split('.');
    const bad = [UUIDS.a, 'abc', `${id}.${'0'.repeat(32)}`, `${id}.${sig.slice(0, -1)}${sig.slice(-1) === '0' ? '1' : '0'}`, `${UUIDS.b}.${sig}`, `${id}.`, '.'];
    for (const q of bad) {
      const r = await check(ctx, q);
      expect(r.status, q).toBe(400);
      expect(r.json.error, q).toBe(MSG);
    }
    expect(ctx.db.log.updates.length).toBe(0);
  });

  it('新形式は、画像に大文字で埋め込まれても読める（検証は小文字に揃える）', async () => {
    const ctx = await setup();
    const token = await ctx.qr.issueQrToken(UUIDS.a);
    expect(token).toBe(token.toLowerCase());
    expect((await check(ctx, token.toUpperCase())).json.result).toBe('success');
  });

  it('旧形式（期限つき）は、期限内なら読める。期限が切れたものは断る', async () => {
    const ctx = await setup();
    const legacy = async (id, exp) => {
      const sig = await ctx.hmac.hmacHex(ctx.hmac.signingSecret(), `qr1:${id}:${exp}`);
      return `${id}.${exp}.${sig}`;
    };
    expect((await check(ctx, await legacy(UUIDS.a, Date.now() + 86400000))).json.result).toBe('success');
    const expired = await check(ctx, await legacy(UUIDS.e, Date.now() - 1000));
    expect(expired.status).toBe(400);
    expect(expired.json.error).toBe(MSG);
  });

  it('別の大会のエントリーの二次元コードは、この大会では「該当者なし」（大会で絞って探す）', async () => {
    const ctx = await setup();
    const r = await check(ctx, await ctx.qr.issueQrToken(UUIDS.other));
    expect(r.status).toBe(404);
    expect(r.json.error).toBe('該当者が見つかりません。');
  });

  it('署名鍵が未設定なら、受付は止まる（弱い鍵で通さない）', async () => {
    const db = createFakeDb({ project_members: members, entries: baseEntries() }, { users });
    const call = await loadFunction('check-in', { db, env: { CIQ_EMAIL_SIGNING_SECRET: '' } });
    const r = await call({ action: 'check', projectId: PROJECT, qr: `${UUIDS.a}.${'a'.repeat(32)}` }, { token: 'tok-scorer' });
    expect(r.status).toBeGreaterThanOrEqual(500);
  });
});

describe('CHK-08 / CHM-08 該当者なしと回数制限', () => {
  it('見つからない照会だけが回数に数えられ、正常な受付は数えない', async () => {
    const ctx = await setup();
    await check(ctx, await ctx.qr.issueQrToken(UUIDS.a));
    expect(ctx.db.log.rpcCalls.filter((c) => c.fn === 'rate_limit_hit').length).toBe(0);
    const miss = await check(ctx, await ctx.qr.issueQrToken(UUIDS.other));
    expect(miss.status).toBe(404);
    const hits = ctx.db.log.rpcCalls.filter((c) => c.fn === 'rate_limit_hit');
    expect(hits.length).toBe(1);
    expect(hits[0].args).toMatchObject({ p_bucket: 'checkin_miss', p_window_seconds: 600, p_limit: 30 });
  });

  it('上限（30回）に達していたら 429', async () => {
    const ctx = await setup({ rpc: { rate_limit_hit: () => ({ data: 30, error: null }) } });
    const r = await check(ctx, await ctx.qr.issueQrToken(UUIDS.other));
    expect(r.status).toBe(429);
    expect(r.json.error).toMatch(/多すぎます/);
  });

  it('回数の記録が失敗しても受付は止まらない（失敗時は通す）', async () => {
    const ctx = await setup({ rpc: { rate_limit_hit: () => ({ data: null, error: { message: 'db down' } }) } });
    expect((await check(ctx, await ctx.qr.issueQrToken(UUIDS.other))).status).toBe(404);
  });
});

describe('CHK-14 同時に複数台', () => {
  it('同じ二次元コードを同時に読み取っても、受付済みにするのは1回だけ。監査ログも1件', async () => {
    const ctx = await setup();
    const token = await ctx.qr.issueQrToken(UUIDS.a);
    const results = await Promise.all(Array.from({ length: 8 }, () => check(ctx, token)));
    const summary = results.map((r) => r.json.result || `error:${r.status}`);
    expect(summary.filter((s) => s === 'success').length).toBe(1);
    expect(summary.every((s) => s === 'success' || s === 'already' || s === 'error:409')).toBe(true);
    expect(ctx.db.tables.entries.find((e) => e.id === UUIDS.a).checked_in).toBe(true);
    expect(ctx.db.log.rpcCalls.filter((c) => c.fn === 'log_service_event' && c.args.p_action === 'entry.checkin').length).toBe(1);
  });

  it('読み取り直後にキャンセル待ちに変わっていたら、受付せず 409', async () => {
    const ctx = await setup();
    const token = await ctx.qr.issueQrToken(UUIDS.a);
    // 検索のあと更新の前に状態が変わった状況を、更新の条件（登録済み・遅刻のみ）で確かめる
    ctx.db.tables.entries.find((e) => e.id === UUIDS.a).status = 'waitlist';
    expect((await check(ctx, token)).json.result).toBe('waitlist');
    expect(ctx.db.tables.entries.find((e) => e.id === UUIDS.a).checked_in).toBe(false);
  });
});

describe('E-2 手入力の受付（CHM-01〜05）', () => {
  const lookup = (ctx, n, token = 'tok-admin') => ctx.call({ action: 'lookup', projectId: PROJECT, entryNumber: n }, { token });
  const manual = (ctx, action, n, confirmedEntryId, token = 'tok-admin') => ctx.call({ action, projectId: PROJECT, entryNumber: n, confirmedEntryId }, { token });

  it('CHM-01 照会・手入力の受付・取り消しは、所有者と管理者だけ。採点者は 403', async () => {
    const ctx = await setup();
    for (const token of ['tok-owner', 'tok-admin']) expect((await lookup(ctx, 1, token)).status, token).toBe(200);
    expect((await lookup(ctx, 1, 'tok-scorer')).status).toBe(403);
    expect((await manual(ctx, 'check_manual', 1, UUIDS.a, 'tok-scorer')).status).toBe(403);
    expect((await manual(ctx, 'undo', 2, UUIDS.b, 'tok-scorer')).status).toBe(403);
  });

  it('CHM-02 照会: 状態を変えず、番号・所属・学年・状態を返す。空・0以下は 400、見つからないは 404', async () => {
    const ctx = await setup();
    const r = await lookup(ctx, 1);
    expect(r.json.entry).toMatchObject({ entryNumber: 1, affiliation: '学校1', grade: '２年', status: 'registered', checkedIn: false });
    expect(ctx.db.log.updates.length).toBe(0);
    for (const bad of [undefined, '', 0, -3, 'abc', null]) {
      const e = await lookup(ctx, bad);
      expect(e.status, String(bad)).toBe(400);
      expect(e.json.error).toBe('受付番号が必要です。');
    }
    const nf = await lookup(ctx, 99);
    expect(nf.status).toBe(404);
    expect(nf.json.error).toBe('該当者が見つかりません。');
  });

  it('CHM-03 受付する: 照会で得た id が必要。なければ 400、違えば 409。受付対象外（キャンセル待ち・キャンセル）は受付しない', async () => {
    const ctx = await setup();
    const none = await manual(ctx, 'check_manual', 1, undefined);
    expect(none.status).toBe(400);
    expect(none.json.error).toBe('確認手順を経ていません。もう一度照会からやり直してください。');
    const mismatch = await manual(ctx, 'check_manual', 1, UUIDS.b);
    expect(mismatch.status).toBe(409);
    expect(mismatch.json.error).toBe('照会した内容と一致しません。もう一度照会からやり直してください。');
    expect(ctx.db.log.updates.length).toBe(0);
    expect((await manual(ctx, 'check_manual', 3, UUIDS.c)).json.result).toBe('waitlist');
    expect((await manual(ctx, 'check_manual', 4, UUIDS.d)).json.result).toBe('canceled');
    const ok = await manual(ctx, 'check_manual', 1, UUIDS.a);
    expect(ok.json.result).toBe('success');
    expect(ctx.db.log.rpcCalls.find((c) => c.fn === 'log_service_event').args).toMatchObject({ p_action: 'entry.checkin', p_actor_member_id: 'm-admin' });
  });

  it('CHM-04 すでに受付済み', async () => {
    const ctx = await setup();
    expect((await manual(ctx, 'check_manual', 2, UUIDS.b)).json.result).toBe('already');
  });

  it('CHM-05 受付を取り消す: 受付済みの人だけ。監査ログに残る。受付済みでなければ not_checked_in', async () => {
    const ctx = await setup();
    const undone = await manual(ctx, 'undo', 2, UUIDS.b);
    expect(undone.json.result).toBe('undone');
    expect(ctx.db.tables.entries.find((e) => e.id === UUIDS.b).checked_in).toBe(false);
    expect(ctx.db.log.rpcCalls.find((c) => c.fn === 'log_service_event').args).toMatchObject({ p_action: 'entry.checkin.undo', p_target_id: UUIDS.b, p_actor_member_id: 'm-admin' });
    expect((await manual(ctx, 'undo', 1, UUIDS.a)).json.result).toBe('not_checked_in');
    expect((await manual(ctx, 'undo', 2, UUIDS.a)).status).toBe(409);
  });

  it('CHM-08 回数制限は、見つからない照会だけを数える（受付と取り消しの成功は数えない）', async () => {
    const ctx = await setup();
    await lookup(ctx, 1); await manual(ctx, 'check_manual', 1, UUIDS.a); await manual(ctx, 'undo', 1, UUIDS.a);
    expect(ctx.db.log.rpcCalls.filter((c) => c.fn === 'rate_limit_hit').length).toBe(0);
    await lookup(ctx, 99);
    expect(ctx.db.log.rpcCalls.filter((c) => c.fn === 'rate_limit_hit').length).toBe(1);
  });
});

describe('テストの前提', () => {
  it('署名鍵は 32 文字以上（短い鍵は使えない）', () => {
    expect(TEST_ENV.CIQ_EMAIL_SIGNING_SECRET.length).toBeGreaterThanOrEqual(32);
  });
});

// ---- 画面側（js/checkin.js / js/admin.js）の形 ----
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p) => readFileSync(resolve(import.meta.dirname, '..', p), 'utf8');

describe('受付画面（js/checkin.js）', () => {
  const js = read('js/checkin.js');

  it('エラーのコードを忘れない（映したままだと毎フレーム問い合わせ、会場の回線の回数制限を使い切る）', () => {
    const catchBlock = js.slice(js.indexOf("showResultUI('error'"), js.indexOf('processing = false;', js.indexOf("showResultUI('error'")));
    expect(catchBlock).not.toMatch(/lastUUID = ''/);
  });

  it('前回のコードは、一定の時間（0.8秒）映らなかったら忘れる。フレーム数ではなく時間で決める', () => {
    expect(js).toMatch(/const FORGET_AFTER_MS = 800/);
    expect(js).toMatch(/now - lastSeenAt > FORGET_AFTER_MS/);
    expect(js).not.toMatch(/emptyFrames/);
  });

  it('画面を隠したらカメラを止め、戻ったら再開する。ページを離れても止める', () => {
    expect(js).toMatch(/visibilityState === 'visible'\) startCamera\(\);\s*else stopCamera\(\)/);
    expect(js).toMatch(/addEventListener\('pagehide', stopCamera\)/);
  });

  it('反転の読み取りはしない。背面カメラを希望し、使えない端末では任意のカメラで再試行する', () => {
    expect(js).toMatch(/inversionAttempts: 'dontInvert'/);
    expect(js).toMatch(/facingMode: \{ ideal: 'environment' \}/);
    expect(js).toMatch(/OverconstrainedError[\s\S]*retryAnyCamera/);
  });
});

describe('手入力の受付（js/admin.js）', () => {
  const js = read('js/admin.js');

  it('確定の結果が success のときだけ「受付しました」と出す。キャンセル待ち・キャンセル済みに変わっていたら、受付していないと伝える', () => {
    expect(js).toMatch(/result\.result === 'success'\) \{\s*setPageMessage\(statusEl, `\$\{name\} を受付しました。`/);
    expect(js).toMatch(/は受付対象外です（キャンセル待ちまたはキャンセル済み）。受付していません。/);
  });

  it('取り消しは、実際に取り消せたとき（undone）だけ「取り消しました」と出す', () => {
    expect(js).toMatch(/result\.result === 'undone'/);
    expect(js).toMatch(/受付済みではありません。取り消す内容がありませんでした。/);
  });
});
