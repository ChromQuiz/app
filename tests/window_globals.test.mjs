// window.NAME として参照されるグローバルが、どこかで window に代入されていることを確認する。
//
// ページ直下の `const NAME = ...` は window の属性にならない。`window.NAME?.fn` のような
// 参照は未定義と判定され、機能が黙ってスキップされる(通知メールが送られない不具合の原因だった)。

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const jsDir = resolve(ROOT, 'js');
const files = readdirSync(jsDir).filter(f => f.endsWith('.js'));
const sources = Object.fromEntries(files.map(f => [f, readFileSync(resolve(jsDir, f), 'utf8')]));
const all = Object.values(sources).join('\n');

function referencedWindowGlobals() {
  const names = new Set();
  for (const src of Object.values(sources)) {
    for (const m of src.matchAll(/\bwindow\.((?:CIQ\w*)|AppCrypto)\b/g)) names.add(m[1]);
  }
  return [...names];
}

describe('window globals referenced by name', () => {
  it('finds the globals the pages rely on', () => {
    const names = referencedWindowGlobals();
    expect(names).toContain('CIQEmail');
    expect(names).toContain('CIQSupabaseAPI');
  });

  it('assigns every referenced window.* global somewhere in js/', () => {
    const missing = referencedWindowGlobals().filter(name => !new RegExp(`window\\.${name}\\s*=`).test(all));
    expect(missing).toEqual([]);
  });

  it('exposes CIQEmail from email.js, which my.js checks with window.CIQEmail?.', () => {
    expect(sources['email.js']).toMatch(/window\.CIQEmail\s*=\s*CIQEmail/);
    expect(sources['my.js']).toMatch(/window\.CIQEmail\?\.sendCancellation/);
  });
});
