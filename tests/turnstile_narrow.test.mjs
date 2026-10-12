// 細い画面で、Turnstile の枠がはみ出して横スクロールにならないこと。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

describe('Turnstile の枠（細い画面）', () => {
  const js = read('js/turnstile.js');
  const css = read('css/pages.css');

  it('枠の最小幅(300px)より狭いときは、縮める拡大率を CSS 変数で渡す（style 属性は使わない）', () => {
    expect(js).toMatch(/WIDGET_MIN_WIDTH = 300/);
    expect(js).toMatch(/Math\.min\(1, available \/ WIDGET_MIN_WIDTH\)/);
    expect(js).toMatch(/style\.setProperty\('--ts-scale'/);
    expect(js).toMatch(/style\.setProperty\('--ts-h'/);
    expect(js).not.toMatch(/setAttribute\('style'/);
  });

  it('描画したあと、画面の幅が変わっても追従する', () => {
    expect(js).toMatch(/fitToWidth\(el\);\s*return true;/);
    expect(js).toMatch(/new ResizeObserver\(apply\)/);
  });

  it('縮めたときは、横スクロールを出さず、高さも詰める', () => {
    expect(css).toMatch(/\.turnstile-box\.is-scaled \{\s*overflow: hidden;\s*height: var\(--ts-h\);/);
    expect(css).toMatch(/transform: scale\(var\(--ts-scale\)\);\s*transform-origin: 0 0;/);
  });
});
