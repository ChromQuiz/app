import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(import.meta.dirname, '..', p), 'utf8');

describe('答案・採点が始まったあとの設定変更', () => {
  it('答案が読み込まれているときは、問題数の変更を画面で断り、危険な操作へ案内する', () => {
    const src = read('js/admin_settings.js');
    const body = src.slice(src.indexOf('window.confirmQuestionCountChange'), src.indexOf('window.adjustNumberInput'));
    expect(body).toContain('pageCount !== 0');
    expect(body).toContain('「答案と採点を消す」');
    expect(body).toContain('return false');
  });

  it('危険な操作に「答案と採点を消す」があり、保存済みの用紙画像も消してからDBの関数を呼ぶ', () => {
    expect(read('admin.html')).toContain('data-action="clear-answers"');
    expect(read('js/admin.js')).toContain("'clear-answers': clearAnswersAndScoring");
    const api = read('js/supabase_api.js');
    const body = api.slice(api.indexOf('async clearAnswersAndScoring'));
    expect(body.indexOf('deleteAnswerPage')).toBeGreaterThan(-1);
    expect(body.indexOf('deleteAnswerPage')).toBeLessThan(body.indexOf("rpc('clear_answers_and_scoring'"));
  });

  it('DBは、答案があれば問題数を、採点の枠があれば採点者数を、直接の更新でも変えさせない', () => {
    const sql = read('supabase/migrations/202610120002_guard_scoring_settings.sql');
    expect(sql).toContain('before update of question_count, required_scorers on public.projects');
    expect(sql).toMatch(/from public\.answer_pages/);
    expect(sql).toMatch(/from public\.question_scorers/);
  });
});
