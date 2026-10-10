import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function loadApi() {
  const source = readFileSync(new URL('../js/supabase_api.js', import.meta.url), 'utf8');
  const win = { addEventListener() {}, CIQSupabase: { getClient: () => ({}) } };
  return new Function('window', 'document', 'localStorage', `${source}\nreturn CIQSupabaseAPI;`)(win, {}, {});
}

describe('解答欄画像の生成：書き込み権限がない人（採点者）の画面', () => {
  it('権限エラーだけを「書き込めない」と判定する', () => {
    const api = loadApi();
    expect(api.isAnswerCellWriteDenied({ code: 'PGRST116' })).toBe(true);
    expect(api.isAnswerCellWriteDenied({ message: 'new row violates row-level security policy' })).toBe(true);
    expect(api.isAnswerCellWriteDenied({ statusCode: '403' })).toBe(true);
    expect(api.isAnswerCellWriteDenied(new Error('network'))).toBe(false);
  });

  it('一度書き込めないと分かったら、生成の予約もしない', () => {
    const api = loadApi();
    api._answerCellWriteDenied = true;
    api.enqueueAnswerCellGeneration('p1', [{
      entryId: 'e1', entryNumber: 1, storagePath: 'p1/1/page.webp',
      cells: { regions: { q1: { x: 0, y: 0, w: 1, h: 1 } }, pageWidth: 10 },
    }]);
    expect(api._answerCellQueue.length).toBe(0);
  });
});
