// 項目名・バッジ・見出しに、括弧書きの補足を付けない（見た目を損なう）。補足が要るときは、下の説明文か「·」で区切る。

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const pages = readdirSync(ROOT).filter((n) => n.endsWith('.html'));

describe('括弧書きの補足', () => {
  it('フォームの項目名（label）に、括弧書きの補足がない', () => {
    const offenders = [];
    for (const page of pages) {
      for (const m of read(page).matchAll(/<label[^>]*>([^<]*)<\/label>/g)) {
        if (/[（(][^）)]*[）)]/.test(m[1])) offenders.push(`${page}: ${m[1].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('短い情報を、中黒でつないで1つの文字列にしない（別々の要素として並べる）', () => {
    const offenders = [];
    for (const file of ['js/admin.js', 'js/entry_list.js', 'js/judge.js', 'js/my.js', 'js/checkin.js']) {
      read(file).split('\n').forEach((line, i) => {
        if (/^\s*\/\//.test(line)) return;
        if (/join\(' · '\)| · \$\{|\} · /.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    for (const page of pages) {
      if (/<\/span> · <span/.test(read(page))) offenders.push(page);
    }
    expect(offenders).toEqual([]);
  });

  it('固定の値・状態のバッジ・リストの区切りに、括弧書きを使わない', () => {
    const sources = pages.map(read).join('\n') + ['js/admin.js', 'js/admin_settings.js', 'js/admin_stats.js', 'js/entry_list.js', 'js/judge.js', 'js/upload_validation.js'].map(read).join('\n');
    for (const phrase of ['（固定）', '期間外（', '（先着）', '（開始24時間以内）', '（全角', '(採点中)', '受付済み（', '未受付（', '(未読', '正答率（％）', 'マイエントリー（', '全データ（', '採点枠(', '大きすぎます（', '多すぎます（']) {
      expect(sources, phrase).not.toContain(phrase);
    }
  });
});
