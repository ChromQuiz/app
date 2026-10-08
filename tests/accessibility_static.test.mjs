// 画面の基本的なアクセシビリティと、文字の読みやすさ（機能一覧 CMN-17, CMN-20）を、ソースから守る。
// 実際の描画での検査（全ページの文字のコントラスト、横スクロール）は、機能一覧に記録した手順でブラウザで行った。

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const pages = readdirSync(ROOT).filter((f) => f.endsWith('.html'));

describe('全ページ', () => {
  it('lang="ja" と viewport がある', () => {
    for (const p of pages) {
      const html = read(p);
      expect(html, p).toMatch(/<html lang="ja"/);
      expect(html, p).toMatch(/<meta name="viewport"/);
    }
  });

  it('ふつうの入力欄（hidden・チェック・ラジオ以外）には、label か aria-label がある', () => {
    for (const p of pages) {
      const html = read(p);
      for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
        const attrs = m[2];
        const type = (attrs.match(/\btype="([^"]+)"/) || [])[1] || 'text';
        if (['hidden', 'checkbox', 'radio', 'submit', 'button'].includes(type)) continue;
        if (/\bclass="[^"]*u-hidden/.test(attrs)) continue; // 画面に出ない内部の入力（認証コードの束ねなど）
        const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
        const labeled = /aria-label(ledby)?=/.test(attrs) || (id && new RegExp(`<label[^>]*\\bfor="${id}"`).test(html));
        // label の中に入っている入力も可（直前に <label> が開いている）
        const inside = id && new RegExp(`<label[^>]*>(?:(?!</label>)[\\s\\S])*<(input|select|textarea)\\b[^>]*\\bid="${id}"`).test(html);
        expect(labeled || inside, `${p}: #${id || type}`).toBe(true);
      }
    }
  });

  it('画像には alt がある', () => {
    for (const p of pages) for (const m of read(p).matchAll(/<img\b([^>]*)>/g)) expect(m[1], p).toMatch(/\balt=/);
  });
});

describe('本文の領域（main）', () => {
  it('参加者向け・運営向けのページには、本文の領域の目印がある', () => {
    for (const p of ['index.html', 'join.html', '404.html', 'help.html', 'entry.html', 'my.html', 'terms.html', 'entry_list.html', 'admin.html', 'judge.html', 'checkin.html']) {
      expect(read(p), p).toMatch(/<main\b|role="main"/);
    }
  });
});

describe('色の読みやすさ（ライト）', () => {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const blend = (fg, alpha, bg) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('');
  const css = read('css/design_system.css');
  const token = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))[1];

  it('状態の色（緑・オレンジ）は、淡い面の上の文字で 4.5:1 以上（ステータスのバッジ・カウンター）', () => {
    const page = token('canvas');
    expect(ratio(token('ok-600'), blend('#34c759', 0.12, page))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('warn-600'), blend('#ff9500', 0.13, page))).toBeGreaterThanOrEqual(4.5);
  });

  it('緑のボタン（白い文字）は 4.5:1 以上。本文の色（ink・ink-2）も、ページと白の上で 4.5:1 以上', () => {
    expect(ratio('#ffffff', token('ok-600'))).toBeGreaterThanOrEqual(4.5);
    for (const name of ['ink', 'ink-2']) for (const bg of [token('canvas'), '#ffffff']) expect(ratio(token(name), bg), `${name} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it('ink-3（補助の色）は、本文の文字に使わない場所の色だけ。待機中の案内とフッターは ink-2 を使う', () => {
    const pages = read('css/pages.css');
    expect(pages).toMatch(/\.admin-manual-footer \{\s*text-align: center;\s*color: var\(--ink-2\)/);
    expect(pages).toMatch(/\.checkin-result-idle \{[^}]*color: var\(--ink-2\)/);
  });
});
