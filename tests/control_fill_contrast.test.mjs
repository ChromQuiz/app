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

describe('操作の輪郭の濃さ（どのボタンも同じ）', () => {
  const pages = readFileSync(resolve(import.meta.dirname, '../css/pages.css'), 'utf8');

  it('丸いヘッダーのボタン・日時・数の＋－・段階タブの選択中も、--line-strong の輪郭にそろえる', () => {
    expect(pages).toMatch(/\.back-nav-btn,\s*\.menu-panel-close,\s*\.dt-trigger,\s*\.number-spinner-btn \{\s*box-shadow: inset 0 0 0 1px var\(--line-strong\);/);
    expect(pages).toMatch(/\.menu-panel-close,\s*\.menu-trigger,\s*\.notif-bell,\s*\.phase-quick-btn\.active \{\s*border-color: var\(--line-strong\);/);
  });

  it('灰色のバッジ（未着手・模範解答など）も、同じ濃さの輪郭にする', () => {
    expect(css).toMatch(/\.badge \{[^}]*border: 1px solid var\(--line-strong\);/);
    expect(pages).toMatch(/\.q-status\.status-open \{\s*border-color: var\(--line-strong\);/);
    expect(pages).toMatch(/body\.page-question \.answer-badge \{\s*box-shadow: inset 0 0 0 1px var\(--line-strong\);/);
  });

  it('確認のダイアログは、低い画面でも、画面の中に収まる（中でスクロールする）', () => {
    expect(pages).toMatch(/\.confirm-dialog \{\s*max-height: calc\(100dvh - 32px\);\s*overflow-y: auto;/);
  });
});
