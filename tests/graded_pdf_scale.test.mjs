import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// 採点済みPDFの○×は、保存された画像の幅に合わせて座標を縮める必要がある。
// (保存時、読み取ったページ(幅 pageWidth)を最大840pxに縮めて保存するが、解答欄の座標は縮める前の画素のまま)
const source = readFileSync(new URL('../js/admin_graded_pdf.js', import.meta.url), 'utf8');

describe('採点済みPDFの○×の位置', () => {
  it('pageWidth と画像の幅の比で、座標を換算する', () => {
    expect(source).toContain('page?.cells?.pageWidth');
    expect(source).toMatch(/const scale = sourceWidth > 0 \? img\.width \/ sourceWidth : 1;/);
  });

  it('○×もスコアの位置も、換算した座標を使う', () => {
    expect(source).toContain('const region = scaleRegion(stored);');
    expect(source).toContain('const lastRegion = lastStored ? scaleRegion(lastStored) : null;');
    expect(source).not.toMatch(/const region = pageRegions\[`q\$\{q\}`\];/);
  });

  it('保存時の縮小(840px)と、保存する pageWidth(縮める前)の前提が変わっていない', () => {
    const prep = readFileSync(new URL('../js/admin_prep.js', import.meta.url), 'utf8');
    expect(prep).toContain('ANSWER_PAGE_IMAGE_MAX_WIDTH = 840');
    expect(prep).toContain('pageWidth: workCanvas.width');
  });
});
