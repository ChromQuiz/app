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
    expect(css).toMatch(/\.config-row-label \{\s*font-size: var\(--text-small\);\s*font-weight: 600;\s*color: var\(--ink-2\);/);
    expect(css).toMatch(/"label label"\s*"spin  tail"/);
  });

  it('採点状況の3つの数字は、スマホでも横に3つ並べる', () => {
    expect(css).toMatch(/@media \(max-width: 640px\) \{\s*body\.page-admin \.stats \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  });
});

describe('運営画面: 参加者一覧', () => {
  it('幅の確保と折り返しなしは、スマホだけでなく、狭いウィンドウでも効く（メディアクエリの外）', () => {
    const css = read('css/pages.css');
    expect(css).toMatch(/\n#tab-entries \.table-container table \{\s*min-width: 900px;/);
    expect(css).toMatch(/\n#tab-entries \.table-container th,\s*#tab-entries \.table-container td \{\s*white-space: nowrap;/);
  });
});

describe('問題アナリティクス', () => {
  it('どの問題にも状態を出す（しきい値より正答が多い問題は「通常」）。空のバッジは出さない', () => {
    const js = read('js/admin_stats.js');
    expect(js).toContain("let type = '通常';");
    expect(js).not.toContain("type: '', ");
  });
});

describe('期間の入力（開始 → 終了）', () => {
  it('開始と終了は、矢印をはさんで寄せて並べる（左右に引き離さない）', () => {
    expect(read('css/pages.css')).toMatch(/\.period-grid \{\s*display: grid;[\s\S]*?grid-template-columns: max-content auto max-content;\s*justify-content: start;/);
  });
});

describe('問題アナリティクス: 状態のバッジの色', () => {
  it('状態ごとに、色を分ける（全部同じ色にしない）', () => {
    const js = read('js/admin_stats.js');
    const map = js.match(/const ANALYTICS_TYPE_BADGE = \{[\s\S]*?\};/)[0];
    for (const type of ['通常', '未確定', '少数正解', '単独正解', '全滅']) expect(map).toContain(`'${type}'`);
    const colors = [...map.matchAll(/: '([a-z]*)'/g)].map(m => m[1]);
    expect(new Set(colors).size).toBe(5);
    expect(js).toContain('ANALYTICS_TYPE_BADGE[s.type]');
  });
});

describe('模範解答の一覧', () => {
  it('1つを広く取る（長い解答が切れて読めなくならない）。狭い画面では1列に収まる', () => {
    expect(read('css/pages.css')).toMatch(/body\.page-admin \.model-grid \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 280px\), 1fr\)\);/);
  });
});

describe('運営画面の整理（余白の役割・枠の中の枠・答案のブロック）', () => {
  const html = read('admin.html');
  const css = read('css/pages.css');
  const ds = read('css/design_system.css');

  it('余白は、役割（ブロックの内側・見出しや部品の縦の間隔）で決める', () => {
    expect(ds).toContain('--block-pad: var(--sp-5);');
    expect(ds).toContain('--block-gap: var(--sp-4);');
    expect(css).toMatch(/body\.page-admin \.phase-block \{\s*padding: var\(--block-pad\);/);
    expect(css).toMatch(/body\.page-admin \.phase-block > h2 \{\s*margin-bottom: var\(--block-gap\);/);
  });

  it('枠の中に枠を作らない（小見出しのまとまり・トグルや入力の行は、枠なし）', () => {
    expect(css).toMatch(/body\.page-admin \.phase-subblock \{[^}]*border: 0;[^}]*border-top: 1px solid var\(--line\);/);
    expect(css).toMatch(/body\.page-admin \.config-row \{[^}]*border: 0;[^}]*background: transparent;/);
  });

  it('答案の取り込みと保存済みの一覧は、模範解答と同じく、同じブロックに入れる', () => {
    const scan = html.slice(html.indexOf('id="tab-scan" role="tabpanel"'), html.indexOf('<!-- ⑤ 結果 -->'));
    expect(scan.match(/class="phase-block/g)).toHaveLength(1);
    expect(scan).toContain('id="pdf-upload-zone"');
    expect(scan).toContain('id="entry-list"');
    expect(scan).not.toContain('答案の取り込み');
  });

  it('採点状況の色は、採点ボードと同じ（採点中は青）', () => {
    expect(ds).toContain('--seg-inprogress: var(--accent);');
    expect(css).toContain('.judge-summary .summary-inprogress { --summary-dot: var(--accent); }');
  });

  it('当日の説明文（画面を開く／手動受付）は置かない', () => {
    expect(html).not.toContain('受付卓の端末で開いてください');
    expect(html).not.toContain('本人を確認してから受付します');
  });
});
