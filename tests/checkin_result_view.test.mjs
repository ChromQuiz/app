import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(__dirname, '..', p), 'utf8');

function loadView() {
  const src = read('js/checkin_result_view.js');
  const module = { exports: {} };
  return new Function('module', 'exports', 'globalThis', src + '; return module.exports;')(module, module.exports, globalThis);
}

describe('当日受付の結果の表示（カメラの画面とリーダー専用の画面で共通）', () => {
  const { describeCheckIn, STATES } = loadView();

  it('サーバーの返事を、表示する状態・受付番号・所属と学年にする', () => {
    const entry = { entryNumber: 12, affiliation: 'A高', grade: '１年' };
    expect(describeCheckIn({ result: 'checked', entry })).toEqual({ state: 'success', number: '012', detail: 'A高 / １年' });
    expect(describeCheckIn({ result: 'already', entry }).state).toBe('already');
    expect(describeCheckIn({ result: 'waitlist', entry }).state).toBe('waitlist');
    expect(describeCheckIn({ result: 'canceled', entry }).state).toBe('canceled');
    expect(describeCheckIn({ result: 'checked', entry: { entryNumber: 5 } }).detail).toBe('');
  });

  it('状態は、色・印・文字の3つを持つ（色だけで伝えない）', () => {
    for (const [name, def] of Object.entries(STATES)) {
      expect(def.tone, name).toMatch(/^(ok|warn|bad|neutral)$/);
      expect(def.icon, name).toBeTruthy();
      expect(def.title, name).toBeTruthy();
    }
    expect(STATES.success.tone).toBe('ok');
    expect(STATES.canceled.tone).toBe('bad');
    expect(STATES.already.tone).toBe('warn');
  });

  it('2つの受付画面が、同じ部品で結果を出す。それぞれが、結果の見た目を持たない', () => {
    for (const [html, js] of [['checkin.html', 'js/checkin.js'], ['checkin_reader.html', 'js/checkin_reader.js']]) {
      expect(read(html)).toContain('js/checkin_result_view.js');
      expect(read(html)).toMatch(/class="checkin-result"/);
      expect(read(js)).toContain('CIQCheckinResultView');
      expect(read(js)).not.toMatch(/createElement\('div'\)[\s\S]{0,80}className = '(?:name|sub|number)'/);
    }
  });

  it('見た目は1つ: 印の色は状態で決め、背景は塗らず、受付番号は役割の最大の大きさの2倍', () => {
    const css = read('css/pages.css');
    expect(css).toMatch(/\.checkin-result\.is-ok \{ --mark-bg: var\(--ok-600\);/);
    expect(css).toMatch(/\.checkin-result-number \{\s*font-size: 2em;/);
    expect(css).not.toMatch(/#result\.(success|already|canceled|error)/);
    expect(css).not.toMatch(/\.reader-result/);
  });
});
