// 文字の大きさと色は、役割で決めた値だけを使う（design-system/MASTER.md の「文字の大きさ」「文字の色」）。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const design = read('css/design_system.css');
const pages = read('css/pages.css');
const ROLES = ['hero', 'numeral', 'title', 'heading', 'body', 'small', 'caption'];

describe('文字の大きさ（7つの役割だけ）', () => {
  it('役割のトークンが、7つとも定義されている。古い --fs-… は無い', () => {
    for (const role of ROLES) expect(design).toMatch(new RegExp(`--text-${role}: [0-9.]+rem;`));
    expect(design + pages).not.toMatch(/--fs-\d+/);
  });

  it('font-size は、役割のトークンか em だけ。px・rem の直書きをしない', () => {
    const offenders = [];
    for (const [name, css] of [['design_system.css', design], ['pages.css', pages]]) {
      css.split('\n').forEach((line, i) => {
        const m = line.match(/font-size:\s*([^;]+);/);
        if (!m) return;
        const value = m[1].trim().replace(/\s*!important$/, '');
        const ok = ROLES.some((role) => value === `var(--text-${role})`) || /^[0-9.]+em$/.test(value) || /^(inherit|1em|100%)$/.test(value) || value === 'clamp(4rem, 14vw, 8rem)'; // 404 の大きな数字だけ、画面幅で大きさが変わる
        if (!ok) offenders.push(`${name}:${i + 1} ${value}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('太さは 400 / 600 / 700 だけ', () => {
    const offenders = [];
    for (const [name, css] of [['design_system.css', design], ['pages.css', pages]]) {
      css.split('\n').forEach((line, i) => {
        const m = line.match(/font-weight:\s*([^;]+);/);
        if (m && !['400', '600', '700', 'inherit', 'normal'].includes(m[1].trim())) offenders.push(`${name}:${i + 1} ${m[1]}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('文字の色（トークンだけ）', () => {
  it('color に、16進の直書きをしない（面の上の文字は --on-… を使う）', () => {
    const offenders = [];
    for (const [name, css] of [['design_system.css', design], ['pages.css', pages]]) {
      css.split('\n').forEach((line, i) => {
        if (/^\s*color:\s*#[0-9a-fA-F]{3,8}/.test(line)) offenders.push(`${name}:${i + 1} ${line.trim()}`);
      });
    }
    // 受付票の画像など、色を直接決める必要のある場所は、許可の一覧に入れる
    expect(offenders.filter((o) => !/#111111/.test(o))).toEqual([]);
  });

  it('採点の進み具合の色は、バー・凡例・内訳の丸で同じ値を使う', () => {
    expect(design).toMatch(/--seg-confirmed: var\(--ok-600\);/);
    for (const [selector, token] of [['.legend-done', '--seg-confirmed'], ['.legend-conflict', '--seg-conflict'], ['.legend-scoring', '--seg-inprogress'], ['.legend-pending', '--seg-untouched'],
      ['.stats-bar-seg.confirmed', '--seg-confirmed'], ['.stats-bar-seg.conflict', '--seg-conflict'], ['.stats-bar-seg.inprogress', '--seg-inprogress'], ['.stats-bar-seg.untouched', '--seg-untouched']]) {
      expect(pages, selector).toContain(`${selector}`);
      expect(pages, selector).toMatch(new RegExp(`${selector.replace(/\./g, '\\.')}\\s*\\{ background: var\\(${token}\\)`));
    }
  });

  it('採点ボードの「続きから採点」と内訳は、枠や面で囲わない', () => {
    const block = (selector) => pages.match(new RegExp(`\\n${selector.replace(/\./g, '\\.')} \\{[^}]*\\}`))?.[0] || '';
    for (const selector of ['.judge-resume', '.judge-summary']) {
      expect(block(selector), selector).not.toMatch(/border|background|box-shadow/);
    }
  });
});
