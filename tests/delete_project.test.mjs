// 大会の削除: 権限、確認、Storage の片付け、データベースの削除の順序
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeDb, loadFunction } from './helpers/edge_harness.mjs';

const PROJECT = 'ciq9';
const users = { 'tok-owner': { id: 'u-owner' }, 'tok-admin': { id: 'u-admin' }, 'tok-scorer': { id: 'u-scorer' }, 'tok-removed': { id: 'u-removed' }, 'tok-outsider': { id: 'u-out' } };
const members = [
  { id: 'm-owner', project_id: PROJECT, user_id: 'u-owner', role: 'owner', status: 'active' },
  { id: 'm-admin', project_id: PROJECT, user_id: 'u-admin', role: 'admin', status: 'active' },
  { id: 'm-scorer', project_id: PROJECT, user_id: 'u-scorer', role: 'scorer', status: 'active' },
  { id: 'm-removed', project_id: PROJECT, user_id: 'u-removed', role: 'admin', status: 'removed' },
  { id: 'm-other', project_id: 'other', user_id: 'u-out', role: 'admin', status: 'active' },
];

// 偽の Storage: パスの一覧から、フォルダ(id なし)とファイル(id あり)を返す
function fakeStorage(initial) {
  const files = { ...Object.fromEntries(Object.entries(initial).map(([b, p]) => [b, new Set(p)])) };
  const removeCalls = [];
  return {
    files,
    removeCalls,
    from(bucket) {
      files[bucket] ??= new Set();
      return {
        async list(prefix) {
          const seen = new Map();
          for (const path of files[bucket]) {
            if (!path.startsWith(prefix + '/')) continue;
            const rest = path.slice(prefix.length + 1).split('/');
            if (rest.length === 1) seen.set(rest[0], { name: rest[0], id: 'f-' + path });
            else if (!seen.has(rest[0])) seen.set(rest[0], { name: rest[0], id: null });
          }
          return { data: [...seen.values()], error: null };
        },
        async remove(paths) {
          removeCalls.push({ bucket, paths });
          for (const path of paths) files[bucket].delete(path);
          return { data: [], error: null };
        },
      };
    },
  };
}

async function setup({ storage, rpc } = {}) {
  const db = createFakeDb({ project_members: members }, { users, rpc: { delete_project_data: () => ({ data: [{ ok: true }], error: null }), ...rpc } });
  const store = fakeStorage(storage || {
    'answer-pages': [`${PROJECT}/1/page.webp`, `${PROJECT}/2/page.webp`, 'ciq10/1/page.webp'],
    'answer-cells': [`${PROJECT}/1/q1.webp`, `${PROJECT}/1/q2.webp`, `${PROJECT}/2/q1.webp`, 'ciq10/1/q1.webp'],
    'project-icon': [`${PROJECT}/icon.png`, 'ciq10/icon.png'],
  });
  db.client.storage = store;
  const call = await loadFunction('delete-project', { db });
  return { db, store, call };
}
const body = { projectId: PROJECT, confirmProjectId: PROJECT };

describe('delete-project', () => {
  it('認証なし・無効なトークンは 401。何も消えない', async () => {
    const { db, store, call } = await setup();
    expect((await call(body)).status).toBe(401);
    expect((await call(body, { token: 'bogus' })).status).toBe(401);
    expect(store.removeCalls).toEqual([]);
    expect(db.log.rpcCalls).toEqual([]);
  });

  it('採点者・外された人・別の大会のメンバーは 403。何も消えない', async () => {
    const { db, store, call } = await setup();
    for (const token of ['tok-scorer', 'tok-removed', 'tok-outsider']) {
      const r = await call(body, { token });
      expect(r.status, token).toBe(403);
      expect(r.json.error).toMatch(/権限/);
    }
    expect(store.removeCalls).toEqual([]);
    expect(db.log.rpcCalls).toEqual([]);
  });

  it('確認の大会 ID が違う・無いと 400。何も消えない', async () => {
    const { db, store, call } = await setup();
    for (const confirmProjectId of ['', undefined, 'ciq10', 'CIQ9']) {
      const r = await call({ projectId: PROJECT, confirmProjectId }, { token: 'tok-owner' });
      expect(r.status).toBe(400);
    }
    expect(store.removeCalls).toEqual([]);
    expect(db.log.rpcCalls).toEqual([]);
  });

  it('危険な大会 ID(パスを広げる値)は 400', async () => {
    const { store, call } = await setup();
    for (const projectId of ['', '../ciq10', 'a/b', '.', 'x'.repeat(65)]) {
      const r = await call({ projectId, confirmProjectId: projectId }, { token: 'tok-owner' });
      expect(r.status, projectId).toBe(400);
    }
    expect(store.removeCalls).toEqual([]);
  });

  it('所有者・管理者は、その大会のファイルだけを消し、そのあとでデータベースを消す', async () => {
    for (const token of ['tok-owner', 'tok-admin']) {
      const { db, store, call } = await setup();
      const r = await call(body, { token });
      expect(r.status, token).toBe(200);
      expect(r.json.ok).toBe(true);
      expect([...store.files['answer-pages']]).toEqual(['ciq10/1/page.webp']);
      expect([...store.files['answer-cells']]).toEqual(['ciq10/1/q1.webp']);
      expect([...store.files['project-icon']]).toEqual(['ciq10/icon.png']);
      expect(db.log.rpcCalls).toEqual([{ fn: 'delete_project_data', args: { p_project_id: PROJECT, p_actor_user_id: users[token].id } }]);
    }
  });

  it('Storage の削除が失敗したら、データベースは消さない(やり直せる)', async () => {
    const { db, store, call } = await setup();
    const from = store.from.bind(store);
    store.from = (bucket) => ({ ...from(bucket), remove: async () => ({ data: null, error: new Error('storage down') }) });
    const r = await call(body, { token: 'tok-owner' });
    expect(r.status).toBe(500);
    expect(db.log.rpcCalls).toEqual([]);
  });
});

describe('delete_project_data(migration)', () => {
  const sql = readFileSync(resolve(import.meta.dirname, '../supabase/migrations/202611240001_delete_project.sql'), 'utf8');

  it('service_role だけが実行できる(ブラウザからは呼べない)', () => {
    expect(sql).toMatch(/revoke all on function public\.delete_project_data\(text, uuid\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.delete_project_data\(text, uuid\) to service_role;/);
    expect(sql).not.toMatch(/to authenticated/);
  });

  it('SQL でも、その大会の有効な所有者・管理者かを確かめる', () => {
    expect(sql).toContain("pm.status = 'active'");
    expect(sql).toContain("array['owner', 'admin']");
    expect(sql).toContain("raise exception 'Forbidden'");
  });

  it('監査ログは、大会に紐づけず(消えないように)、大会 ID だけを残す', () => {
    expect(sql).toMatch(/values \(null, p_actor_user_id, 'staff', 'project_deleted', 'projects', p_project_id\)/);
  });
});
