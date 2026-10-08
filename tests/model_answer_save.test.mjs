import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// supabase_api.js はブラウザ用の読み込みなので、window を最小限に用意して評価する。
function loadApi(client) {
  const source = readFileSync(new URL('../js/supabase_api.js', import.meta.url), 'utf8');
  const win = { addEventListener() {}, CIQSupabase: { getClient: () => client } };
  const api = new Function('window', 'document', 'localStorage', `${source}\nreturn CIQSupabaseAPI;`)(win, {}, {});
  api.client = () => client;
  return api;
}

function fakeClient({ failUpsert = false } = {}) {
  const log = [];
  const builder = (table) => {
    const state = { op: null, args: null, filters: [] };
    const b = {
      upsert(rows, opts) { state.op = 'upsert'; state.args = { rows, opts }; return b; },
      select() { return b; },
      delete() { state.op = 'delete'; return b; },
      eq(col, val) { state.filters.push(['eq', col, val]); return b; },
      not(col, op, val) { state.filters.push(['not', col, op, val]); return b; },
      then(resolve) {
        log.push({ table, op: state.op, args: state.args, filters: state.filters });
        if (state.op === 'upsert' && failUpsert) return resolve({ data: null, error: new Error('network') });
        return resolve({ data: state.op === 'upsert' ? state.args.rows : null, error: null });
      },
    };
    return b;
  };
  return { log, from: builder };
}

describe('saveModelAnswers', () => {
  it('先に書き込み、そのあとで不要な行だけを消す(失敗しても既存の答えは残る)', async () => {
    const client = fakeClient();
    const api = loadApi(client);
    await api.saveModelAnswers('p1', [{ answer: '東京', altAnswers: ['とうきょう'] }, '', { answer: '大阪' }]);
    expect(client.log.map(entry => entry.op)).toEqual(['upsert', 'delete']);
    expect(client.log[0].args.rows.map(row => row.question_number)).toEqual([1, 3]);
    const cleanup = client.log[1].filters;
    expect(cleanup).toContainEqual(['eq', 'project_id', 'p1']);
    expect(cleanup).toContainEqual(['not', 'question_number', 'in', '(1,3)']);
  });

  it('書き込みに失敗したら何も消さない', async () => {
    const client = fakeClient({ failUpsert: true });
    const api = loadApi(client);
    await expect(api.saveModelAnswers('p1', [{ answer: '東京' }])).rejects.toThrow('network');
    expect(client.log.map(entry => entry.op)).toEqual(['upsert']);
  });

  it('すべて空にしたときは、その大会の行をすべて消す', async () => {
    const client = fakeClient();
    const api = loadApi(client);
    await api.saveModelAnswers('p1', ['', '']);
    expect(client.log.map(entry => entry.op)).toEqual(['delete']);
    expect(client.log[0].filters).toEqual([['eq', 'project_id', 'p1']]);
  });
});
