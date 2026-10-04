// 機能一覧(docs/feature_inventory.md)の検出事項のうち、直したものの回帰テスト。

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
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

describe('FND-01: 集計の対象は、成績照会と同じ「登録済み・遅刻連絡済み」だけ', () => {
  const stats = read('js/admin_stats.js');
  const graded = read('js/admin_graded_pdf.js');

  it('集計・CSV・アナリティクス・採点済みPDFは、タブの開き方で変わる entryNumbers を使わない', () => {
    expect(stats).not.toMatch(/\bentryNumbers\b/);
    expect(graded).not.toMatch(/\bentryNumbers\b/);
  });

  it('対象は status が registered か late の人で、使う前にサーバーから取り直す', () => {
    expect(stats).toMatch(/entry\.status === 'registered' \|\| entry\.status === 'late'/);
    expect(stats).toMatch(/async function refreshScoringEntryNumbers/);
    for (const name of ['updateStatsView', 'exportCSV', 'exportAnalyticsCSV']) {
      const body = stats.slice(stats.indexOf(`async function ${name}`));
      expect(body.slice(0, 400)).toContain('refreshScoringEntryNumbers()');
    }
    expect(graded).toContain('await refreshScoringEntryNumbers();');
  });

  it('成績照会側も同じ対象(registered / late)で順位を付けている', () => {
    expect(read('supabase/functions/disclose-result/index.ts')).toMatch(/\.in\('status', \['registered', 'late'\]\)/);
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
    expect(src).toMatch(/問題数を保存できませんでした（詳細：/);
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
