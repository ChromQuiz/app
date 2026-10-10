// 機能一覧(docs/feature_inventory.md)の検出事項のうち、直したものの回帰テスト。

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { isEntryWindowOpen, isWithinPeriod } from '../supabase/functions/_shared/entry_window.ts';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const fnDirs = readdirSync(resolve(ROOT, 'supabase/functions')).filter((d) => !d.startsWith('_'));
const fnSources = Object.fromEntries(fnDirs.map((d) => [d, read(`supabase/functions/${d}/index.ts`)]));

describe('FND-04: Edge Function のエラーは日本語で返す', () => {
  it('英語で始まる error を返す応答がない', () => {
    const offenders = [];
    for (const [fn, src] of Object.entries(fnSources)) {
      for (const m of src.matchAll(/jsonResponse\(\{ error: ['`]([^'`]*)['`]/g)) {
        // 日本語を1文字も含まない(=英語だけの)メッセージを拾う
        if (!/[\u3040-\u30ff\u4e00-\u9fff]/.test(m[1])) offenders.push(`${fn}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('変数経由で返す文言にも、英語（Entry not found など）が残っていない', () => {
    const offenders = [];
    for (const [fn, src] of Object.entries(fnSources)) {
      for (const m of src.matchAll(/\?\s*'([A-Z][A-Za-z ]{6,})'\s*:/g)) offenders.push(`${fn}: ${m[1]}`);
    }
    expect(offenders).toEqual([]);
  });

  it('画面側のフォールバックにも英語の「◯◯ failed」が残っていない', () => {
    const api = read('js/supabase_api.js');
    const offenders = [...api.matchAll(/data\?\.error \|\| '([^']*)'/g)].map((m) => m[1]).filter((t) => /^[A-Za-z]/.test(t));
    expect(offenders).toEqual([]);
  });

  it('成績照会のエラーは日本語で、対象外・期間外が区別できる', () => {
    const src = fnSources['disclose-result'];
    expect(src).toContain('成績照会は現在利用できません。');
    expect(src).toContain('成績照会はまだ始まっていません。');
    expect(src).toContain('成績照会は終了しました。');
    expect(src).toContain('このエントリーは成績照会の対象外です。');
  });
});

describe('FND-05: 運営画面のショートカットは画面のフェーズ番号と同じ', () => {
  const src = read('js/admin.js');
  const keyToTab = Object.fromEntries([...src.matchAll(/KeyboardShortcuts\.register\('(\d)', '[^']*', \(\) => switchTab\('([^']+)'\)\)/g)].map((m) => [m[1], m[2]]));

  it('1 準備 / 2 公開 / 3 当日 / 4 採点 / 5 結果 / 6 設定', () => {
    expect(keyToTab).toEqual({
      1: 'tab-prep', 2: 'tab-entries', 3: 'tab-checkin', 4: 'tab-scan', 5: 'tab-stats', 6: 'tab-settings',
    });
  });

  it('admin.html のフェーズ番号の並びと一致する', () => {
    const html = read('admin.html');
    const order = [...html.matchAll(/<button type="button" class="phase-quick-btn[^"]*" data-tab-target="([^"]+)"><span>(\d)<\/span>/g)].map((m) => [m[2], m[1]]);
    for (const [num, tab] of order) expect(keyToTab[num]).toBe(tab);
  });
});

describe('FND-06: メール認証後のフォーム保持は、サーバーのトークンより短い', () => {
  it('画面側は29分(サーバーは30分)', () => {
    expect(read('js/entry.js')).toMatch(/const SESSION_TIMEOUT = 29 \* 60 \* 1000;/);
    expect(read('supabase/functions/_shared/email_verify.ts')).toMatch(/EMAIL_VERIFIED_TTL_MS = 30 \* 60 \* 1000/);
  });
});

describe('FND-01 / FND-03: 採点・集計・成績照会の対象は、当日受付を済ませた人だけ', () => {
  const stats = read('js/admin_stats.js');
  const graded = read('js/admin_graded_pdf.js');

  it('集計・CSV・アナリティクス・採点済みPDFは、タブの開き方で変わる entryNumbers を使わない', () => {
    expect(stats).not.toMatch(/\bentryNumbers\b/);
    expect(graded).not.toMatch(/\bentryNumbers\b/);
  });

  it('対象は checked_in の人で、使う前にサーバーから取り直す', () => {
    expect(stats).toMatch(/entry\.checked_in === true/);
    expect(stats).toMatch(/async function refreshScoringEntryNumbers/);
    for (const name of ['updateStatsView', 'exportCSV', 'exportAnalyticsCSV']) {
      const body = stats.slice(stats.indexOf(`async function ${name}`));
      expect(body.slice(0, 400)).toContain('refreshScoringEntryNumbers()');
    }
    expect(graded).toContain('await refreshScoringEntryNumbers();');
  });

  it('成績照会も同じ対象(受付済み)で順位を付け、受付していない人は対象外', () => {
    const src = read('supabase/functions/disclose-result/index.ts');
    expect(src).toMatch(/\.eq\('checked_in', true\)/);
    expect(src).toMatch(/authEntry\.checked_in !== true/);
    expect(src).not.toMatch(/\.in\('status', \['registered', 'late'\]\)/);
  });

  it('マイエントリーは、受付済みの人にだけ成績の欄を出す', () => {
    expect(read('supabase/functions/my-entry/index.ts')).toMatch(/isWithinPeriod\(project\.disclosure_period_start, project\.disclosure_period_end\)\s*&& checkedIn/);
  });

  it('要確認の数え方は、要確認ページと同じデータベースの定義(list_score_conflicts)を使う', () => {
    expect(stats).toMatch(/CIQSupabaseAPI\.listScoreConflicts\(projectId\)/);
    expect(stats).not.toMatch(/scoringEntryNumbers\.forEach\(en => \{\s*const qs = scoresData/);
  });

  it('取得に失敗したときは、CSVの出力を許可しない', () => {
    expect(stats).toMatch(/dataLoaded = false/);
    expect(stats).toMatch(/allConfirmed && dataLoaded/);
  });
});

describe('FND-03: 採点系のデータベース関数が、受付済みの人だけを対象にする(マイグレーション)', () => {
  const mig = read('supabase/migrations/202610050001_score_checked_in_entries_only.sql');
  const fn = (name) => {
    const m = mig.match(new RegExp(`create or replace function public\\.${name}\\(.*?\\n\\$\\$;`, 's'));
    expect(m, name).toBeTruthy();
    return m[0];
  };

  it('答案カードと要確認の一覧は checked_in の人だけ', () => {
    expect(fn('list_question_answer_cards')).toMatch(/e\.checked_in = true/);
    expect(fn('list_score_conflicts')).toMatch(/e\.checked_in = true/);
  });

  it('確定の対象は checked_in の人(状態が登録済み・遅刻連絡済みという条件は外す)', () => {
    const body = fn('complete_question_scoring');
    expect(body).toMatch(/e\.checked_in = true/);
    expect(body).not.toMatch(/e\.status in \('registered', 'late'\)/);
  });

  it('受付済みでない人の答案には、新しい判定を付けられない(日本語のエラー)', () => {
    const body = fn('set_score_vote');
    expect(body).toMatch(/e\.checked_in = true/);
    expect(body).toContain('受付済みでない参加者の答案は採点できません。');
  });

  it('引数と返す列は変えない(create or replace なので権限も保たれる)', () => {
    expect(mig).not.toMatch(/drop function/i);
  });
});

describe('FND-07: 編集は受付中、遅刻の連絡は受付が終わってから', () => {
  const open = { entry_open: true, period_start: '2026-01-01T00:00:00Z', period_end: '2026-12-31T00:00:00Z' };
  const now = Date.parse('2026-06-01T00:00:00Z');

  it('受付中: スイッチがオンで期間内', () => {
    expect(isEntryWindowOpen(open, now)).toBe(true);
  });

  it('受付中でない: 停止中 / 開始前 / 終了後', () => {
    expect(isEntryWindowOpen({ ...open, entry_open: false }, now)).toBe(false);
    expect(isEntryWindowOpen(open, Date.parse('2025-12-31T00:00:00Z'))).toBe(false);
    expect(isEntryWindowOpen(open, Date.parse('2027-01-01T00:00:00Z'))).toBe(false);
  });

  it('期間が未設定なら、スイッチだけで決まる', () => {
    expect(isEntryWindowOpen({ entry_open: true, period_start: null, period_end: null }, now)).toBe(true);
    expect(isEntryWindowOpen({ entry_open: false, period_start: null, period_end: null }, now)).toBe(false);
    expect(isWithinPeriod(null, null, now)).toBe(true);
  });

  it('マイエントリーの「編集」と「遅刻の連絡」は、同じ判定で切り替わる', () => {
    const src = read('supabase/functions/my-entry/index.ts');
    expect(src).toMatch(/const entryWindowOpen = isEntryWindowOpen\(project\)/);
    expect(src).toMatch(/&& entryWindowOpen;/);
    expect(src).toMatch(/status === 'registered' && !entryWindowOpen/);
  });

  it('遅刻の連絡の API も、受付中は断る(画面の表示だけに頼らない)', () => {
    const src = read('supabase/functions/mark-late/index.ts');
    expect(src).toMatch(/if \(isEntryWindowOpen\(project\)\)/);
    expect(src).toContain('エントリーの受付中は、遅刻の連絡はできません。');
  });

  it('編集の API は、受付中でなければ断る(同じ判定を使う)', () => {
    expect(read('supabase/functions/edit-entry/index.ts')).toMatch(/if \(!isEntryWindowOpen\(project\)\)/);
  });
});

describe('FND-12: 終了日時は開始日時より後', () => {
  it('画面は、保存の前に順序を確かめ、ピッカーは開いたままにする', () => {
    const src = read('js/admin_settings.js');
    expect(src).toMatch(/function validatePeriodOrder\(scope, target, val\)/);
    const confirmBody = src.slice(src.indexOf('function dtConfirm()'));
    expect(confirmBody.indexOf('validatePeriodOrder')).toBeGreaterThan(-1);
    expect(confirmBody.indexOf('validatePeriodOrder')).toBeLessThan(confirmBody.indexOf('closeDatePicker()'));
    expect(src).toContain('終了日時は、開始日時より後にしてください。');
  });

  it('データベースにも制約がある', () => {
    const mig = read('supabase/migrations/202610050002_period_order_checks.sql');
    expect(mig).toMatch(/projects_entry_period_order_check/);
    expect(mig).toMatch(/period_end > period_start/);
    expect(mig).toMatch(/disclosure_period_end > disclosure_period_start/);
  });
});

describe('FND-10: 遅刻の連絡をした人も、受付したら「受付済み」と表示する', () => {
  it('受付済みの判定が、遅刻の判定より前にある', () => {
    const src = read('js/admin_settings.js');
    const block = src.slice(src.indexOf("createBadge('badge danger', 'xmark', 'キャンセル')"));
    expect(block.indexOf("entry.checked_in")).toBeGreaterThan(-1);
    expect(block.indexOf("entry.checked_in")).toBeLessThan(block.indexOf("entry.status === 'late'"));
  });
});

describe('FND-11: 学年を非公開にした人は、エントリーリストで空欄', () => {
  it('「非公開」(現在の値)と「非表示」(古いデータ)の両方を空欄にする', () => {
    expect(read('js/entry_list.js')).toMatch(/e\.grade === '非公開' \|\| e\.grade === '非表示'/);
  });
});

describe('FND-09: 答案が保存済みのとき、問題数の変更は確認してから', () => {
  it('増減ボタンも、PDF作成時の保存も、確認を通る', () => {
    expect(read('js/admin_settings.js')).toMatch(/!\(await confirmQuestionCountChange\(val\)\)/);
    expect(read('js/admin_prep.js')).toMatch(/!\(await confirmQuestionCountChange\(qCount\)\)/);
    expect(read('js/admin_prep.js')).toMatch(/if \(!\(await saveQuestionCount\(\)\)\) return;/);
  });

  it('保存に失敗したら画面に出して、表示を元に戻す', () => {
    const src = read('js/admin_settings.js');
    expect(src).toMatch(/input\.value = previous;/);
    expect(src).toMatch(/問題数を保存できませんでした。（詳細：/);
  });
});

describe('FND-17: 画面の文言に半角の括弧・コロンを混ぜない', () => {
  const jsFiles = readdirSync(resolve(ROOT, 'js')).filter((f) => f.endsWith('.js'));

  it('詳細は「（詳細：…）」の形(全角)で、半角の「(詳細: 」が残っていない', () => {
    const offenders = jsFiles.filter((f) => /[（(]詳細: /.test(read(`js/${f}`)));
    expect(offenders).toEqual([]);
  });

  it('「エラー: 」「保存に失敗: 」のような半角コロンの言い方が残っていない', () => {
    const offenders = [];
    for (const f of jsFiles) {
      read(`js/${f}`).split('\n').forEach((line, i) => {
        // コンソールのログは開発者向けで、画面には出ない
        if (/(エラー|失敗|できませんでした)[:：] ?['"`]/.test(line) && !line.trim().startsWith('//') && !line.includes('console.')) offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('入力フォームの項目名が全角の括弧', () => {
    for (const f of ['entry.html', 'my.html']) {
      const html = read(f);
      expect(html).toContain('姓（全角）');
      expect(html).toContain('セイ（全角カタカナ）');
      expect(html).not.toMatch(/姓 \(全角\)/);
    }
  });
});

describe('問題数の欄に直接入力したとき', () => {
  it('ボタンと同じ流れ(確認→保存)にし、取りやめ・不正な値・失敗のときは実際の問題数へ戻す', () => {
    const src = read('js/admin_settings.js');
    const block = src.slice(src.indexOf("document.getElementById('question-count')?.addEventListener('change'"));
    expect(block).toContain('if (!event.isTrusted) return;');
    expect(block).toContain("await window.adjustNumberInput('question-count', 0);");
    expect(block).toContain('if (totalQuestions !== typed) revert();');
    expect(block).toMatch(/typed % 10 !== 0/);
  });
});
