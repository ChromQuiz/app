// 要確認ページ(conflict.html)の回帰テスト。
//
// 採点ページ(question.html)と挙動を揃えるための不変条件を固定する。
// 元の不具合: 背景プリロードが cellUrlCache を埋めるだけで DOM を更新せず、
// あとから交差監視が発火しても queueConflictImage が「取得済み」として弾くため、
// カードが「画像を読み込み中」のまま永久に残っていた。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

const conflictSrc = read('js/conflict.js');
const questionSrc = read('js/question.js');
const css = read('css/pages.css');

function sliceFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced ${name}`);
}

describe('画像のプレースホルダは必ず終着点に到達する', () => {
  it('背景プリロードは取得後に DOM へ反映する', () => {
    const fn = sliceFn(conflictSrc, 'scheduleBackgroundConflictImages');
    expect(fn).toMatch(/ensureConflictCellUrls\(batch\)/);
    expect(fn).toMatch(/updateVisibleConflictImages\(batch\)/);
  });

  it('取得済みのキーはキューで握り潰さず、その場で反映する', () => {
    const fn = sliceFn(conflictSrc, 'queueConflictImage');
    expect(fn).toMatch(/typeof cached === 'string'/);
    expect(fn).toMatch(/updateVisibleConflictImages\(\[\{ key \}\]\)/);
    // 「undefined 以外なら何もしない」という元の早期 return は復活させない
    expect(fn).not.toMatch(/cellUrlCache\[key\] !== undefined\) return;/);
  });

  it('取得中(null)を「画像がありません」と確定させない', () => {
    const fn = sliceFn(conflictSrc, 'updateVisibleConflictImages');
    expect(fn).toMatch(/typeof cellUrl !== 'string'\) return;/);
  });

  it('取得中と取得済みをカード生成時に区別する', () => {
    const fn = sliceFn(conflictSrc, 'createConflictCard');
    expect(fn).toMatch(/typeof cellUrl === 'string'/);
    expect(fn).toMatch(/isResolved \? ' 画像がありません' : ' 画像を読み込み中'/);
    // hasOwnProperty 版は null(取得中)を取得済みと誤判定するので戻さない
    expect(fn).not.toMatch(/hasOwnProperty/);
  });

  it('描画の最後に取りこぼしを掃く', () => {
    const fn = sliceFn(conflictSrc, 'render');
    expect(fn).toMatch(/updateVisibleConflictImages\(\);/);
  });
});

describe('確定してもカードは動かない', () => {
  it('確定済みカードを末尾へ送る order を持たない', () => {
    const rule = css.match(/\.conflict-card\.resolved \{[^}]*\}/)[0];
    expect(rule).not.toMatch(/order:/);
    expect(rule).toMatch(/opacity:/);
  });
});

describe('開いたときは未確定の先頭が選ばれる', () => {
  it('先頭固定ではなく未確定を探す', () => {
    const fn = sliceFn(conflictSrc, 'render');
    expect(fn).toMatch(/const firstUnresolved = currentConflicts\.findIndex\(conflict => !conflict\.finalResult\)/);
    expect(fn).toMatch(/selectedIndex = firstUnresolved >= 0 \? firstUnresolved : 0/);
  });

  it('採点ページも同じ考え方で初期選択している', () => {
    const fn = sliceFn(questionSrc, 'setInitialSelectionToFirstUnscored');
    expect(fn).toMatch(/findIndex\(card => myScores\[card\.entryId\] === null\)/);
    expect(fn).toMatch(/firstUnscoredIndex >= 0 \? firstUnscoredIndex : 0/);
  });

  it('判定後の送りは両ページとも単純に次のカードへ', () => {
    expect(sliceFn(conflictSrc, 'advanceConflictSelection')).toMatch(/selectedIndex \+ 1/);
    expect(sliceFn(questionSrc, 'advanceSelection')).toMatch(/selectedIndex \+ 1/);
  });
});

describe('判定の挙動が採点ページと揃っている', () => {
  it('書き込みを待たずに手元の状態を反映する', () => {
    const fn = sliceFn(conflictSrc, 'setFinal');
    expect(fn).toMatch(/applyLocalFinalResult\(q, entryId, result\)/);
    expect(fn).toMatch(/await render\(\);/);
    // 失敗したら元に戻す
    expect(fn).toMatch(/rollback\(\)/);
  });

  it('選択を進めてから書き込む(render の選択復元と競合させない)', () => {
    const fn = sliceFn(conflictSrc, 'scoreSelectedConflict');
    const advanceAt = fn.indexOf('advanceConflictSelection()');
    const writeAt = fn.indexOf('setFinal(');
    expect(advanceAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(advanceAt);
    // 書き込み完了後に進める形には戻さない
    expect(fn).not.toMatch(/\.then\(advanceConflictSelection\)/);
  });

  it('採点ページと同じ押下フィードバックを出す', () => {
    expect(sliceFn(conflictSrc, 'scoreSelectedConflict')).toMatch(/score-pop/);
    expect(sliceFn(questionSrc, 'scoreSelected')).toMatch(/score-pop/);
  });

  it('キーボードもボタンと同じ入口を通る', () => {
    expect(conflictSrc).toMatch(/if \(key === 'm' \|\| key === 'M'\) \{\s*\n\s*e\.preventDefault\(\);\s*\n\s*scoreSelectedConflict\('correct'\);/);
    expect(conflictSrc).toMatch(/scoreSelectedConflict\('wrong'\);/);
    expect(conflictSrc).not.toMatch(/setFinal\([^)]*\)\.then\(/);
  });
});

describe('要確認の一覧は、サーバーの定義だけで決める', () => {
  it('取得できなかったときに、画面側で別の計算に切り替えない', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../js/conflict.js', import.meta.url), 'utf8');
    expect(src).not.toContain('scoreConflictRpcAvailable');
    expect(src).not.toContain('falling back to client calculation');
    expect(src).not.toMatch(/listScoreVotes|listFinalResults|listQuestionScorers|listAnswerPages|listModelAnswers/);
    expect(src).toContain('CIQSupabaseAPI.listScoreConflicts(projectId),');
  });

  it('自動更新の一時的な失敗は、いまの一覧を残して、次の更新で取り直す', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../js/conflict.js', import.meta.url), 'utf8');
    expect(src).toContain("refreshData().catch((error) => console.warn('要確認の更新に失敗:', error));");
  });
});

describe('要確認: 判定の並び・即時の色変更', () => {
  it('採点者の名前は出さず、判定を同じ行に並べる', () => {
    expect(conflictSrc).not.toContain('memberNameMap');
    expect(conflictSrc).toContain("votes.className = 'votes-mini'");
    // 模範解答の行に入れない(入れると模範解答が削られて読めなくなる)
    expect(conflictSrc).not.toMatch(/reviewRow\.append\([^)]*votes/);
  });

  it('要確認と採点のカードに、受付番号の行を置かない', () => {
    expect(conflictSrc).not.toContain("'entry-num'");
    expect(questionSrc).not.toContain("'entry-num'");
  });

  it('判定した瞬間に、再描画や再取得を待たずにカードの色を変える', () => {
    const body = sliceFn(conflictSrc, 'setFinal');
    const paintAt = body.indexOf('paintConflictResult(');
    const rpcAt = body.indexOf('resolveScoreConflict(');
    expect(paintAt).toBeGreaterThan(-1);
    expect(paintAt).toBeLessThan(rpcAt);
    expect(body.slice(0, rpcAt)).not.toContain('await render()');
  });

  it('模範解答の行は、カードの色を隠さない(背景を塗らない)', () => {
    const rule = css.match(/\.conflict-review-row \{[^}]*\}/)[0];
    expect(rule).toContain('background: transparent');
  });

  it('保存前の判定を再取得の結果に重ねる(連打しても色が戻らない)', () => {
    expect(conflictSrc).toContain('pendingFinals');
    const refresh = sliceFn(conflictSrc, 'refreshDataInternal');
    expect(refresh).toContain('pendingFinals.get(key)');
  });

  it('判定・確定だけが変わったときは、カードを作り直さずその場で直す', () => {
    expect(conflictSrc).toContain('patchConflictCards();');
    expect(conflictSrc).toContain('getConflictStructureSignature');
  });
});

describe('管理者として開く・管理者が覆したもの', () => {
  const judgeSrc = read('js/judge.js');

  it('採点ボードの「…」に、管理者だけ「管理者として開く」がある。「開き直す」は無い', () => {
    expect(judgeSrc).toContain("'管理者として開く'");
    expect(judgeSrc).toContain('conflict.html?q=${questionNumber}');
    expect(judgeSrc).not.toContain('開き直す');
    expect(read('js/supabase_api.js')).not.toContain('reopen_question_scoring');
  });

  it('?q=N で、その問題の確認済みの全員の答案を、要確認と同じカードで出す', () => {
    expect(conflictSrc).toContain('CIQSupabaseAPI.listQuestionReview(projectId, reviewQuestion)');
  });

  it('管理者が覆したものを、要確認の先頭に、別の見出しで並べる', () => {
    expect(conflictSrc).toContain('CIQSupabaseAPI.listAdminOverrides(projectId)');
    expect(conflictSrc).toContain("row.section = 'override'");
    expect(read('conflict.html')).toContain('管理者が覆したもの');
    const compare = sliceFn(conflictSrc, 'compareConflictsByQuestionAndEntry');
    expect(compare).toContain("section === 'override' ? 0 : 1");
  });
});

describe('選択とフォーカス', () => {
  it('選択を進めたとき、前のカードにフォーカスを残さない（青い枠が2枚に出ない）', () => {
    for (const src of [conflictSrc, questionSrc]) {
      expect(src).toContain('青い枠が2枚に出る');
      expect(src).toMatch(/active !== cards\[selectedIndex\]/);
    }
  });
});

describe('要確認: 未確定の色', () => {
  it('まだ確定していないカードは、黄色（保留と同じ色）にする', () => {
    const ds = read('css/design_system.css');
    expect(ds).toMatch(/\.answer-card\.hold,\s*\.conflict-card:not\(\.resolved\) \{\s*border-color: var\(--warn-500\);/);
  });
});

describe('選択中のリング', () => {
  it('選択中でも、カード自身の枠（確定・未確定の色）は変えない。少し離した外側のリングで示す', () => {
    const ds = read('css/design_system.css');
    const rule = ds.match(/\.answer-card\.selected,\s*\.conflict-card\.selected \{[^}]*\}/)[0];
    expect(rule).not.toContain('border-color');
    expect(rule).toContain('0 0 0 2px var(--canvas), 0 0 0 5px var(--accent)');
  });
});

describe('要確認の件数', () => {
  it('採点ページと同じく、確定した件数 / 全件で出す（残りの数ではない）', () => {
    expect(conflictSrc).toContain('`${conflictList.length - unresolvedCount} / ${conflictList.length}件`');
  });
});
