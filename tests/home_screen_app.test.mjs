// ホーム画面に追加して、アプリのように全画面で開くための設定（manifest・アイコン・メタ情報）。

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const pages = readdirSync(ROOT).filter((name) => name.endsWith('.html'));

describe('ホーム画面に追加できる設定', () => {
  it('どのページにも、manifest・アイコン・テーマ色・全画面の指定がある', () => {
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      const html = read(page);
      expect(html, `${page}: manifest`).toMatch(/<link rel="manifest" href="[^"]*manifest(-participant)?\.webmanifest">/);
      expect(html, `${page}: apple-touch-icon`).toMatch(/<link rel="apple-touch-icon" href="[^"]*assets\/icons\/apple-touch-icon\.png">/);
      expect(html, `${page}: theme-color`).toMatch(/<meta name="theme-color" content="#f2f2f7" media="\(prefers-color-scheme: light\)">/);
      expect(html, `${page}: theme-color dark`).toMatch(/<meta name="theme-color" content="#000000" media="\(prefers-color-scheme: dark\)">/);
      expect(html, `${page}: iOS 全画面`).toMatch(/<meta name="apple-mobile-web-app-capable" content="yes">/);
    }
  });

  it('運営のページと参加者のページで、manifest を分ける（参加者のものは start_url を決めない）', () => {
    const staff = ['index', 'admin', 'judge', 'question', 'conflict', 'checkin', 'join'];
    for (const page of pages) {
      const name = page.replace(/\.html$/, '');
      const expected = staff.includes(name) ? 'manifest.webmanifest' : 'manifest-participant.webmanifest';
      expect(read(page), page).toContain(`${expected}"`);
    }
    const staffManifest = JSON.parse(read('manifest.webmanifest'));
    const participantManifest = JSON.parse(read('manifest-participant.webmanifest'));
    expect(staffManifest.start_url).toBe('index.html');
    // 参加者は、メールのリンク(pid つき)から開く。ホーム画面に追加したときも、開いていたページの住所で始めたい。
    expect('start_url' in participantManifest).toBe(false);
  });

  it('manifest の中身（全画面・アイコンが実在する）', () => {
    for (const file of ['manifest.webmanifest', 'manifest-participant.webmanifest']) {
      const manifest = JSON.parse(read(file));
      expect(manifest.display).toBe('standalone');
      expect(manifest.scope).toBe('./');
      expect(manifest.name && manifest.short_name).toBeTruthy();
      const sizes = manifest.icons.map((icon) => icon.sizes);
      expect(sizes).toContain('192x192');
      expect(sizes).toContain('512x512');
      for (const icon of manifest.icons) expect(existsSync(resolve(ROOT, icon.src)), icon.src).toBe(true);
    }
    expect(existsSync(resolve(ROOT, 'assets/icons/apple-touch-icon.png'))).toBe(true);
  });

  it('404 は、どんな深さの住所でも開かれるので、/app/ からの絶対パスで読む', () => {
    const html = read('404.html');
    expect(html).toContain('href="/app/manifest-participant.webmanifest"');
    expect(html).toContain('href="/app/assets/icons/apple-touch-icon.png"');
  });
});
