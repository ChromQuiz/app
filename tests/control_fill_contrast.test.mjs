// 灰色のボタンと役割のバッジは、「外す」（danger）と同じ作り：うすい面の色と、輪郭の線。
// 色味が違うだけで、明るさと線の太さをそろえる。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(import.meta.dirname, '../css/design_system.css'), 'utf8');

describe('灰色のボタンとバッジの輪郭', () => {
  it('灰色のボタン（secondary / standard）は、うすい面の色と輪郭の線を持つ', () => {
    expect(css).toMatch(/\.page-btn\.standard \{\s*\/\*[^*]*\*\/\s*background: var\(--surface-2\);\s*border-color: var\(--line-strong\);/);
  });

  it('押したときは、面が少し濃くなり、輪郭も濃くなる', () => {
    expect(css).toMatch(/\.page-btn\.standard:hover \{\s*background: var\(--surface-3\);\s*border-color: var\(--ink-3\);/);
  });

  it('危険な操作（danger）も、同じ作り（面の色と、自分の色の輪郭）', () => {
    expect(css).toMatch(/\.btn\.danger,\s*\.page-btn\.danger \{\s*background: color-mix\(in srgb, var\(--bad-100\) 70%, var\(--surface\)\);[\s\S]*?border-color: color-mix\(in srgb, var\(--bad-600\) 26%, transparent\);/);
  });

  it('役割のバッジは、灰色も管理者（金色）も、自分の色の輪郭を持つ', () => {
    expect(css).toMatch(/\.menu-role-badge \{[^}]*border: 1px solid var\(--line-strong\);/);
    expect(css).toMatch(/\.menu-role-badge\.admin \{[^}]*border-color: color-mix\(in srgb, var\(--gold-600\) 28%, transparent\);/);
  });
});
