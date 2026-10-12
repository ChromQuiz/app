// 答案カードのダブルタップで、答案全体を開く（スマホ）。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

// ui.js はブラウザ用の読み込み。必要な関数だけを取り出して動かす。
function loadGesture() {
  const source = read('js/ui.js');
  const start = source.indexOf('const PREVIEW_DOUBLE_TAP_MS');
  const end = source.indexOf('async function showPreview');
  const body = source.slice(start, end);
  const fn = new Function(`${body}\nreturn { bindPreviewGesture };`);
  return { make: () => fn() };
}

function fakeCard() {
  const handlers = {};
  return {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    fire: (type, event = {}) => handlers[type]?.(event),
  };
}

describe('ダブルタップで答案全体を開く', () => {
  it('指で2回、続けてタップしたら開く。1回だけでは開かない', () => {
    const { make } = loadGesture();
    const { bindPreviewGesture } = make();
    let opened = 0;
    const card = fakeCard();
    bindPreviewGesture(card, () => { opened += 1; });
    card.fire('pointerup', { pointerType: 'touch' });
    expect(opened).toBe(0);
    card.fire('pointerup', { pointerType: 'touch' });
    expect(opened).toBe(1);
  });

  it('マウスの pointerup では、ダブルタップとして数えない（マウスは dblclick で開く）', () => {
    const { make } = loadGesture();
    const { bindPreviewGesture } = make();
    let opened = 0;
    const card = fakeCard();
    bindPreviewGesture(card, () => { opened += 1; });
    card.fire('pointerup', { pointerType: 'mouse' });
    card.fire('pointerup', { pointerType: 'mouse' });
    expect(opened).toBe(0);
    card.fire('dblclick');
    expect(opened).toBe(1);
  });

  it('ダブルタップで開いた直後に dblclick も来ても、二重に開かない', () => {
    const { make } = loadGesture();
    const { bindPreviewGesture } = make();
    let opened = 0;
    const card = fakeCard();
    bindPreviewGesture(card, () => { opened += 1; });
    card.fire('pointerup', { pointerType: 'touch' });
    card.fire('pointerup', { pointerType: 'touch' });
    card.fire('dblclick');
    expect(opened).toBe(1);
  });

  it('説明のトーストは出さない（操作の説明を、画面に足さない）', () => {
    expect(read('js/ui.js')).not.toMatch(/ダブルタップすると/);
    expect(read('js/question.js')).not.toMatch(/hintPreviewGestureOnce/);
  });

  it('採点画面と要確認画面の両方で使い、2回タップでの拡大は止める', () => {
    expect(read('js/question.js')).toMatch(/bindPreviewGesture\(card, \(\) => showPreview\(projectId, cardData\.entryNumber\)\)/);
    expect(read('js/conflict.js')).toMatch(/bindPreviewGesture\(card, \(\) => showPreview\(projectId, conflict\.entryNumber\)\)/);
    expect(read('css/pages.css')).toMatch(/\.answer-card,\s*\.conflict-card \{\s*touch-action: manipulation;/);
  });

  it('スマホでは、戻る・問題番号・件数を同じ段に、模範解答をその一段下に置く', () => {
    const css = read('css/pages.css');
    expect(css).toMatch(/body\.page-question \.ops-focus-bar \.header-center \{\s*display: contents;/);
    expect(css).toMatch(/\.q-badge \{\s*grid-column: 2;\s*grid-row: 1;/);
    expect(css).toMatch(/\.header-right \{\s*grid-column: 3;\s*grid-row: 1;/);
    expect(css).toMatch(/\.answer-badge \{\s*grid-row: 2;/);
  });
});
