// ホーム画面に置いたときのアイコンとテーマ色。全画面で開く設定（manifest）は、Google ログインが通らない恐れがあるので入れない。

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const pages = readdirSync(ROOT).filter((name) => name.endsWith('.html'));

describe('ホーム画面のアイコンとテーマ色', () => {
  it('どのページにも、アイコンとテーマ色（ライト・ダーク）がある', () => {
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      const html = read(page);
      expect(html, `${page}: apple-touch-icon`).toMatch(/<link rel="apple-touch-icon" href="[^"]*assets\/icons\/apple-touch-icon\.png">/);
      expect(html, `${page}: theme-color`).toMatch(/<meta name="theme-color" content="#f2f2f7" media="\(prefers-color-scheme: light\)">/);
      expect(html, `${page}: theme-color dark`).toMatch(/<meta name="theme-color" content="#000000" media="\(prefers-color-scheme: dark\)">/);
    }
    expect(existsSync(resolve(ROOT, 'assets/icons/apple-touch-icon.png'))).toBe(true);
  });

  it('全画面で開く設定は入れない（iPhone の全画面アプリでは Google ログインが通らない恐れがある）', () => {
    for (const page of pages) {
      const html = read(page);
      expect(html, `${page}: manifest`).not.toMatch(/rel="manifest"/);
      expect(html, `${page}: capable`).not.toMatch(/mobile-web-app-capable/);
    }
    expect(existsSync(resolve(ROOT, 'manifest.webmanifest'))).toBe(false);
  });

  it('404 は、どんな深さの住所でも開かれるので、/app/ からの絶対パスで読む', () => {
    expect(read('404.html')).toContain('href="/app/assets/icons/apple-touch-icon.png"');
  });
});
