// 運営画面（スマホ）：リンクの枠、並ぶ操作、問題アナリティクス、しきい値の行。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

describe('運営画面', () => {
  const html = read('admin.html');
  const css = read('css/pages.css');
  const js = read('js/admin_stats.js');

  it('リンクを開くボタンも、コピーのボタンと同じ枠を持つ（枠のない ghost にしない）', () => {
    expect(html).not.toMatch(/btn ghost icon-btn link-btn-sm/);
    expect(html.match(/btn secondary icon-btn link-btn-sm" data-open-link/g)).toHaveLength(4);
  });

  it('スマホでも、並ぶ操作（参加者名簿CSV・参加者を追加）は横に並べる', () => {
    expect(css).toMatch(/\.phase-actions \{\s*flex-wrap: nowrap;/);
    expect(css).toMatch(/\.phase-actions > \.btn \{\s*flex: 1 1 0;/);
  });

  it('問題アナリティクスは、スマホで1問を2行のまとまりにする（状態が縦に折り返さない）', () => {
    for (const name of ['analytics-q', 'analytics-count', 'analytics-rate', 'analytics-type', 'analytics-names']) {
      expect(js).toContain(`'${name}'`);
    }
    expect(css).toMatch(/#analytics-tbody tr \{\s*display: grid;[\s\S]*?"q count rate type"\s*"names names names names"/);
    expect(css).toMatch(/#analytics-table thead \{\s*display: none;/);
  });

  it('しきい値の行の文字は、ほかの設定のラベルと同じ大きさ・濃さ。スマホでは見出しの下に入力部品を置く', () => {
    expect(html).toMatch(/<span class="config-row-label">正答数<\/span>/);
    expect(html).toMatch(/<span class="config-row-label">人以下をハイライト<\/span>/);
    expect(css).toMatch(/\.config-row-label \{\s*font-size: var\(--fs-13\);\s*font-weight: 600;\s*color: var\(--ink-2\);/);
    expect(css).toMatch(/"label label"\s*"spin  tail"/);
  });

  it('採点状況の3つの数字は、スマホでも横に3つ並べる', () => {
    expect(css).toMatch(/@media \(max-width: 640px\) \{\s*body\.page-admin \.stats \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  });
});
