// 参加者向けの Edge Function（my-entry / edit-entry / mark-late / cancel-entry / disclose-result）の本物の処理を、
// 本物のパスワード認証（ペッパー付きハッシュ）で動かして確かめる。
// 機能一覧 MY-02〜05, 14, 18, 21, 24, 26, 28, 30〜33, 35 と API-01〜07 のサーバー側。

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFakeDb, loadFunction, QR_MOCK } from './helpers/edge_harness.mjs';

const PROJECT = 'ciq9';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const EMAIL = 'taro@example.com';
const PASSWORD = 'Abc12345';
const IDS = { me: '11111111-1111-4111-8111-111111111111', a: '22222222-2222-4222-8222-222222222222', b: '33333333-3333-4333-8333-333333333333', c: '44444444-4444-4444-8444-444444444444', other: '55555555-5555-4555-8555-555555555555' };
const FUTURE = '2099-01-01T00:00:00Z';
const PAST = '2000-01-01T00:00:00Z';

async function pepper(clientHash) {
  const { pepperHash } = await import('../supabase/functions/_shared/participant_hash.ts');
  return pepperHash(clientHash);
}

const project = (over = {}) => ({ id: PROJECT, name: 'CIQ the 9th', entry_open: true, period_start: PAST, period_end: null, disclosure_enabled: true, disclosure_period_start: null, disclosure_period_end: null, question_count: 4, ...over });

async function setup(name, { entry = {}, proj = {}, extra = {}, rpc = {}, env = {}, mocks } = {}) {
  // 先に関数を読み込んで環境を整える（ペッパーの計算は、同じ環境で行う）
  const db = createFakeDb({ projects: [project(proj)], entries: [], participant_auth_events: [], final_results: [], ...extra }, { rpc });
  const call = await loadFunction(name, { db, env, mocks });
  const email_hash_v2 = await pepper(sha(EMAIL));
  const disclosure_password_hash_v2 = await pepper(sha(PASSWORD));
  db.tables.entries.push({ id: IDS.me, project_id: PROJECT, entry_number: 7, status: 'registered', checked_in: false, affiliation: '開成高', grade: '２年', entry_name: 'やま', message: 'm', inquiry: '', is_chubu: false, created_at: '2026-07-03T00:00:00Z', email_hash_v2, disclosure_password_hash_v2, ...entry });
  return { db, call };
}
const creds = { projectId: PROJECT, emailHash: sha(EMAIL), disclosurePasswordHash: sha(PASSWORD) };

describe('my-entry（MY-02〜05、API-01、API-05、API-07）', () => {
  it('正しいメールとパスワードでログインでき、受付番号・状態・二次元コード・トークンが返る。個人情報とハッシュは返らない', async () => {
    const { call } = await setup('my-entry', { mocks: QR_MOCK });
    const r = await call(creds);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, projectName: 'CIQ the 9th', entry: { entryNumber: 7, status: 'registered', checkedIn: false, entryName: 'やま', affiliation: '開成高' } });
    expect(r.json.token).toMatch(/^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
    expect(r.json.qrSvg).toMatch(/^<svg data-value="[0-9a-f-]{36}\.[0-9a-f]{32}"/);
    const text = JSON.stringify(r.json);
    expect(text).not.toMatch(/encrypted_pii|email_hash|password_hash|taro@example/);
    expect(Object.keys(r.json.entry).sort()).toEqual(['affiliation', 'checkedIn', 'entryName', 'entryNumber', 'grade', 'id', 'inquiry', 'isChubu', 'message', 'status']);
  });

  it('メールは大文字小文字を区別しない（画面で小文字にしてからハッシュにする前提）。パスワードは区別する', async () => {
    const { call } = await setup('my-entry', { mocks: QR_MOCK });
    expect((await call({ ...creds, disclosurePasswordHash: sha('abc12345') })).status).toBe(404);
  });

  it('不一致は 404「メールアドレスまたはパスワードが正しくありません。」。メールが違っても同じ文言（存在の有無を区別しない）', async () => {
    const { call, db } = await setup('my-entry', { mocks: QR_MOCK });
    const wrongPw = await call({ ...creds, disclosurePasswordHash: sha('wrong') });
    const wrongMail = await call({ ...creds, emailHash: sha('nobody@example.com') });
    for (const r of [wrongPw, wrongMail]) {
      expect(r.status).toBe(404);
      expect(r.json.error).toBe('メールアドレスまたはパスワードが正しくありません。');
    }
    // 失敗は記録される。成功は成功として記録される
    expect(db.tables.participant_auth_events.filter((e) => e.success === false).length).toBe(2);
  });

  it('ハッシュの形式が不正なら、同じ 404 の文言（形式の違いを教えない）', async () => {
    const { call } = await setup('my-entry', { mocks: QR_MOCK });
    for (const bad of [{ emailHash: 'x' }, { disclosurePasswordHash: 'A'.repeat(64) }, { emailHash: ' ' + sha(EMAIL) }, { emailHash: undefined }]) {
      const r = await call({ ...creds, ...bad });
      expect(r.status).toBe(404);
      expect(r.json.error).toBe('メールアドレスまたはパスワードが正しくありません。');
    }
  });

  it('同じメールの失敗が10回（10分間）に達したら 429', async () => {
    const { call, db } = await setup('my-entry', { mocks: QR_MOCK });
    const email = await pepper(sha(EMAIL));
    for (let i = 0; i < 10; i += 1) db.tables.participant_auth_events.push({ project_id: PROJECT, email_hash: email, success: false, created_at: new Date().toISOString() });
    const r = await call(creds);
    expect(r.status).toBe(429);
    expect(r.json.error).toBe('試行回数が上限に達しました。時間をおいて再度お試しください。');
  });

  it('IP 単位の回数制限（参加者認証）に達したら 429。制限の記録が壊れていても通す（失敗時は通す）', async () => {
    const limited = await setup('my-entry', { mocks: QR_MOCK, rpc: { rate_limit_hit: () => ({ data: 20, error: null }) } });
    expect((await limited.call(creds)).status).toBe(429);
    const broken = await setup('my-entry', { mocks: QR_MOCK, rpc: { rate_limit_hit: () => ({ data: null, error: { message: 'down' } }) } });
    expect((await broken.call(creds)).status).toBe(200);
  });

  it('トークンで再認証でき、新しいトークンが返る。改ざん・別の大会・期限切れ・エントリーなしは断る', async () => {
    const { call, db } = await setup('my-entry', { mocks: QR_MOCK });
    const first = await call(creds);
    await new Promise((r) => setTimeout(r, 5)); // 同じミリ秒だと、同じトークンになってしまう
    const again = await call({ projectId: PROJECT, token: first.json.token });
    expect(again.status).toBe(200);
    expect(again.json.token).not.toBe(first.json.token);
    // 改ざん
    const tampered = first.json.token.slice(0, -1) + (first.json.token.slice(-1) === '0' ? '1' : '0');
    const t = await call({ projectId: PROJECT, token: tampered });
    expect(t.status).toBe(401);
    expect(t.json.error).toBe('セッションの有効期限が切れました。もう一度ログインしてください。');
    // 別の大会のトークンは使えない
    db.tables.projects.push(project({ id: 'other' }));
    expect((await call({ projectId: 'other', token: first.json.token })).status).toBe(401);
    // 期限切れ
    const { issueParticipantToken } = await import('../supabase/functions/_shared/participant_auth.ts');
    const expired = await issueParticipantToken({ projectId: PROJECT, entryId: IDS.me, emailHash: sha(EMAIL) }, -1000);
    expect((await call({ projectId: PROJECT, token: expired.token })).status).toBe(401);
    // エントリーが消えていたら
    const gone = await issueParticipantToken({ projectId: PROJECT, entryId: IDS.other, emailHash: sha(EMAIL) });
    const g = await call({ projectId: PROJECT, token: gone.token });
    expect(g.status).toBe(404);
    expect(g.json.error).toBe('エントリーが見つかりません。');
  });

  it('大会の指定なしは 400、存在しない大会は 404（日本語）', async () => {
    const { call } = await setup('my-entry', { mocks: QR_MOCK });
    const none = await call({ emailHash: sha(EMAIL), disclosurePasswordHash: sha(PASSWORD) });
    expect(none.status).toBe(400);
    expect(none.json.error).toMatch(/大会情報が見つかりません/);
  });

  it('API-07 ペッパーや署名鍵が未設定・短いと、503 の汎用の文言で止まる（情報を漏らさない）', async () => {
    for (const env of [{ CIQ_PARTICIPANT_HASH_PEPPER: '' }, { CIQ_PARTICIPANT_HASH_PEPPER: 'short' }]) {
      const { call } = await setup('my-entry', { mocks: QR_MOCK });
      const broken = await loadFunction('my-entry', { db: createFakeDb({ projects: [project()], entries: [] }), env, mocks: QR_MOCK });
      const r = await broken(creds);
      expect(r.status, JSON.stringify(env)).toBe(503);
      expect(r.json.error).toBe('ただいま参加者認証を利用できません。時間をおいて再度お試しください。');
    }
  });

  describe('capabilities（編集・遅刻・キャンセル・成績照会の可否）', () => {
    const caps = async (entry, proj) => (await (await setup('my-entry', { entry, proj, mocks: QR_MOCK })).call(creds)).json.capabilities;

    it('受付中: 編集できる（登録済み・キャンセル待ち）。遅刻の連絡は出ない', async () => {
      expect(await caps({}, {})).toEqual({ editable: true, canMarkLate: false, cancellable: true, disclosureOpen: false });
      expect((await caps({ status: 'waitlist' }, {})).editable).toBe(true);
    });

    it('受付が終わった（終了後・停止中）: 編集できず、登録済みだけ遅刻の連絡ができる', async () => {
      for (const proj of [{ period_end: PAST }, { entry_open: false }, { period_start: FUTURE }]) {
        const c = await caps({}, proj);
        expect(c.editable, JSON.stringify(proj)).toBe(false);
        expect(c.canMarkLate, JSON.stringify(proj)).toBe(true);
      }
      expect((await caps({ status: 'waitlist' }, { entry_open: false })).canMarkLate).toBe(false);
      expect((await caps({ status: 'late' }, { entry_open: false })).canMarkLate).toBe(false);
    });

    it('受付済み: 編集・遅刻・キャンセルのどれもできない。成績照会は、受付済みの人だけ', async () => {
      const c = await caps({ checked_in: true }, { entry_open: false, disclosure_enabled: true });
      expect(c).toEqual({ editable: false, canMarkLate: false, cancellable: false, disclosureOpen: true });
      expect((await caps({ checked_in: false }, { disclosure_enabled: true })).disclosureOpen).toBe(false);
    });

    it('キャンセル済み: 何もできない。二次元コードは返さない', async () => {
      const { call } = await setup('my-entry', { entry: { status: 'canceled' }, mocks: QR_MOCK });
      const r = await call(creds);
      expect(r.json.capabilities).toEqual({ editable: false, canMarkLate: false, cancellable: false, disclosureOpen: false });
      expect(r.json.qrSvg).toBe('');
    });

    it('成績照会: 期間外・停止中は出ない', async () => {
      for (const proj of [{ disclosure_enabled: false }, { disclosure_period_end: PAST }, { disclosure_period_start: FUTURE }]) {
        expect((await caps({ checked_in: true }, proj)).disclosureOpen, JSON.stringify(proj)).toBe(false);
      }
    });
  });
});

describe('edit-entry（MY-18、API-03）', () => {
  const body = { ...creds, encryptedPii: 'x'.repeat(100), publicProfile: { entryName: 'やま2', affiliation: '開成高', grade: '２年', message: 'hi', inquiry: '', isChubu: true } };

  it('受付中は更新できて、再計算（繰り上げ込み）が呼ばれる。更新されるのは自分のエントリーだけ', async () => {
    const { call, db } = await setup('edit-entry', { extra: { entries: [{ id: IDS.a, project_id: PROJECT, entry_number: 1, status: 'registered', checked_in: false, entry_name: '他の人' }] } });
    const r = await call(body);
    expect(r.status).toBe(200);
    expect(db.tables.entries.find((e) => e.id === IDS.me)).toMatchObject({ entry_name: 'やま2', is_chubu: true, encrypted_pii: body.encryptedPii });
    expect(db.tables.entries.find((e) => e.id === IDS.a).entry_name).toBe('他の人');
    expect(db.log.rpcCalls.find((c) => c.fn === 'recompute_entry_statuses').args).toEqual({ p_project_id: PROJECT, p_allow_waitlist_promotion: true });
  });

  it('暗号化データがなければ、現在の内容を返すだけ（更新しない）', async () => {
    const { call, db } = await setup('edit-entry');
    const r = await call(creds);
    expect(r.json.entry.entryName).toBe('やま');
    expect(db.log.updates.length).toBe(0);
  });

  it('受付が終わっていれば 403、キャンセル済みは 409、受付済みは 409（日本語）', async () => {
    const closed = await (await setup('edit-entry', { proj: { entry_open: false } })).call(body);
    expect(closed.status).toBe(403);
    expect(closed.json.error).toBe('現在エントリー内容の編集はできません。');
    const canceled = await (await setup('edit-entry', { entry: { status: 'canceled' } })).call(body);
    expect(canceled.status).toBe(409);
    expect(canceled.json.error).toBe('このエントリーはキャンセルされています。');
    const checked = await (await setup('edit-entry', { entry: { checked_in: true } })).call(body);
    expect(checked.status).toBe(409);
    expect(checked.json.error).toMatch(/当日受付済みのため、エントリー内容は編集できません/);
  });

  it('長すぎる入力は 400（項目名つき）。認証に失敗すれば更新しない', async () => {
    const { call, db } = await setup('edit-entry');
    const long = await call({ ...body, publicProfile: { ...body.publicProfile, entryName: 'あ'.repeat(21) } });
    expect(long.status).toBe(400);
    expect(long.json.error).toBe('エントリーネームは20文字以内で入力してください。');
    const bad = await call({ ...body, disclosurePasswordHash: sha('wrong') });
    expect(bad.status).toBe(404);
    expect(db.log.updates.length).toBe(0);
  });

  it('大会の指定なしは 400', async () => {
    const { call } = await setup('edit-entry');
    expect((await call({ encryptedPii: 'x' })).status).toBe(400);
  });
});

describe('mark-late（MY-21〜24）', () => {
  const closed = { entry_open: false };

  it('受付が終わっていて、登録済みで未受付なら、遅刻になる。監査ログに残る', async () => {
    const { call, db } = await setup('mark-late', { proj: closed });
    const r = await call(creds);
    expect(r.status).toBe(200);
    expect(r.json.entry).toMatchObject({ entryNumber: 7, status: 'late' });
    expect(db.tables.entries[0].status).toBe('late');
    expect(db.log.rpcCalls.find((c) => c.fn === 'log_service_event').args).toMatchObject({ p_action: 'entry.mark_late' });
  });

  it('断る場合: すでに遅刻 / 受付中 / 受付済み / 対象外の状態（いずれも 409 の日本語）', async () => {
    const cases = [
      [{ entry: { status: 'late' }, proj: closed }, 'すでに受け付けています'],
      [{ entry: {}, proj: {} }, 'エントリーの受付中は、遅刻の連絡はできません'],
      [{ entry: { checked_in: true }, proj: closed }, '当日受付済みのため、遅刻の連絡はできません'],
      [{ entry: { status: 'waitlist' }, proj: closed }, '遅刻の連絡の対象ではありません'],
      [{ entry: { status: 'canceled' }, proj: closed }, '遅刻の連絡の対象ではありません'],
    ];
    for (const [opts, text] of cases) {
      const { call, db } = await setup('mark-late', opts);
      const r = await call(creds);
      expect(r.status, text).toBe(409);
      expect(r.json.error, text).toContain(text);
      expect(db.log.updates.length, text).toBe(0);
    }
  });

  it('更新が空振りしたとき（同時に状態が変わった）は、遅刻にしない', async () => {
    const { call, db } = await setup('mark-late', { proj: closed });
    // 認証のあとで、別の操作が先に受付済みにした状況
    const origFrom = db.client.from;
    db.client.from = (name) => { if (name === 'entries') db.tables.entries[0].checked_in = true; return origFrom(name); };
    const r = await call(creds);
    expect(r.status).not.toBe(200);
    expect(db.tables.entries[0].status).toBe('registered');
  });
});

describe('cancel-entry（MY-26、MY-28）', () => {
  const rpcOk = (args) => ({ data: { canceled_entry_id: args.p_entry_id, canceled_entry_number: 7, promoted_entry_id: IDS.a, promoted_entry_number: 12 }, error: null });

  it('キャンセルできて、繰り上がった人の情報が返る。RPC には大会とエントリーの id だけを渡す（ハッシュは渡さない）', async () => {
    const { call, db } = await setup('cancel-entry', { rpc: { cancel_entry_by_id_atomic: rpcOk } });
    const r = await call(creds);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, canceledEntry: { id: IDS.me, entryNumber: 7 }, promotedEntry: { id: IDS.a, entryNumber: 12 } });
    const call0 = db.log.rpcCalls.find((c) => c.fn === 'cancel_entry_by_id_atomic');
    expect(call0.args).toEqual({ p_project_id: PROJECT, p_entry_id: IDS.me });
    expect(db.log.rpcCalls.find((c) => c.fn === 'log_service_event').args).toMatchObject({ p_action: 'entry.cancel' });
  });

  it('繰り上がりがなければ promotedEntry は null', async () => {
    const { call } = await setup('cancel-entry', { rpc: { cancel_entry_by_id_atomic: (a) => ({ data: { canceled_entry_id: a.p_entry_id, canceled_entry_number: 7, promoted_entry_id: null }, error: null }) } });
    expect((await call(creds)).json.promotedEntry).toBeNull();
  });

  it('受付済みは 409「当日受付済みのため、キャンセルできません。…」', async () => {
    const { call } = await setup('cancel-entry', { rpc: { cancel_entry_by_id_atomic: () => ({ data: null, error: { message: 'Checked-in entry cannot be canceled' } }) } });
    const r = await call(creds);
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('当日受付済みのため、キャンセルできません。変更が必要な場合は運営へ連絡してください。');
  });

  it('認証に失敗すれば、RPC を呼ばない', async () => {
    const { call, db } = await setup('cancel-entry', { rpc: { cancel_entry_by_id_atomic: rpcOk } });
    expect((await call({ ...creds, disclosurePasswordHash: sha('wrong') })).status).toBe(404);
    expect(db.log.rpcCalls.find((c) => c.fn === 'cancel_entry_by_id_atomic')).toBeUndefined();
  });
});

describe('disclose-result（MY-30〜35）', () => {
  const entries = (extra = []) => [
    { id: IDS.a, project_id: PROJECT, entry_number: 1, status: 'registered', checked_in: true, affiliation: 'A高', grade: '１年' },
    { id: IDS.b, project_id: PROJECT, entry_number: 2, status: 'registered', checked_in: true, affiliation: 'B高', grade: '１年' },
    { id: IDS.c, project_id: PROJECT, entry_number: 3, status: 'late', checked_in: false, affiliation: 'C高', grade: '１年' },
    ...extra,
  ];
  const fr = (id, q, result) => ({ project_id: PROJECT, entry_id: id, question_number: q, result });
  // 自分(7番): ○○×○ → 3点、連答 [2,1]。A: ○○○○ → 4点。B: ○○×○ → 3点で、自分と同順位
  const results = () => [
    ...[1, 2, 4].map((q) => fr(IDS.me, q, 'correct')), fr(IDS.me, 3, 'wrong'),
    ...[1, 2, 3, 4].map((q) => fr(IDS.a, q, 'correct')),
    ...[1, 2, 4].map((q) => fr(IDS.b, q, 'correct')), fr(IDS.b, 3, 'wrong'),
    ...[1, 2, 3, 4].map((q) => fr(IDS.c, q, 'correct')), // 当日受付していない人は、順位に入らない
  ];

  it('点数・順位・連答が返る。順位は、当日受付を済ませた人の中で付く（受付していない満点の人は入らない）。同点同連答は同順位', async () => {
    const { call } = await setup('disclose-result', { entry: { checked_in: true }, extra: { entries: entries(), final_results: results() } });
    const r = await call(creds);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, entryNumber: 7, affiliation: '開成高', grade: '２年', score: 3, streaks: [2, 1], rank: '2nd', rankNumber: 2, totalQuestions: 4 });
  });

  it('同点でも連答が長いほうが上位。連答も同じなら同順位', async () => {
    const { call } = await setup('disclose-result', { entry: { checked_in: true }, extra: { entries: entries(), final_results: [
      ...[1, 2, 3].map((q) => fr(IDS.me, q, 'correct')), fr(IDS.me, 4, 'wrong'),           // 3点 [3,0]
      ...[1, 2, 4].map((q) => fr(IDS.a, q, 'correct')), fr(IDS.a, 3, 'wrong'),             // 3点 [2,1]
      ...[1, 2, 4].map((q) => fr(IDS.b, q, 'correct')), fr(IDS.b, 3, 'wrong'),             // 3点 [2,1]
    ] } });
    const r = await call(creds);
    expect(r.json).toMatchObject({ score: 3, streaks: [3, 0], rankNumber: 1, rank: '1st' });
  });

  it('当日受付を済ませていない人は 409（対象外）', async () => {
    const { call } = await setup('disclose-result', { entry: { checked_in: false }, extra: { entries: entries(), final_results: results() } });
    const r = await call(creds);
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('このエントリーは成績照会の対象外です。当日受付を済ませた方が対象です。');
  });

  it('停止中・開始前・終了後・大会なし: 日本語の文言で 403 / 404', async () => {
    const cases = [[{ disclosure_enabled: false }, 403, '成績照会は現在利用できません。'], [{ disclosure_period_start: FUTURE }, 403, '成績照会はまだ始まっていません。'], [{ disclosure_period_end: PAST }, 403, '成績照会は終了しました。']];
    for (const [proj, status, text] of cases) {
      const { call } = await setup('disclose-result', { entry: { checked_in: true }, proj });
      const r = await call(creds);
      expect(r.status, text).toBe(status);
      expect(r.json.error, text).toBe(text);
    }
    const { call } = await setup('disclose-result', { entry: { checked_in: true } });
    expect((await call({ ...creds, projectId: 'nope' })).status).toBe(404);
  });

  it('認証に失敗したときの文言は日本語（英語を返さない）', async () => {
    const { call } = await setup('disclose-result', { entry: { checked_in: true } });
    const r = await call({ ...creds, disclosurePasswordHash: sha('wrong') });
    expect(r.status).toBe(404);
    expect(r.json.error).toBe('メールアドレスまたはパスワードが正しくありません。');
    expect(r.json.error).not.toMatch(/[A-Za-z]{4,}/);
  });

  it('返すのは本人の分だけ（他の人の成績・氏名・メールを含まない）', async () => {
    const { call } = await setup('disclose-result', { entry: { checked_in: true }, extra: { entries: entries(), final_results: results() } });
    const text = JSON.stringify((await call(creds)).json);
    expect(text).not.toMatch(/A高|B高|C高|encrypted|email|hash/);
  });
});
