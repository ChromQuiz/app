import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// ui.js から、エラーの文言の部分だけを取り出して調べる。
const source = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const start = source.indexOf('const GENERIC_ERROR_MESSAGE');
const end = source.indexOf('window.errorDetail = errorDetail;');
const warnings = [];
const { errorDetail, describeError } = new Function('console', `${source.slice(start, end)}; return { errorDetail, describeError };`)({ warn: (...a) => warnings.push(a.join(' ')) });

describe('エラーの文言', () => {
  it('サーバーの英語のエラーは、日本語にして出す', () => {
    expect(describeError(new Error('Forbidden'))).toBe('この操作を行う権限がありません。');
    expect(describeError(new Error('Question is full'))).toBe('この問題は、採点者が満員です。');
    expect(describeError(new Error('Failed to fetch'))).toBe('通信できませんでした。接続を確認してください。');
    expect(describeError(new Error('Invite expired'))).toContain('招待リンクが無効です');
  });

  it('日本語のエラーは、そのまま出す(文末の「。」は1つにそろえる)', () => {
    expect(describeError(new Error('このメールアドレスは既にエントリー済みです。'))).toBe('このメールアドレスは既にエントリー済みです。');
    expect(describeError(new Error('受付は現在停止中です'))).toBe('受付は現在停止中です。');
  });

  it('対応のない英語は、呼び出し側の文(なければ汎用の文)にして、元の文は console に残す', () => {
    warnings.length = 0;
    expect(describeError(new Error('some unknown failure'), '保存できませんでした。')).toBe('保存できませんでした。');
    expect(describeError(new Error('some unknown failure'))).toBe('予期しないエラーが起きました。時間をおいて、もう一度お試しください。');
    expect(warnings.join('\n')).toContain('some unknown failure');
  });

  it('「（詳細：…）」の中は、文末の「。」を付けない形', () => {
    expect(errorDetail(new Error('Forbidden'))).toBe('この操作を行う権限がありません');
    expect(errorDetail(null, '失敗しました。')).toBe('失敗しました');
  });

  it('画面に出すエラーで、英語の error.message をそのまま出さない', () => {
    const offenders = [];
    for (const name of readdirSync(new URL('../js', import.meta.url)).filter(n => n.endsWith('.js'))) {
      if (['icons.js', 'supabase_api.js', 'ui.js', 'entry.js'].includes(name)) continue;
      const lines = readFileSync(new URL(`../js/${name}`, import.meta.url), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/\b(e|err|error)\.message\b/.test(line) && !/console\.|errorDetail|describeError/.test(line)) offenders.push(`${name}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('失敗の文は「◯◯できませんでした。（詳細：…）」の形(文を閉じてから、括弧で詳細を足す)', () => {
    const offenders = [];
    for (const name of readdirSync(new URL('../js', import.meta.url)).filter(n => n.endsWith('.js'))) {
      const lines = readFileSync(new URL(`../js/${name}`, import.meta.url), 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/ませんでした（詳細/.test(line)) offenders.push(`${name}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
