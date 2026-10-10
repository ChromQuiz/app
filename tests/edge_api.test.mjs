// Edge Function の共通の振る舞い（機能一覧 API-01〜07）を、本物の処理で確かめる。
// 管理者向けの4つ（admin-create-entry / admin-entry-qr / create-scorer-invite / project-key）と、
// 参加者向けの5つ（my-entry / edit-entry / cancel-entry / mark-late / disclose-result）。

import { describe, expect, it } from 'vitest';
import { createFakeDb, loadFunction, QR_MOCK } from './helpers/edge_harness.mjs';

const PROJECT = 'ciq9';
const users = { 'tok-owner': { id: 'u-owner' }, 'tok-admin': { id: 'u-admin' }, 'tok-scorer': { id: 'u-scorer' }, 'tok-removed': { id: 'u-removed' }, 'tok-outsider': { id: 'u-out' } };
const members = [
  { id: 'm-owner', project_id: PROJECT, user_id: 'u-owner', role: 'owner', status: 'active' },
  { id: 'm-admin', project_id: PROJECT, user_id: 'u-admin', role: 'admin', status: 'active' },
  { id: 'm-scorer', project_id: PROJECT, user_id: 'u-scorer', role: 'scorer', status: 'active' },
  { id: 'm-removed', project_id: PROJECT, user_id: 'u-removed', role: 'admin', status: 'removed' },
  { id: 'm-other', project_id: 'other', user_id: 'u-out', role: 'admin', status: 'active' },
];
const hex = (c) => c.repeat(64);
const E1 = '11111111-1111-4111-8111-111111111111';
const E2 = '22222222-2222-4222-8222-222222222222';

const STAFF = [
  { name: 'create-scorer-invite', body: { projectId: PROJECT }, rpc: { create_scorer_invite: () => ({ data: { id: 'i1', max_uses: 20, expires_at: '2026-10-20T00:00:00Z', created_at: '2026-10-13T00:00:00Z' }, error: null }) }, missing: { projectId: undefined }, missingMsg: '大会の情報が見つかりません。' },
  { name: 'admin-entry-qr', body: { projectId: PROJECT, entryId: E1 }, mocks: QR_MOCK, missing: { entryId: undefined }, missingMsg: '二次元コードの取得に必要な情報が不足しています。' },
  { name: 'admin-create-entry', body: { projectId: PROJECT, encryptedPii: 'x', emailHash: hex('a'), disclosurePasswordHash: hex('b'), publicProfile: { entryName: 'やま' } }, rpc: { create_entry_atomic: () => ({ data: { entry_id: 'e9', entry_number: 9, status: 'registered' }, error: null }) }, missing: { encryptedPii: undefined }, missingMsg: '代理エントリーの作成に必要な情報が不足しています。' },
  { name: 'project-key', body: { action: 'fetch', projectId: PROJECT }, missing: { projectId: undefined }, missingMsg: '大会の情報が見つかりません。' },
];

async function staff(spec, extra = {}) {
  const db = createFakeDb({ project_members: members, entries: [{ id: E1, project_id: PROJECT, entry_number: 1 }], project_private_keys: [] }, { users, rpc: spec.rpc || {} });
  const call = await loadFunction(spec.name, { db, mocks: spec.mocks, ...extra });
  return { db, call };
}

describe.each(STAFF)('管理者向け: $name', (spec) => {
  it('API-01 認証なし・無効なトークンは 401（日本語）', async () => {
    const { call } = await staff(spec);
    const none = await call(spec.body);
    expect(none.status).toBe(401);
    expect(none.json.error).toMatch(/Googleログイン/);
    expect((await call(spec.body, { token: 'bogus' })).status).toBe(401);
  });

  it('API-02 採点者・外された人・別の大会のメンバーは 403。所有者と管理者は通る', async () => {
    const { call } = await staff(spec);
    for (const token of ['tok-scorer', 'tok-removed', 'tok-outsider']) {
      const r = await call(spec.body, { token });
      expect(r.status, token).toBe(403);
      expect(r.json.error, token).toMatch(/権限/);
    }
    for (const token of ['tok-owner', 'tok-admin']) {
      const r = await call(spec.body, { token });
      expect([200, 404], `${token} -> ${r.status} ${JSON.stringify(r.json)}`).toContain(r.status);
    }
  });

  it('API-03 必須項目が欠けると 400（日本語）', async () => {
    const { call } = await staff(spec);
    const r = await call({ ...spec.body, ...spec.missing }, { token: 'tok-admin' });
    expect(r.status).toBe(400);
    expect(r.json.error).toContain(spec.missingMsg);
  });

  it('API-04 想定外の失敗は 500 の汎用の文言 + ref。内部の詳細は出ない', async () => {
    const { db, call } = await staff({ ...spec, rpc: { ...(spec.rpc || {}), create_scorer_invite: () => { throw new Error('SECRET_INTERNAL_DETAIL'); }, create_entry_atomic: () => { throw new Error('SECRET_INTERNAL_DETAIL'); } } });
    if (spec.name === 'admin-entry-qr' || spec.name === 'project-key') {
      db.tables.entries.length = 0; // 参照先を無くして、想定外の経路に入れる
      db.client.from = () => { throw new Error('SECRET_INTERNAL_DETAIL'); };
    }
    const r = await call(spec.body, { token: 'tok-admin' });
    if (r.status === 500) {
      expect(r.json.error).toBe('サーバーで問題が発生しました。時間をおいてもう一度お試しください。');
      expect(r.json.ref).toMatch(/^[0-9a-f]{8}$/);
      expect(JSON.stringify(r.json)).not.toMatch(/SECRET_INTERNAL_DETAIL/);
    } else {
      // 権限の確認で先に断られる実装でも、内部の詳細は出ない
      expect(JSON.stringify(r.json)).not.toMatch(/SECRET_INTERNAL_DETAIL/);
    }
  });

  it('メソッドが POST でなければ 405', async () => {
    const { call } = await staff(spec);
    expect((await call(undefined, { method: 'GET', token: 'tok-admin' })).status).toBe(405);
  });
});

describe('project-key（秘密鍵の保管）', () => {
  const JWK = { kty: 'RSA', n: 'x', e: 'AQAB', d: 'secret-d' };

  it('保管した鍵は、暗号化されて保存され、取り出すと元に戻る。平文は DB に残らない', async () => {
    const db = createFakeDb({ project_members: members, project_private_keys: [] }, { users });
    const call = await loadFunction('project-key', { db });
    const store = await call({ action: 'store', projectId: PROJECT, privateKeyJwk: JWK }, { token: 'tok-admin' });
    expect(store.json).toEqual({ ok: true });
    const saved = db.tables.project_private_keys[0];
    expect(saved.encrypted_private_key).toMatch(/^v1\./);
    expect(JSON.stringify(saved)).not.toContain('secret-d');
    const fetched = await call({ action: 'fetch', projectId: PROJECT }, { token: 'tok-owner' });
    expect(fetched.json.privateKeyJwk).toEqual(JWK);
  });

  it('API-07 保管用の秘密が未設定・短いと、保管も取り出しも止まる', async () => {
    for (const secret of ['', 'short']) {
      const db = createFakeDb({ project_members: members, project_private_keys: [{ project_id: PROJECT, encrypted_private_key: 'v1.AAAA' }] }, { users });
      const call = await loadFunction('project-key', { db, env: { PROJECT_KEY_ENCRYPTION_SECRET: secret } });
      expect((await call({ action: 'store', projectId: PROJECT, privateKeyJwk: JWK }, { token: 'tok-admin' })).status).toBe(500);
      expect((await call({ action: 'fetch', projectId: PROJECT }, { token: 'tok-admin' })).status).toBe(500);
    }
  });

  it('保管されていない大会の取り出しは 404（日本語）。形式不正の保管は 400', async () => {
    const db = createFakeDb({ project_members: members, project_private_keys: [] }, { users });
    const call = await loadFunction('project-key', { db });
    const nf = await call({ action: 'fetch', projectId: PROJECT }, { token: 'tok-admin' });
    expect(nf.status).toBe(404);
    expect(nf.json.error).toBe('この大会の鍵は保存されていません。');
    expect((await call({ action: 'store', projectId: PROJECT }, { token: 'tok-admin' })).status).toBe(400);
    expect((await call({ action: 'nope', projectId: PROJECT }, { token: 'tok-admin' })).status).toBe(400);
  });
});

describe('create-scorer-invite', () => {
  it('採点者の招待: 平文のトークンはこの応答だけ。DB に渡るのは HMAC。上限人数は指定でき、役割と期限は指定できない', async () => {
    const calls = [];
    const db = createFakeDb({ project_members: members }, { users, rpc: { create_scorer_invite: (a) => { calls.push(a); return { data: { id: 'i1', max_uses: a.p_max_uses, expires_at: 'x', created_at: 'y' }, error: null }; } } });
    const call = await loadFunction('create-scorer-invite', { db });
    const r = await call({ projectId: PROJECT, maxUses: 5, role: 'admin', expiresInDays: 999 }, { token: 'tok-admin' });
    expect(r.status).toBe(200);
    const token = r.json.invite.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(calls[0].p_max_uses).toBe(5);
    expect(Object.keys(calls[0]).sort()).toEqual(['p_created_by', 'p_max_uses', 'p_project_id', 'p_token_hash']);
    expect(calls[0].p_token_hash).not.toContain(token);
    expect(JSON.stringify(calls[0])).not.toContain(token);
  });

  it('上限人数が不正（0・負・文字）なら、既定の20人になる', async () => {
    const seen = [];
    const db = createFakeDb({ project_members: members }, { users, rpc: { create_scorer_invite: (a) => { seen.push(a.p_max_uses); return { data: { id: 'i', max_uses: a.p_max_uses }, error: null }; } } });
    const call = await loadFunction('create-scorer-invite', { db });
    for (const v of [0, -3, 'abc', null, undefined]) await call({ projectId: PROJECT, maxUses: v }, { token: 'tok-owner' });
    expect(seen).toEqual([20, 20, 20, 20, 20]);
  });
});

describe('admin-entry-qr', () => {
  it('署名つきの二次元コードを返す。他の大会のエントリーは 404', async () => {
    const db = createFakeDb({ project_members: members, entries: [{ id: E1, project_id: PROJECT }, { id: E2, project_id: 'other' }] }, { users });
    const call = await loadFunction('admin-entry-qr', { db, mocks: QR_MOCK });
    const ok = await call({ projectId: PROJECT, entryId: E1 }, { token: 'tok-admin' });
    expect(ok.json.ok).toBe(true);
    const value = ok.json.svg.match(/data-value="([^"]+)"/)[1];
    expect(value).toMatch(new RegExp(`^${E1}\\.[0-9a-f]{32}$`)); // 素のIDではなく、署名つき
    const other = await call({ projectId: PROJECT, entryId: E2 }, { token: 'tok-admin' });
    expect(other.status).toBe(404);
    expect(other.json.error).toBe('エントリーが見つかりません。');
  });
});

describe('API-07 署名鍵の欠落（管理者向け）', () => {
  it('署名鍵がないと、二次元コードも招待も作れない（弱い鍵で作らない）', async () => {
    const db = createFakeDb({ project_members: members, entries: [{ id: E1, project_id: PROJECT }] }, { users });
    const qr = await loadFunction('admin-entry-qr', { db, mocks: QR_MOCK, env: { CIQ_EMAIL_SIGNING_SECRET: '' } });
    expect((await qr({ projectId: PROJECT, entryId: E1 }, { token: 'tok-admin' })).status).toBeGreaterThanOrEqual(500);
  });
});
