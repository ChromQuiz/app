// 採点画面：スマホでは答案を2列に切り替えられる。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

describe('答案の表示密度（スマホ）', () => {
  it('ヘッダーに切り替えボタンがあり、押した状態を aria-pressed で伝える', () => {
    const html = read('question.html');
    expect(html).toMatch(/id="grid-density-btn"[^>]*aria-pressed="false"[^>]*aria-label="2列で表示"/);
  });

  it('選択を端末に覚え、保存できなくても動く', () => {
    const js = read('js/question.js');
    expect(js).toMatch(/GRID_COMPACT_KEY = 'ciq\.answerGridCompact'/);
    expect(js).toMatch(/try \{ compact = localStorage\.getItem\(GRID_COMPACT_KEY\) === '1'; \} catch/);
    expect(js).toMatch(/try \{ localStorage\.setItem\(GRID_COMPACT_KEY/);
    expect(js).toMatch(/grid\.classList\.toggle\('is-compact', compact\)/);
  });

  it('2列は細い画面だけ。広い画面ではボタンを出さない', () => {
    const css = read('css/pages.css');
    expect(css).toMatch(/\.grid-density-btn \{\s*display: none;/);
    expect(css).toMatch(/@media \(max-width: 640px\) \{\s*\.grid-density-btn \{\s*display: inline-flex;/);
    expect(css).toMatch(/body\.page-question \.answer-grid\.is-compact \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  });
});
