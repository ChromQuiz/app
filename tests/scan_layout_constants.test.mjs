import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// 読み取りの座標(buildLayoutConfig)と、解答用紙PDFの描画(generatePDF)は、同じ定数を別々に書いている。
// 片方だけ変えると、読み取りの位置がずれる。ここでは、両方に同じ書き方が残っていることを確かめる。
const source = readFileSync(new URL('../js/admin_prep.js', import.meta.url), 'utf8');
const layout = source.slice(source.indexOf('async function buildLayoutConfig'), source.indexOf('async function saveQuestionCount'));
const pdf = source.slice(source.indexOf('async function generatePDF'), source.indexOf('// TAB 2: 答案読込・管理'));

const SHARED = [
  'const markerSize = 10, margin = 5;',
  'x: margin, y: margin, id: 0',
  'x: pageWidth - margin - markerSize, y: margin, id: 1',
  'x: margin, y: pageHeight - margin - markerSize, id: 2',
  'x: pageWidth - margin - markerSize, y: pageHeight - margin - markerSize, id: 3',
  'const gridMarginX = 15, gridMarginTop = 5, gridSpaceWidth = pageWidth - gridMarginX * 2;',
  'maxGridHeight = 260, rowHeight = maxGridHeight / rows;',
  'const x = gridMarginX + col * colWidth, y = gridMarginTop + row * rowHeight;',
  'boxX = 15, boxY = gridMarginTop + maxGridHeight + 2, boxW = 180, boxH = markerBottom - boxY',
  'L2 = boxX + 13',
  'bubbleW = 3.2, bubbleH = 5.0',
  'const cx = L2 + 1.5 + col * 4.2;',
];

describe('読み取りの座標と解答用紙PDFの定数', () => {
  for (const snippet of SHARED) {
    it(`両方に同じ書き方がある: ${snippet.slice(0, 60)}`, () => {
      expect(layout, 'buildLayoutConfig').toContain(snippet);
      expect(pdf, 'generatePDF').toContain(snippet);
    });
  }
});
