// V9: プロジェクト RSA 秘密鍵の保管場所を回帰化する。
//
// 親計画 V9: 「RSA 秘密鍵が localStorage 保持（XSS 時に露出）」
//   修正方針 = session 限定保持、CSP 強化で XSS 面を縮小、project-key fetch の頻度最小化
//
// 秘密鍵は sessionStorage のみ（タブを閉じれば消える）。localStorage には残さない。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

const KEY_CONSUMERS = ['js/admin.js', 'js/index.js', 'js/admin_stats.js', 'js/admin_settings.js'];

describe('the project private key never lives in localStorage (V9)', () => {
  it('config.js exposes a sessionStorage-backed key store', () => {
    const src = read('js/config.js');
    expect(src).toMatch(/const projectKeyStore = \{/);
    expect(src).toMatch(/sessionStorage\.setItem\(this\.KEY, value\)/);
    // set 時に旧 localStorage の値を消す
    expect(src).toMatch(/set\(value\)[\s\S]*?localStorage\.removeItem\(this\.KEY\)/);
  });

  it('migrates any key left in localStorage by an older build, then deletes it', () => {
    const src = read('js/config.js');
    const getter = src.slice(src.indexOf('  get() {'), src.indexOf('  set(value) {'));
    expect(getter).toMatch(/localStorage\.getItem\(this\.KEY\)/);
    expect(getter).toMatch(/sessionStorage\.setItem\(this\.KEY, legacy\)/);
    expect(getter).toMatch(/localStorage\.removeItem\(this\.KEY\)/);
  });

  it('session.clear() also clears the key from sessionStorage', () => {
    const src = read('js/config.js');
    expect(src).toMatch(/sessionStorage\.removeItem\('privateKeyJwk'\)/);
  });

  for (const file of KEY_CONSUMERS) {
    it(`${file}: reads/writes the key only through projectKeyStore`, () => {
      const src = read(file);
      // localStorage 経由の session ヘルパで秘密鍵を扱わない
      expect(src).not.toMatch(/session\.get\('privateKeyJwk'\)/);
      expect(src).not.toMatch(/session\.set\('privateKeyJwk'/);
      expect(src).not.toMatch(/localStorage\.(get|set)Item\(\s*'privateKeyJwk'/);
    });
  }

  it('the key is fetched only when absent (minimises project-key calls)', () => {
    const src = read('js/admin.js');
    const fn = src.slice(src.indexOf('async function ensureProjectPrivateKeyAvailable'));
    expect(fn).toMatch(/const existing = projectKeyStore\.get\(\)/);
    expect(fn).toMatch(/if \(existing\)/);              // 既にあれば再取得しない
    expect(fn).toMatch(/fetchProjectPrivateKey\(projectId\)/);
  });
});
