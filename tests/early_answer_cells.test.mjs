import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function loadApi() {
  const source = readFileSync(new URL('../js/supabase_api.js', import.meta.url), 'utf8');
  const win = { addEventListener() {}, CIQSupabase: { getClient: () => ({}) } };
  return new Function('window', 'document', 'localStorage', `${source}\nreturn CIQSupabaseAPI;`)(win, {}, {});
}

describe('取り込み中に作る先頭問題の解答欄画像', () => {
  it('保存する行に、作成済みの問題を引き継げる', () => {
    const api = loadApi();
    const generation = api.buildCellGenerationPatch({ q1: 'ready', q2: 'ready' }, 0);
    const saved = api.normalizeCellsForSave({ q1: { x: 1, y: 2, w: 3, h: 4 } }, 840, generation);
    expect(saved.cellGeneration.questions).toEqual({ q1: 'ready', q2: 'ready' });
    expect(saved.cellGeneration.status).toBe('partial');
    expect(api.getCellStatus(saved, 1)).toBe('ready');
    expect(api.getCellStatus(saved, 3)).toBe(null);
  });

  it('指定がなければ、これまでどおり「未生成」で保存する', () => {
    const api = loadApi();
    const saved = api.normalizeCellsForSave({}, 840);
    expect(saved.cellGeneration.status).toBe('not_started');
    expect(saved.cellGeneration.questions).toEqual({});
  });

  it('取り込み処理は、保存した用紙画像から切り出し、作れた問題だけ記録する', () => {
    const source = readFileSync(new URL('../js/admin_prep.js', import.meta.url), 'utf8');
    expect(source).toContain('EARLY_CELL_QUESTIONS');
    expect(source).toContain('cropEarlyCells(sc, cellRegions, workCanvas.width');
    expect(source).toContain("earlyQuestions[`q${early.questionNumber}`] = 'ready'");
  });
});
