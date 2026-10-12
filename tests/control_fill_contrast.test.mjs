// ライトモードで、灰色のボタンと役割のバッジが、白い面に溶けない（輪郭が見える濃さ）。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(import.meta.dirname, '../css/design_system.css'), 'utf8');

describe('操作の塗り', () => {
  it('ライトとダークで、塗りの濃さを別々に持つ', () => {
    expect(css).toMatch(/--fill-control: rgba\(118, 118, 128, 0\.16\);/);
    expect(css).toMatch(/--fill-control: rgba\(118, 118, 128, 0\.28\);/);
  });

  it('灰色のボタン（secondary / standard）は、この塗りを使い、押したときは濃くする', () => {
    expect(css).toMatch(/\.page-btn\.standard \{\s*background: var\(--fill-control\);\s*border-color: transparent;/);
    expect(css).toMatch(/\.page-btn\.standard:hover \{\s*background: var\(--fill-control-hover\);/);
  });

  it('役割のバッジ（採点者）も、同じ塗りを使う', () => {
    expect(css).toMatch(/\.menu-role-badge \{[^}]*background: var\(--fill-control\);/);
  });
});
