import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// 答案PDFの読み取りは、ブラウザ(PDF.js・キャンバス)がないと動かせない。
// ここでは、1ページの不備で全体を止めない作りになっていることを、書き方で守る。
const source = readFileSync(new URL('../js/admin_prep.js', import.meta.url), 'utf8');

describe('答案PDFの読み取り: 不備のあるページ', () => {
  it('読み取れない・参加者がいない・重複のページは、止めずに飛ばす', () => {
    expect(source).not.toMatch(/throw new Error\(`ページ\$\{i\}：/);
    expect(source).toContain("skipPage('受付番号を読み取れませんでした')");
    expect(source).toContain('の参加者が見つかりません`)');
    expect(source).toContain('と重複しています');
  });

  it('飛ばしたページは、最後にページ番号つきで知らせる', () => {
    expect(source).toContain('skippedPages.push({ page: i, reason })');
    expect(source).toContain('ページは飛ばしました');
  });

  it('1ページも保存できないときだけ、全体を失敗にする', () => {
    expect(source).toContain('保存できるページがありませんでした');
  });
});
