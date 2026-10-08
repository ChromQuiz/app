// Edge Function の本物の処理を、Node（vitest）で動かすための部品。
//
// - Deno.serve を差し替えてハンドラを受け取る
// - supabase クライアントを、メモリ上の表で動く偽物に差し替える（select / update / insert / delete / rpc / auth.getUser）
// - 各関数の import（_shared/*.ts）は本物のまま使う
//
// 偽の DB は、更新を「条件に合う行だけ」「1 回の操作で」行うので、条件つき UPDATE（二重受付の防止など）の動きも確かめられる。

import { vi } from 'vitest';

export function createFakeDb(initialTables, { users = {}, rpc = {} } = {}) {
  const tables = Object.fromEntries(Object.entries(initialTables).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
  const log = { rpcCalls: [], updates: [], inserts: [] };
  let seq = 0;

  function builder(name) {
    const st = { op: 'select', filters: [], patch: null, rows: null, sel: false, mode: 'many', limit: null };
    const rows = () => (tables[name] ??= []);
    const matches = (row) => st.filters.every((f) => f(row));
    const api = {
      select: () => { st.sel = true; return api; },
      update: (patch) => { st.op = 'update'; st.patch = patch; return api; },
      insert: (r) => { st.op = 'insert'; st.rows = Array.isArray(r) ? r : [r]; return api; },
      delete: () => { st.op = 'delete'; return api; },
      eq: (k, v) => { st.filters.push((r) => r[k] === v); return api; },
      neq: (k, v) => { st.filters.push((r) => r[k] !== v); return api; },
      in: (k, vs) => { st.filters.push((r) => vs.includes(r[k])); return api; },
      is: (k, v) => { st.filters.push((r) => (v === null ? r[k] == null : r[k] === v)); return api; },
      not: (k, op, v) => { st.filters.push((r) => (op === 'is' && v === null ? r[k] != null : r[k] !== v)); return api; },
      lt: (k, v) => { st.filters.push((r) => r[k] < v); return api; },
      lte: (k, v) => { st.filters.push((r) => r[k] <= v); return api; },
      gt: (k, v) => { st.filters.push((r) => r[k] > v); return api; },
      gte: (k, v) => { st.filters.push((r) => r[k] >= v); return api; },
      order: () => api,
      limit: (n) => { st.limit = n; return api; },
      single: () => { st.mode = 'single'; return api; },
      maybeSingle: () => { st.mode = 'maybe'; return api; },
      then: (resolve, reject) => Promise.resolve().then(exec).then(resolve, reject),
    };
    function shape(found) {
      if (st.mode === 'single') {
        return found.length === 1
          ? { data: { ...found[0] }, error: null }
          : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
      }
      if (st.mode === 'maybe') return { data: found[0] ? { ...found[0] } : null, error: found.length > 1 ? { message: 'multiple rows' } : null };
      return { data: found.map((r) => ({ ...r })), error: null };
    }
    function exec() {
      if (st.op === 'select') {
        let found = rows().filter(matches);
        if (st.limit != null) found = found.slice(0, st.limit);
        return shape(found);
      }
      if (st.op === 'update') {
        const found = rows().filter(matches);
        found.forEach((r) => Object.assign(r, st.patch));
        log.updates.push({ table: name, patch: st.patch, count: found.length });
        return st.sel ? shape(found) : { data: null, error: null };
      }
      if (st.op === 'insert') {
        const added = st.rows.map((r) => ({ id: `gen-${++seq}`, ...r }));
        rows().push(...added);
        log.inserts.push({ table: name, rows: added });
        return st.sel ? shape(added) : { data: null, error: null };
      }
      if (st.op === 'delete') {
        const found = rows().filter(matches);
        tables[name] = rows().filter((r) => !found.includes(r));
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }
    return api;
  }

  const client = {
    from: builder,
    auth: {
      getUser: async (token) => {
        const user = users[token];
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid token' } };
      },
    },
    rpc: async (fn, args) => {
      log.rpcCalls.push({ fn, args });
      if (rpc[fn]) return rpc[fn](args);
      if (fn === 'rate_limit_hit') return { data: 0, error: null };
      return { data: null, error: null };
    },
  };
  return { client, tables, log };
}

export const TEST_ENV = {
  CIQ_EMAIL_SIGNING_SECRET: 'test-signing-secret-0123456789abcdef0123456789abcdef',
  CIQ_ALLOWED_ORIGINS: 'https://example.test',
};

/** Edge Function を読み込み、Request を渡して Response を返す関数を返す。 */
export async function loadFunction(name, { db, env = {} }) {
  vi.resetModules();
  const fullEnv = { ...TEST_ENV, ...env };
  let handler = null;
  globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => fullEnv[k] } };
  vi.doMock('../../supabase/functions/_shared/supabase.ts', () => ({ createServiceClient: () => db.client }));
  await import(`../../supabase/functions/${name}/index.ts`);
  if (!handler) throw new Error(`${name}: Deno.serve のハンドラを取得できなかった`);
  return async function call(body, { token, ip = '203.0.113.9', method = 'POST' } = {}) {
    const headers = { 'content-type': 'application/json', 'x-forwarded-for': ip };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await handler(new Request('https://fn.test/' + name, { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined }));
    let json = null;
    try { json = await res.json(); } catch { /* 本文なし */ }
    return { status: res.status, json };
  };
}
