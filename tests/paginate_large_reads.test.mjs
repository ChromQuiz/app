import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(import.meta.dirname, '..', p), 'utf8');

describe('1000件をこえる表は、全部そろえて取る', () => {
  const api = read('js/supabase_api.js');

  it('判定と確定結果は、1000件ずつ取り直す', () => {
    for (const name of ['listScoreVotes', 'listFinalResults']) {
      const body = api.slice(api.indexOf(`async ${name}(`));
      expect(body.slice(0, 500)).toContain('selectAllRows');
      expect(body.slice(0, 600)).toContain('.range(from, to)');
    }
  });

  it('取り直しは、1000件に満たないページが来るまで続ける（上限ちょうどで止まらない）', () => {
    expect(api).toMatch(/if \(page\.length < SELECT_PAGE_SIZE\) return rows;/);
  });

  it('成績照会の確定結果の取得も、同じ', () => {
    const fn = read('supabase/functions/disclose-result/index.ts');
    expect(fn).toContain('selectAllRows<FinalResultRow>');
    expect(fn).toContain('.range(from, to)');
  });
});

describe('問題アナリティクスの速さ', () => {
  const stats = read('js/admin_stats.js');
  const admin = read('js/admin.js');

  it('確定の正解者は、問題ごとの配列を1回で取る（確定結果・全判定の全件は取らない）', () => {
    const body = admin.slice(admin.indexOf('async function refreshSupabaseScoringData'), admin.indexOf('async function initSupabaseAdmin'));
    expect(body).toContain('listCorrectEntries(projectId)');
    expect(body).not.toContain('listScoreVotes');
    expect(body).not.toContain('listFinalResults');
  });

  it('結果タブを開くときの3つの取得は、同時に行う', () => {
    expect(stats).toMatch(/Promise\.all\(\[\s*refreshScoringEntryNumbers\(\),\s*refreshSupabaseScoringData\(\),\s*CIQSupabaseAPI\.listQuestionConfirmation\(projectId\),\s*\]\)/);
  });

  it('しきい値を変えるだけのときは、通信しない（取った状態を使う）', () => {
    expect(stats).toContain('lastQuestionConfirmation ||');
  });

  it('正解者の氏名は、姓名だけ。表示する人だけを復号する（全員を復号しない）', () => {
    const body = stats.slice(stats.indexOf('async function getAnalyticsData'), stats.indexOf('let _lastAnalyticsHash'));
    expect(body).toContain('lookupEntryNames([...namesNeeded])');
    expect(body).not.toContain('loadEntryMaster');
    const lookup = stats.slice(stats.indexOf('async function lookupEntryNames'), stats.indexOf('async function getAnalyticsData'));
    expect(lookup).toContain("`${pii.familyName || ''}${pii.firstName || ''}`");
    expect(lookup).not.toContain('affiliation');
  });
});
