// 登録・メール・二次元コード画像・招待の参加の、本物の処理を動かして確かめる。
// 機能一覧 ENT-12, 14, 34, 38〜40, ENT-13/15 のサーバー側、API-03, 05, 06, 07、JOIN-04, 05。

import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, loadFunction, QR_MOCK } from './helpers/edge_harness.mjs';

const PROJECT = 'ciq9';
const sha = (s) => createHash('sha256').update(s).digest('hex');
const EMAIL = 'taro@example.com';
const hex = (c) => c.repeat(64);
const TS_ENV = { TURNSTILE_SECRET_KEY: 'ts-secret', CIQ_TURNSTILE_HOSTNAMES: 'chromquiz.github.io' };

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
/** Cloudflare の siteverify を差し替える。 */
function stubTurnstile(result) {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(result), { status: 200 }));
}
const tsOk = (action) => ({ success: true, action, hostname: 'chromquiz.github.io' });

const project = (over = {}) => ({ id: PROJECT, name: 'CIQ the 9th', entry_open: true, period_start: '2000-01-01T00:00:00Z', period_end: null, ...over });

async function verifiedToken(email = EMAIL) {
  const { issueEmailVerifiedToken } = await import('../supabase/functions/_shared/email_verify.ts');
  return (await issueEmailVerifiedToken(PROJECT, email)).token;
}

describe('create-entry（ENT-34、API-03、API-05、API-06）', () => {
  const rpcOk = { create_entry_atomic: () => ({ data: { entry_id: 'e9', entry_number: 9, status: 'registered' }, error: null }) };
  const bodyFor = async (over = {}) => ({
    projectId: PROJECT, encryptedPii: 'x'.repeat(100), emailHash: sha(EMAIL), disclosurePasswordHash: sha('Abc12345'),
    emailVerifiedToken: await verifiedToken(), turnstileToken: 'ts', publicProfile: { entryName: 'やま', affiliation: '開成高', grade: '２年', message: '', inquiry: '', isChubu: false }, ...over,
  });
  async function make(rpc = rpcOk, env = TS_ENV) {
    const db = createFakeDb({ projects: [project()] }, { rpc });
    const call = await loadFunction('create-entry', { db, env });
    return { db, call };
  }

  it('成功: Turnstile とメール認証のあとで登録され、受付番号と状態が返り、ペッパー付きのハッシュだけが渡る', async () => {
    stubTurnstile(tsOk('create_entry'));
    const { db, call } = await make();
    const r = await call(await bodyFor());
    expect(r.status).toBe(200);
    expect(r.json.entry).toMatchObject({ entry_number: 9, status: 'registered' });
    const args = db.log.rpcCalls.find((c) => c.fn === 'create_entry_atomic').args;
    expect(args.p_email_hash_v2).toMatch(/^[0-9a-f]{64}$/);
    expect(args.p_email_hash_v2).not.toBe(sha(EMAIL)); // ペッパー済み
    expect(Object.keys(args)).not.toContain('p_email_hash'); // 旧列は書かない
    expect(db.log.rpcCalls.find((c) => c.fn === 'log_service_event').args.p_action).toBe('entry.create');
  });

  it('API-06 Turnstile: トークンなし・失敗・別のアクション・別のホスト名は 403。設定がなければ止まる（503）', async () => {
    const { call } = await make();
    stubTurnstile(tsOk('create_entry'));
    expect((await call(await bodyFor({ turnstileToken: '' }))).status).toBe(403);
    stubTurnstile({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    expect((await call(await bodyFor())).status).toBe(403);
    stubTurnstile(tsOk('send_verification'));
    expect((await call(await bodyFor())).status).toBe(403);
    stubTurnstile({ success: true, action: 'create_entry', hostname: 'evil.example' });
    const host = await call(await bodyFor());
    expect(host.status).toBe(403);
    expect(host.json.error).toBe('認証を完了できませんでした。ページを再読み込みして、もう一度お試しください。');
    stubTurnstile(tsOk('create_entry'));
    const noSecret = await make(rpcOk, { ...TS_ENV, TURNSTILE_SECRET_KEY: '' });
    const r = await noSecret.call(await bodyFor());
    expect(r.status).toBe(503);
    expect(r.json.error).toBe('ただいま登録を受け付けられません。時間をおいて再度お試しください。');
  });

  it('API-06 Cloudflare に届かない（ネットワーク障害・5xx）ときは、通さずに止める', async () => {
    const { call } = await make();
    globalThis.fetch = vi.fn(async () => { throw new Error('network'); });
    expect((await call(await bodyFor())).status).toBe(403);
    globalThis.fetch = vi.fn(async () => new Response('', { status: 503 }));
    expect((await call(await bodyFor())).status).toBe(403);
  });

  it('メール認証: トークンなしは 400、別のメール・別の大会・改ざんは 401', async () => {
    stubTurnstile(tsOk('create_entry'));
    const { call, db } = await make();
    const none = await call(await bodyFor({ emailVerifiedToken: undefined }));
    expect(none.status).toBe(400);
    expect(none.json.error).toBe('メール認証を確認できませんでした。もう一度メール認証を行ってください。');
    const other = await call(await bodyFor({ emailHash: sha('someone-else@example.com') }));
    expect(other.status).toBe(401);
    const wrongProject = await call(await bodyFor({ projectId: 'other' }));
    expect(wrongProject.status).toBe(401);
    const good = await verifiedToken();
    expect((await call(await bodyFor({ emailVerifiedToken: good.slice(0, -2) + 'xx' }))).status).toBe(401);
    expect(db.log.rpcCalls.find((c) => c.fn === 'create_entry_atomic')).toBeUndefined();
  });

  it('API-03 必須項目の欠落・ハッシュの形式不正は 400（日本語）', async () => {
    stubTurnstile(tsOk('create_entry'));
    const { call } = await make();
    expect((await call({ ...(await bodyFor()), projectId: undefined })).status).toBe(400);
    const missing = await call(await bodyFor({ encryptedPii: undefined }));
    expect(missing.status).toBe(400);
    expect(missing.json.error).toBe('エントリー情報が不足しています。入力内容を確認してもう一度送信してください。');
    const bad = await call(await bodyFor({ emailHash: 'XYZ' }));
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe('エントリー情報の形式が正しくありません。入力内容を確認して再度お試しください。');
  });

  it('入力が長すぎれば 400（項目名つき）。登録は行わない', async () => {
    stubTurnstile(tsOk('create_entry'));
    const { call, db } = await make();
    const r = await call(await bodyFor({ publicProfile: { entryName: 'あ'.repeat(21) } }));
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('エントリーネームは20文字以内で入力してください。');
    expect(db.log.rpcCalls.find((c) => c.fn === 'create_entry_atomic')).toBeUndefined();
  });

  it('サーバーの拒否: 同じメール 409 / 停止中・開始前・終了後 403 / 想定外は 500 の汎用文言', async () => {
    stubTurnstile(tsOk('create_entry'));
    const cases = [
      [{ code: '23505', message: 'duplicate key' }, 409, 'このメールアドレスは既にエントリー済みです。'],
      [{ message: 'Entry is closed' }, 403, '受付は現在停止中です。'],
      [{ message: 'Entry period has not started' }, 403, 'エントリー受付はまだ開始されていません。'],
      [{ message: 'Entry period has ended' }, 403, 'エントリー受付は終了しました。'],
    ];
    for (const [error, status, text] of cases) {
      const { call } = await make({ create_entry_atomic: () => ({ data: null, error }) });
      const r = await call(await bodyFor());
      expect(r.status, text).toBe(status);
      expect(r.json.error, text).toBe(text);
    }
    const boom = await make({ create_entry_atomic: () => ({ data: null, error: { message: 'SECRET_DB_DETAIL' } }) });
    const r = await boom.call(await bodyFor());
    expect(r.status).toBe(500);
    expect(r.json.error).toBe('サーバーで問題が発生しました。時間をおいて再度お試しください。');
    expect(JSON.stringify(r.json)).not.toContain('SECRET_DB_DETAIL');
  });

  it('API-05 IP 単位の回数制限（1時間に10回）に達したら 429', async () => {
    stubTurnstile(tsOk('create_entry'));
    const { call, db } = await make({ ...rpcOk, rate_limit_hit: () => ({ data: 10, error: null }) });
    const r = await call(await bodyFor());
    expect(r.status).toBe(429);
    expect(db.log.rpcCalls.find((c) => c.fn === 'create_entry_atomic')).toBeUndefined();
  });

  it('API-07 ペッパーが未設定なら、登録を止める（503）', async () => {
    stubTurnstile(tsOk('create_entry'));
    const db = createFakeDb({ projects: [project()] }, { rpc: rpcOk });
    const call = await loadFunction('create-entry', { db, env: { ...TS_ENV, CIQ_PARTICIPANT_HASH_PEPPER: '' } });
    const r = await call(await bodyFor());
    expect(r.status).toBe(503);
  });
});

describe('send-email: 認証コード（ENT-12〜15、API-03、API-05、API-06）', () => {
  const sent = [];
  const mocks = {
    '_shared/email_provider.ts': () => ({
      emailProviderName: () => 'brevo',
      sendProviderEmail: async (m) => { sent.push(m); return { provider: 'brevo', providerMessageId: 'mid' }; },
    }),
  };
  async function make({ env = {}, rpc = {}, entries = [] } = {}) {
    sent.length = 0;
    const db = createFakeDb({ projects: [project({ notify_entry_edit: true })], email_events: [], entries }, { rpc });
    const call = await loadFunction('send-email', { db, env: { ...TS_ENV, ...env }, mocks });
    return { db, call };
  }
  const send = (call, over = {}) => call({ type: 'send_verification', to: EMAIL, projectId: PROJECT, data: { turnstileToken: 'ts' }, ...over });

  it('コードを送る: 6桁のコードがメールに入り、応答には署名と期限だけ（コードは返さない）。全角のアドレスは半角に直る', async () => {
    stubTurnstile(tsOk('send_verification'));
    const { call, db } = await make();
    const r = await send(call, { to: 'Ｔａｒｏ＠Ｅｘａｍｐｌｅ．ｃｏｍ' });
    expect(r.status).toBe(200);
    expect(Object.keys(r.json).sort()).toEqual(['emailEventId', 'expiresAt', 'signature', 'success']);
    expect(sent.length).toBe(1);
    expect(sent[0].to).toBe(EMAIL);
    const code = sent[0].text.match(/認証コード: (\d{6})/)[1];
    expect(JSON.stringify(r.json)).not.toContain(code);
    expect(sent[0].subject).toContain('認証コード');
    expect(db.tables.email_events[0]).toMatchObject({ template: 'send_verification', status: 'sent' });
    expect(JSON.stringify(db.tables.email_events)).not.toContain(EMAIL); // 宛先の生のアドレスは記録しない
  });

  it('コードの確認: 正しいコードで認証済みトークンが返る。違うコード・期限切れ・別のメールは断る', async () => {
    stubTurnstile(tsOk('send_verification'));
    const { call } = await make();
    const r = await send(call);
    const code = sent[0].text.match(/認証コード: (\d{6})/)[1];
    const verify = (over = {}) => call({ type: 'verify_code', to: EMAIL, projectId: PROJECT, data: { code, signature: r.json.signature, expiresAt: r.json.expiresAt, projectId: PROJECT, ...over } });
    const ok = await verify();
    expect(ok.json.verified).toBe(true);
    expect(ok.json.emailVerifiedToken).toMatch(/^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
    expect((await verify({ code: code === '000000' ? '111111' : '000000' })).json.verified).toBe(false);
    const other = await call({ type: 'verify_code', to: 'other@example.com', projectId: PROJECT, data: { code, signature: r.json.signature, expiresAt: r.json.expiresAt } });
    expect(other.json.verified).toBe(false);
    const expired = await verify({ expiresAt: Date.now() - 1000 });
    expect(expired.json.verified).toBe(false);
    expect(expired.json.error).toBe('認証コードの有効期限が切れました。認証コードをもう一度送信してください。');
  });

  it('API-06 Turnstile なし・失敗は 403 で、メールは送らない。API-03 不正なアドレスは 400', async () => {
    const { call } = await make();
    stubTurnstile(tsOk('send_verification'));
    expect((await send(call, { data: { turnstileToken: '' } })).status).toBe(403);
    stubTurnstile({ success: false });
    expect((await send(call)).status).toBe(403);
    stubTurnstile(tsOk('send_verification'));
    for (const bad of ['a..b@example.com', 'a@example.c', 'abc', '', 'a b@example.com']) {
      const r = await send(call, { to: bad });
      expect(r.status, bad).toBe(400);
    }
    expect(sent.length).toBe(0);
  });

  it('受付停止中・開始前・終了後は、コードを送らずに日本語で断る', async () => {
    stubTurnstile(tsOk('send_verification'));
    const cases = [[{ entry_open: false }, 'ただいまエントリーを受け付けていません。'], [{ period_start: '2099-01-01T00:00:00Z' }, 'エントリーの受付はまだ始まっていません。'], [{ period_end: '2000-02-01T00:00:00Z' }, 'エントリーの受付は終了しました。']];
    for (const [proj, text] of cases) {
      sent.length = 0;
      const db = createFakeDb({ projects: [project(proj)], email_events: [] });
      const call = await loadFunction('send-email', { db, env: TS_ENV, mocks });
      const r = await send(call);
      expect(r.status, text).toBe(409);
      expect(r.json.error, text).toBe(text);
      expect(sent.length).toBe(0);
    }
    const db = createFakeDb({ projects: [], email_events: [] });
    const call = await loadFunction('send-email', { db, env: TS_ENV, mocks });
    expect((await send(call)).status).toBe(404);
  });

  it('API-05 IP 単位（10分に5回）・メール宛先ごと・プロジェクトの1日の上限で 429', async () => {
    stubTurnstile(tsOk('send_verification'));
    const limited = await make({ rpc: { rate_limit_hit: () => ({ data: 5, error: null }) } });
    expect((await send(limited.call)).status).toBe(429);
    expect(limited.db.log.rpcCalls.find((c) => c.args.p_bucket === 'send_verification').args).toMatchObject({ p_window_seconds: 600, p_limit: 5 });
    const daily = await make({ rpc: { rate_limit_hit: (a) => ({ data: a.p_bucket === 'email_daily' ? 1000 : 0, error: null }) } });
    const r = await send(daily.call);
    expect(r.status).toBe(429);
    expect(r.json.error).toBe('本日のメール送信上限に達しました。時間をおいて再度お試しください。');
    const failOpen = await make({ rpc: { rate_limit_hit: () => ({ data: null, error: { message: 'down' } }) } });
    expect((await send(failOpen.call)).status).toBe(200);
  });

  it('メール会社の失敗: アドレスの拒否は 400「送信できません」、それ以外は 502 の汎用の文言。送信の失敗は記録される', async () => {
    stubTurnstile(tsOk('send_verification'));
    const run = async (message) => {
      const db = createFakeDb({ projects: [project()], email_events: [] });
      const call = await loadFunction('send-email', { db, env: TS_ENV, mocks: { '_shared/email_provider.ts': () => ({ emailProviderName: () => 'brevo', sendProviderEmail: async () => { throw new Error(message); } }) } });
      return { r: await send(call), db };
    };
    const bad = await run('Brevo send failed: 400 {"message":"email is not valid"}');
    expect(bad.r.status).toBe(400);
    expect(bad.r.json.error).toBe('このメールアドレスには送信できません。メールアドレスをご確認ください。');
    const down = await run('Brevo send failed: 503 upstream');
    expect(down.r.status).toBe(502);
    expect(down.r.json.error).toMatch(/メールを送信できませんでした。時間をおいて再度お試しください/);
    expect(down.db.tables.email_events[0].status).toBe('failed');
    expect(JSON.stringify(down.r.json)).not.toContain('upstream');
  });

  it('API-07 署名鍵が未設定なら、コードを作らない', async () => {
    stubTurnstile(tsOk('send_verification'));
    const { call } = await make({ env: { CIQ_EMAIL_SIGNING_SECRET: '' } });
    const r = await send(call);
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect(sent.length).toBe(0);
  });
});

describe('send-email: 再発行用のコードと、パスワードの再発行', () => {
  const sent = [];
  const mocks = { '_shared/email_provider.ts': () => ({ emailProviderName: () => 'brevo', sendProviderEmail: async (m) => { sent.push(m); return { provider: 'brevo', providerMessageId: 'x' }; } }) };
  async function make(entries = []) {
    sent.length = 0;
    const db = createFakeDb({ projects: [project({ entry_open: false })], email_events: [], entries });
    const call = await loadFunction('send-email', { db, env: TS_ENV, mocks });
    const { pepperHash } = await import('../supabase/functions/_shared/participant_hash.ts');
    return { db, call, pepperHash };
  }

  it('登録のないアドレスには送らないが、応答は同じ形（登録の有無を調べさせない）。期間外でも使える', async () => {
    stubTurnstile(tsOk('send_verification'));
    const { call, db, pepperHash } = await make();
    db.tables.entries.push({ id: 'e1', project_id: PROJECT, entry_number: 1, email_hash_v2: await pepperHash(sha(EMAIL)) });
    const known = await call({ type: 'send_verification', to: EMAIL, projectId: PROJECT, data: { turnstileToken: 'ts', purpose: 'password_reset' } });
    expect(known.status).toBe(200);
    expect(sent.length).toBe(1);
    expect(sent[0].text).toContain('パスワードの再発行');
    const unknown = await call({ type: 'send_verification', to: 'nobody@example.com', projectId: PROJECT, data: { turnstileToken: 'ts', purpose: 'password_reset' } });
    expect(unknown.status).toBe(200);
    expect(Object.keys(unknown.json).sort()).toEqual(['expiresAt', 'signature', 'success']);
    expect(sent.length).toBe(1); // 送られていない
    // 通常のエントリー用は、受付が終わっていれば断る
    const normal = await call({ type: 'send_verification', to: EMAIL, projectId: PROJECT, data: { turnstileToken: 'ts' } });
    expect(normal.status).toBe(409);
  });

  it('新しいパスワードの再発行: 認証済みトークンが必要。成功するとサーバーが作ったパスワードがメールに載り、画面には返らない。ログインできる', async () => {
    stubTurnstile(tsOk('send_verification'));
    const { call, db, pepperHash } = await make();
    db.tables.entries.push({ id: 'e1', project_id: PROJECT, entry_number: 5, email_hash_v2: await pepperHash(sha(EMAIL)), disclosure_password_hash_v2: 'old' });
    const body = { type: 'reset_password', to: EMAIL, projectId: PROJECT, data: { projectName: 'x' } };
    expect((await call({ ...body, data: { ...body.data } })).status).toBe(400);
    expect((await call({ ...body, data: { emailVerifiedToken: 'bogus' } })).status).toBe(401);
    const other = await call({ ...body, to: 'other@example.com', data: { emailVerifiedToken: await verifiedToken() } });
    expect(other.status).toBe(401); // 別のメールのトークンでは通らない
    const r = await call({ ...body, data: { emailVerifiedToken: await verifiedToken(), myUrl: 'https://chromquiz.github.io/app/my.html?pid=ciq9' } });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ success: true });
    const mail = sent[sent.length - 1];
    const password = mail.text.match(/新しいパスワード：(\S+)/)[1];
    expect(password).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(db.tables.entries[0].disclosure_password_hash_v2).toBe(await pepperHash(sha(password)));
    expect(JSON.stringify(db.tables.email_events)).not.toContain(password);
    expect(db.log.rpcCalls.find((c) => c.args.p_action === 'entry.password_reset')).toBeTruthy();
  });

  it('登録のないメールで再発行しようとすると 404（日本語）。パスワードは作られない', async () => {
    stubTurnstile(tsOk('send_verification'));
    const { call } = await make([]);
    const r = await call({ type: 'reset_password', to: EMAIL, projectId: PROJECT, data: { emailVerifiedToken: await verifiedToken() } });
    expect(r.status).toBe(404);
    expect(r.json.error).toBe('このメールアドレスで登録されたエントリーが見つかりません。');
    expect(sent.length).toBe(0);
  });
});

describe('send-email: 繰り上げ通知の起動（process_promotions）', () => {
  const users = { 'tok-admin': { id: 'u-admin' }, 'tok-scorer': { id: 'u-scorer' } };
  const members = [{ id: 'm1', project_id: PROJECT, user_id: 'u-admin', role: 'admin', status: 'active' }, { id: 'm2', project_id: PROJECT, user_id: 'u-scorer', role: 'scorer', status: 'active' }];
  async function make(env = {}) {
    const db = createFakeDb({ projects: [project()], project_members: members, entries: [], project_private_keys: [] }, { users });
    const call = await loadFunction('send-email', { db, env: { CIQ_CRON_SECRET: 'cron-secret-0123456789abcdef', ...env }, mocks: {} });
    return { db, call };
  }

  it('合言葉なし・間違った合言葉は 400/403。大会の管理者だけが、自分の大会について呼べる。採点者は 403', async () => {
    const { call } = await make();
    const noSecretNoProject = await call({ type: 'process_promotions' }, { headers: { 'x-ciq-cron-secret': 'wrong' } });
    expect(noSecretNoProject.status).toBe(400);
    expect((await call({ type: 'process_promotions', projectId: PROJECT })).status).toBe(403);
    expect((await call({ type: 'process_promotions', projectId: PROJECT }, { token: 'tok-scorer' })).status).toBe(403);
    expect((await call({ type: 'process_promotions', projectId: PROJECT }, { token: 'tok-admin' })).json).toMatchObject({ ok: true, sent: 0 });
    expect((await call({ type: 'process_promotions' }, { headers: { 'x-ciq-cron-secret': 'cron-secret-0123456789abcdef' } })).json).toMatchObject({ ok: true });
  });

  it('合言葉が未設定なら、合言葉での呼び出しは通らない（空の合言葉で通らない）', async () => {
    const { call } = await make({ CIQ_CRON_SECRET: '' });
    const r = await call({ type: 'process_promotions' }, { headers: { 'x-ciq-cron-secret': '' } });
    expect(r.status).toBe(400);
  });
});

describe('checkin-qr（二次元コード画像）', () => {
  it('署名つきの URL だけ画像を返す。署名なし・改ざんは 404', async () => {
    const db = createFakeDb({});
    const call = await loadFunction('checkin-qr', { db, mocks: QR_MOCK });
    const { hmacHex, signingSecret } = await import('../supabase/functions/_shared/signing.ts');
    const id = '11111111-1111-4111-8111-111111111111';
    const sig = await hmacHex(signingSecret(), id);
    const ok = await call(undefined, { method: 'GET', url: `https://fn.test/checkin-qr?d=${id}&s=${sig}` });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toMatch(/image\/svg\+xml/);
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    expect(ok.text).toMatch(new RegExp(`data-value="${id}\\.[0-9a-f]{32}"`)); // 素の ID ではなく署名つき
    for (const url of [`https://fn.test/checkin-qr?d=${id}`, `https://fn.test/checkin-qr?d=${id}&s=${'0'.repeat(64)}`, `https://fn.test/checkin-qr?d=${id.replace('1', '2')}&s=${sig}`, 'https://fn.test/checkin-qr']) {
      expect((await call(undefined, { method: 'GET', url })).status, url).toBe(404);
    }
  });

  it('署名鍵が未設定なら 503', async () => {
    const call = await loadFunction('checkin-qr', { db: createFakeDb({}), mocks: QR_MOCK, env: { CIQ_EMAIL_SIGNING_SECRET: '' } });
    expect((await call(undefined, { method: 'GET', url: 'https://fn.test/checkin-qr?d=x&s=y' })).status).toBe(503);
  });
});

describe('redeem-scorer-invite（JOIN-04、JOIN-05）', () => {
  const users = { 'tok-user': { id: 'u-new', email: 'new@example.com', user_metadata: { full_name: '新人' } } };
  async function make(rpc) {
    const db = createFakeDb({}, { users, rpc: { redeem_scorer_invite: rpc } });
    const call = await loadFunction('redeem-scorer-invite', { db });
    const { generateInviteToken } = await import('../supabase/functions/_shared/invite_token.ts');
    return { db, call, token: generateInviteToken() };
  }

  it('参加できる: ログイン中の人が採点者になる。新規参加は監査ログに残り、すでに参加している人は残らない', async () => {
    const joined = await make(() => ({ data: { project_id: PROJECT, role: 'scorer', display_name: '新人', already_member: false }, error: null }));
    const r = await joined.call({ token: joined.token }, { token: 'tok-user' });
    expect(r.json).toMatchObject({ ok: true, projectId: PROJECT, role: 'scorer', alreadyMember: false });
    expect(joined.db.log.rpcCalls.find((c) => c.fn === 'log_service_event').args.p_action).toBe('scorer_invite.redeem');
    const again = await make(() => ({ data: { project_id: PROJECT, role: 'scorer', display_name: '新人', already_member: true }, error: null }));
    expect((await again.call({ token: again.token }, { token: 'tok-user' })).json.alreadyMember).toBe(true);
    expect(again.db.log.rpcCalls.find((c) => c.fn === 'log_service_event')).toBeUndefined();
    // DB に渡るのは、トークンそのものではなくハッシュ
    expect(joined.db.log.rpcCalls.find((c) => c.fn === 'redeem_scorer_invite').args.p_token_hash).not.toContain(joined.token);
  });

  it('使えないリンクは、理由ごとの日本語（形式不正 400 / 不明 404 / 期限切れ 410 / 失効 403 / 上限 409 / 外された人 403）', async () => {
    const cases = [['Invalid invite', 404, /使用できません/], ['Invite expired', 410, /有効期限が切れています/], ['Invite revoked', 403, /使用できません/], ['Invite exhausted', 409, /使用上限に達しています/], ['Member was removed', 403, /メンバーから外されています/]];
    for (const [message, status, re] of cases) {
      const { call, token } = await make(() => ({ data: null, error: { message } }));
      const r = await call({ token }, { token: 'tok-user' });
      expect(r.status, message).toBe(status);
      expect(r.json.error, message).toMatch(re);
    }
    const { call } = await make(() => ({ data: null, error: null }));
    const bad = await call({ token: 'short' }, { token: 'tok-user' });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toMatch(/使用できません/);
  });

  it('ログインなしは 401。想定外の失敗は 500 の汎用の文言', async () => {
    const { call, token } = await make(() => ({ data: null, error: { message: 'SECRET' } }));
    expect((await call({ token })).status).toBe(401);
    expect((await call({ token }, { token: 'bogus' })).status).toBe(401);
    const r = await call({ token }, { token: 'tok-user' });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.json)).not.toContain('SECRET');
  });
});

describe('API-07 メール会社の鍵が未設定のとき', () => {
  it('コードを送れず、内部の詳細（鍵の名前など）を漏らさない', async () => {
    stubTurnstile(tsOk('send_verification'));
    const db = createFakeDb({ projects: [project()], email_events: [] });
    const call = await loadFunction('send-email', { db, env: { ...TS_ENV, CIQ_EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: '', BREVO_FROM_EMAIL: '' } });
    const r = await call({ type: 'send_verification', to: EMAIL, projectId: PROJECT, data: { turnstileToken: 'ts' } });
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect(r.text).not.toMatch(/BREVO|API_KEY|api-key/i);
    expect(db.tables.email_events[0]?.status).not.toBe('sent');
  });
});
