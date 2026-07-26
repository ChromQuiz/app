// V8: 第三者 CDN スクリプトの供給網対策（SRI + 版固定 + CSP の最小許可）を回帰化する。
//
// 親計画 V8 の完了条件:
//   - 依存をセルフホスト or integrity(SRI) + バージョン固定
//   - 浮動メジャー(@2 等)を厳密版へピン留め
//   - CSP から不要な CDN を削除

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const PAGES = readdirSync(ROOT).filter((f) => f.endsWith('.html'));

/** ページ内の <script src="https://..."> をすべて取り出す。 */
function externalScripts(html) {
  return [...html.matchAll(/<script[^>]*\ssrc="(https?:\/\/[^"]+)"[^>]*>/g)].map((m) => ({ tag: m[0], url: m[1] }));
}

// Cloudflare Turnstile の api.js は Cloudflare 側で随時更新されるため SRI を付けられない
// (公式にハッシュ固定は非対応)。CSP で配信元ホストを限定することで担保する。
const SRI_EXEMPT = ['https://challenges.cloudflare.com/'];

describe('third-party scripts are pinned and integrity-checked (V8)', () => {
  it('has production pages to check', () => {
    expect(PAGES.length).toBeGreaterThan(0);
  });

  for (const page of PAGES) {
    const html = read(page);
    const scripts = externalScripts(html);
    if (scripts.length === 0) continue;

    it(`${page}: every third-party script has SRI + crossorigin + a pinned version`, () => {
      for (const { tag, url } of scripts) {
        if (SRI_EXEMPT.some((prefix) => url.startsWith(prefix))) continue;
        expect(tag, `${url} must carry integrity`).toMatch(/integrity="sha(256|384|512)-/);
        expect(tag, `${url} must carry crossorigin`).toMatch(/crossorigin=/);
        // 厳密版のピン留め: @2 のような浮動メジャーを許さない
        expect(url, `${url} must pin an exact version`).toMatch(/@\d+\.\d+\.\d+|\/\d+\.\d+\.\d+\//);
      }
    });
  }

  it('dynamically loaded admin libraries are pinned and integrity-checked', () => {
    const src = read('js/admin.js');
    const loads = [...src.matchAll(/loadAdminScriptOnce\('(https?:\/\/[^']+)',\s*'(sha\d{3}-[^']+)'/g)];
    expect(loads.length).toBeGreaterThan(0);
    for (const [, url] of loads) {
      expect(url, `${url} must pin an exact version`).toMatch(/@\d+\.\d+\.\d+|\/\d+\.\d+\.\d+\//);
    }
  });
});

describe('CSP allows only the CDNs actually used (V8)', () => {
  // 実利用: cdn.jsdelivr.net(supabase-js/jsQR/marked) / challenges.cloudflare.com(Turnstile, entry のみ)
  //         unpkg.com + cdnjs.cloudflare.com(jspdf/pdf.js, admin のみ・動的ロード)
  const EXPECTED_SCRIPT_HOSTS = {
    'admin.html': ['https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://unpkg.com'],
    'entry.html': ['https://cdn.jsdelivr.net', 'https://challenges.cloudflare.com'],
    'help.html': [],
    '404.html': [],
  };

  for (const page of PAGES) {
    const html = read(page);
    const csp = html.match(/content="(default-src[^"]*)"/)?.[1];
    if (!csp) continue;

    it(`${page}: script-src lists only hosts the page actually loads`, () => {
      const scriptSrc = csp.match(/script-src([^;]*)/)?.[1] || '';
      const hosts = [...scriptSrc.matchAll(/https:\/\/[a-z0-9.-]+/g)].map((m) => m[0]).sort();
      const expected = (EXPECTED_SCRIPT_HOSTS[page] ?? ['https://cdn.jsdelivr.net']).slice().sort();
      expect(hosts).toEqual(expected);
    });

    it(`${page}: unused font/style CDNs are not allowed`, () => {
      // どのページも Google Fonts / cdnjs のスタイルは読み込んでいない
      expect(csp).toMatch(/style-src 'self'\s*;/);
      expect(csp).toMatch(/font-src 'self'\s*;/);
      expect(csp).not.toMatch(/fonts\.googleapis\.com/);
      expect(csp).not.toMatch(/fonts\.gstatic\.com/);
    });
  }
});
