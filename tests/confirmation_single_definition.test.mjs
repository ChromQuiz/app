import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(import.meta.dirname, '..', p), 'utf8');

describe('「確定しているか」は、データベースの1つの定義', () => {
  const stats = read('js/admin_stats.js');

  it('集計とアナリティクスは、問題ごとの確定の状態を、DBの定義から取る', () => {
    expect(stats).toContain('listQuestionConfirmation(projectId)');
    expect(stats).not.toContain('listScoreConflicts');
    expect(stats).not.toContain('__completed__');
  });

  it('CSV・採点済みPDFは、出す直前にも、全問が確定しているかを確かめる', () => {
    expect(stats).toMatch(/async function exportCSV\(\) \{\s*if \(!\(await assertAllQuestionsConfirmed\(\)\)\) return;/);
    expect(read('js/admin.js')).toMatch(/async function runGradedPdfExport\(\) \{\s*if \(!\(await assertAllQuestionsConfirmed\(\)\)\) return;/);
  });

  it('成績照会を有効にするとき、確定していない問題があれば、先に知らせる', () => {
    const settings = read('js/admin_settings.js');
    const body = settings.slice(settings.indexOf('async function toggleDisclosureOpen'));
    expect(body.indexOf('listQuestionConfirmation')).toBeLessThan(body.indexOf('updateProject'));
    expect(body).toContain('成績はまだ出ていません');
  });

  it('DBは、問題ごとの定義を内部の関数にまとめ、成績照会の確認と管理者の画面が、同じものを使う', () => {
    const sql = read('supabase/migrations/202610120006_question_confirmation_single_definition.sql');
    expect(sql).toContain('revoke all on function public.question_confirmation_rows(text) from public, anon, authenticated;');
    expect(sql).toMatch(/from public\.question_confirmation_rows\(p_project_id\)/);
    expect(sql).toContain('grant execute on function public.list_question_confirmation(text) to authenticated;');
    expect(sql).toContain('grant execute on function public.scoring_confirmation(text) to service_role;');
  });
});
