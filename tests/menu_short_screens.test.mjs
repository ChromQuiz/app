// メニュー（サイドパネル）は、画面が低くても、全部の項目に届く（押しつぶさず、スクロールする）。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(import.meta.dirname, '../css/pages.css'), 'utf8');

describe('メニューのパネル（低い画面）', () => {
  it('中身を縮めない（縮めると、下の項目が切れて、スクロールもできない）', () => {
    expect(css).toMatch(/\.menu-panel > \* \{\s*flex-shrink: 0;\s*\}/);
  });

  it('パネルの中でスクロールし、後ろの画面は動かさない', () => {
    expect(css).toMatch(/\.menu-panel \{\s*overscroll-behavior: contain;/);
  });
});
