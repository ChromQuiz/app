import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function loadApi() {
  const source = read('js/supabase_api.js');
  const win = { addEventListener() {}, CIQSupabase: { getClient: () => ({}) } };
  return new Function('window', 'document', 'localStorage', `${source}\nreturn CIQSupabaseAPI;`)(win, {}, {});
}

afterEach(() => { vi.useRealTimers(); });

describe('解答欄の画像づくり: 画面は、サーバーの待ち行列の1人として動く', () => {
  it('「混んでいる」と返されたら、少し待って、やり直す。全部できたら、終わる（完了と区別する）', async () => {
    vi.useFakeTimers();
    const api = loadApi();
    const replies = [{ pages: 0, busy: true }, { pages: 2 }, { pages: 0, busy: false }];
    api.invokeAuthedFunction = vi.fn(async () => replies.shift() || { pages: 0 });
    const run = api.requestServerCellGeneration('p1', { lanes: 1 });
    await vi.advanceTimersByTimeAsync(10000);
    const result = await run;
    expect(api.invokeAuthedFunction).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ ok: true, pages: 2, denied: false });
  });

  it('一時的な失敗が1回あっても、持ち直せば、成功として扱う（「作れませんでした」と知らせない）。続けて失敗したときだけ、失敗', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const api = loadApi();
    const replies = [new Error('timeout'), { pages: 2 }, { pages: 0, busy: false }];
    api.invokeAuthedFunction = vi.fn(async () => { const r = replies.shift(); if (r instanceof Error) throw r; return r || { pages: 0 }; });
    const run = api.requestServerCellGeneration('p1', { lanes: 1 });
    await vi.advanceTimersByTimeAsync(20000);
    expect(await run).toMatchObject({ ok: true, pages: 2, transientErrors: 1, error: null });

    const api2 = loadApi();
    api2.invokeAuthedFunction = vi.fn(async () => { throw new Error('down'); });
    const run2 = api2.requestServerCellGeneration('p2', { lanes: 1 });
    await vi.advanceTimersByTimeAsync(60000);
    expect(await run2).toMatchObject({ ok: false });
    warn.mockRestore();
  });

  it('同じ大会は、同時に1組だけ動かす。流れの数（lanes）だけ、並べて呼ぶ', async () => {
    vi.useFakeTimers();
    const api = loadApi();
    api.invokeAuthedFunction = vi.fn(async () => ({ pages: 0, busy: false }));
    const first = api.requestServerCellGeneration('p1', { lanes: 8 });
    const second = api.requestServerCellGeneration('p1', { lanes: 8 });
    expect(second).toBe(first);
    await vi.advanceTimersByTimeAsync(10);
    await first;
    expect(api.invokeAuthedFunction).toHaveBeenCalledTimes(8);
  });

  it('管理者でなくて断られたら（403）、それ以降は頼まない', async () => {
    const api = loadApi();
    api.invokeAuthedFunction = vi.fn(async () => { const e = new Error('forbidden'); e.status = 403; throw e; });
    const result = await api.requestServerCellGeneration('p1', { lanes: 2 });
    expect(result.denied).toBe(true);
    const calls = api.invokeAuthedFunction.mock.calls.length;
    api.enqueueAnswerCellGeneration('p1', [{ cellStatus: null }]);
    await Promise.resolve();
    expect(api.invokeAuthedFunction.mock.calls.length).toBe(calls);
  });

  it('画像のあるカードだけなら、頼まない。まだ無いカードを見たときだけ頼む。続けては頼まない（15秒に1回）', async () => {
    const api = loadApi();
    api.invokeAuthedFunction = vi.fn(async () => ({ pages: 0, busy: false }));
    api.enqueueAnswerCellGeneration('p1', [{ cellStatus: 'ready' }, { cell_status: 'ready' }]);
    expect(api.invokeAuthedFunction).not.toHaveBeenCalled();
    api.enqueueAnswerCellGeneration('p1', [{ cellStatus: null }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const first = api.invokeAuthedFunction.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    api.enqueueAnswerCellGeneration('p1', [{ cellStatus: null }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.invokeAuthedFunction.mock.calls.length).toBe(first);
  });

  it('ブラウザで画像を作って保存する道は、なくした（サーバーだけ）。記録の書き換えは、DBの関数を通す', () => {
    const src = read('js/supabase_api.js');
    expect(src).not.toMatch(/generateAnswerCellsForPage|processAnswerCellQueue|updateAnswerCellGeneration|shouldGenerateAnswerCells/);
    expect(src).toContain("rpc('mark_answer_cell_missing'");
  });
});

describe('DB と サーバー関数', () => {
  const sql = read('supabase/migrations/202610160001_answer_cell_queue.sql');
  const fn = read('supabase/functions/generate-answer-cells/index.ts');

  it('取る関数は、全体の上限（作成中 48枚）をかけ、取る処理を1つずつにする', () => {
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toMatch(/p_max_in_flight integer default 48/);
    expect(sql).toMatch(/revoke all on function public\.claim_answer_cell_pages\(text, integer, integer\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.claim_answer_cell_pages\(text, integer, integer\) to service_role/);
  });

  it('用紙が読めなかったときだけ30分、保存の一時的な失敗は1分休む。状態が無い用紙(null)も取れる', () => {
    expect(sql).toMatch(/interval '30 minutes'/);
    expect(sql).toMatch(/status' = 'partial'[\s\S]{0,200}interval '1 minute'/);
    expect(sql).toMatch(/not coalesce\(/);
  });

  it('サーバー関数は、取れなかったとき、「全部できた」と「混んでいる」を区別して返す。用紙が読めなかったときだけ permanent', () => {
    expect(fn).toMatch(/busy = remaining > 0/);
    expect(fn).toMatch(/jsonResponse\(\{ ok: true, version: ANSWER_CELL_VERSION, pages, made, failed, busy, remaining \}\)/);
    expect(fn).toMatch(/permanent = true;/);
  });

  it('定期実行は、12本 × 4回（1分に48回）。混んでいるときは、待ってやり直す', () => {
    const worker = read('cloudflare/keepalive/src/index.js');
    expect(worker).toMatch(/ANSWER_CELL_LANES = 12/);
    expect(worker).toMatch(/ANSWER_CELL_CALLS_PER_LANE = 4/);
    expect(worker).toMatch(/result\?\.busy/);
  });
});
