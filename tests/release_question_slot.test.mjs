// 採点の枠の解放(FND-02)。メンバーなら誰でも、まだ完了していない枠を解放できる。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

describe('release_question_scorer(データベース)', () => {
  const mig = read('supabase/migrations/202610050003_release_question_scorer.sql');

  it('所有者・管理者・採点者のメンバーなら呼べる(匿名は呼べない)', () => {
    expect(mig).toMatch(/has_project_role\(p_project_id, array\['owner', 'admin', 'scorer'\]\)/);
    expect(mig).toMatch(/revoke all on function public\.release_question_scorer\(text, integer, uuid\) from public, anon/);
    expect(mig).toMatch(/grant execute on function public\.release_question_scorer\(text, integer, uuid\) to authenticated/);
  });

  it('完了した枠は解放できない(確定の根拠になっているため)', () => {
    expect(mig).toMatch(/if v_row\.completed_at is not null then/);
    expect(mig).toContain('採点を完了した枠は解放できません。');
  });

  it('解放すると、その人のその問題での判定も消す(新しい人の判定と混ざらないように)', () => {
    expect(mig).toMatch(/delete from public\.score_votes sv[\s\S]*scorer_member_id = p_scorer_member_id/);
    expect(mig).toMatch(/delete from public\.question_scorers qs/);
  });

  it('同時に操作しても二重に消えないよう、行をロックして確認する', () => {
    expect(mig).toMatch(/for update;/);
  });

  it('誰が・どの問題の・誰の枠を・判定を何件消して解放したかを監査ログに残す', () => {
    expect(mig).toMatch(/'question_slot\.release'/);
    expect(mig).toMatch(/'deleted_votes', v_deleted/);
  });

  it('エラーは日本語', () => {
    for (const m of [...mig.matchAll(/raise exception '([^']*)'/g)].map((x) => x[1])) {
      expect(m).toMatch(/[぀-ヿ一-鿿]/);
    }
  });
});

describe('採点ボードの「採点中の枠」(画面)', () => {
  const judge = read('js/judge.js');
  const html = read('judge.html');

  it('パネルがある(完了していない枠だけを並べる)', () => {
    expect(html).toContain('id="slot-panel"');
    expect(judge).toMatch(/\.filter\(row => !row\.completed_at\)/);
  });

  it('解放の前に確認し、「判定はすべて消える」と伝える', () => {
    expect(judge).toMatch(/await showConfirm\(/);
    expect(judge).toContain('のこの問題での判定は、すべて消えます。よろしいですか？');
  });

  it('自分の枠は「あなた」と表示し、他の人は名前で表示する', () => {
    expect(judge).toMatch(/memberId === currentMemberId\) return 'あなた'/);
    expect(judge).toMatch(/memberNameMap\[memberId\]/);
  });

  it('3秒ごとの更新で、押そうとしているボタンが作り直されない(内容が変わったときだけ描く)', () => {
    expect(judge).toMatch(/if \(signature === slotPanelSignature\) return;/);
  });

  it('解放の API を呼ぶ', () => {
    expect(judge).toMatch(/CIQSupabaseAPI\.releaseQuestionScorer\(projectId, q, row\.scorer_member_id\)/);
    expect(read('js/supabase_api.js')).toMatch(/\.rpc\('release_question_scorer'/);
  });
});
