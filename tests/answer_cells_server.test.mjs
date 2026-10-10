// 解答欄の画像を、サーバー(Edge Function)で作る処理（画像の読み書き以外の部分）を確かめる。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ANSWER_CELL_VERSION,
  cropRgba,
  nextGeneration,
  pendingQuestionKeys,
  regionToPixels,
} from '../supabase/functions/_shared/answer_cells.ts';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

function gradient(width, height) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = x; data[i + 1] = y; data[i + 2] = 0; data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('切り出す範囲の換算（ブラウザ側と同じ式）', () => {
  it('取り込み時の幅と保存画像の幅の比で、座標を換算する', () => {
    // 取り込み時 1200px 幅 → 保存画像 600px 幅（半分）
    expect(regionToPixels({ x: 100, y: 40, w: 200, h: 60 }, 600, 800, 1200)).toEqual({ x: 50, y: 20, width: 100, height: 30 });
  });

  it('幅の指定がなければ、そのまま使う', () => {
    expect(regionToPixels({ x: 10, y: 20, w: 30, h: 40 }, 600, 800, null)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('画像からはみ出す分は切る', () => {
    expect(regionToPixels({ x: 580, y: 790, w: 100, h: 100 }, 600, 800, null)).toEqual({ x: 580, y: 790, width: 20, height: 10 });
  });
});

describe('切り出し', () => {
  it('指定した範囲の画素を、そのまま取り出す', () => {
    const cell = cropRgba(gradient(100, 80), { x: 10, y: 20, w: 5, h: 3 }, null);
    expect([cell.width, cell.height]).toEqual([5, 3]);
    // 左上の画素は元画像の (10, 20)
    expect([cell.data[0], cell.data[1]]).toEqual([10, 20]);
    // 右下の画素は元画像の (14, 22)
    const last = (2 * 5 + 4) * 4;
    expect([cell.data[last], cell.data[last + 1]]).toEqual([14, 22]);
  });

  it('範囲が画像の外にあっても、1画素以上の画像を返す', () => {
    const cell = cropRgba(gradient(10, 10), { x: 500, y: 500, w: 50, h: 50 }, null);
    expect(cell.width).toBeGreaterThanOrEqual(1);
    expect(cell.height).toBeGreaterThanOrEqual(1);
  });
});

describe('作る問題の選び方と、状態の更新', () => {
  const regions = { q1: { x: 0, y: 0, w: 1, h: 1 }, q2: { x: 0, y: 0, w: 1, h: 1 }, q10: { x: 0, y: 0, w: 1, h: 1 } };

  it('作り済みの問題は飛ばし、問題番号の順に返す', () => {
    const generation = { version: ANSWER_CELL_VERSION, questions: { q1: 'ready' } };
    expect(pendingQuestionKeys(regions, generation)).toEqual(['q2', 'q10']);
  });

  it('版が違えば、作り済みの印を信用せず全問作り直す', () => {
    const generation = { version: 'old', questions: { q1: 'ready', q2: 'ready' } };
    expect(pendingQuestionKeys(regions, generation)).toEqual(['q1', 'q2', 'q10']);
  });

  it('全問できたら complete、一部なら partial、1問もできなければ failed', () => {
    const keys = ['q1', 'q2'];
    expect(nextGeneration(keys, null, { q1: 'ready', q2: 'ready' }).status).toBe('complete');
    expect(nextGeneration(keys, null, { q1: 'ready', q2: 'failed' }).status).toBe('partial');
    expect(nextGeneration(keys, null, { q1: 'failed', q2: 'failed' }).status).toBe('failed');
  });

  it('前の状態の「できた」を引き継ぐ', () => {
    const previous = { version: ANSWER_CELL_VERSION, startedAt: 't0', questions: { q1: 'ready' } };
    const next = nextGeneration(['q1', 'q2'], previous, { q2: 'ready' });
    expect(next.status).toBe('complete');
    expect(next.startedAt).toBe('t0');
  });
});

describe('関数の入口と権限', () => {
  const src = read('supabase/functions/generate-answer-cells/index.ts');

  it('定期実行の合言葉か、その大会の owner / admin だけが呼べる', () => {
    expect(src).toMatch(/x-ciq-cron-secret/);
    expect(src).toMatch(/safeEqual\(given, cronSecret\)/);
    expect(src).toMatch(/requireAdminMember\(supabase, scopeProjectId, getBearerToken\(req\)\)/);
  });

  it('作った画像は answer-cells（非公開）に、service role で保存する', () => {
    expect(src).toMatch(/\.from\('answer-cells'\)/);
    expect(src).toMatch(/createServiceClient\(\)/);
    expect(src).not.toMatch(/createSignedUrl|getPublicUrl/);
  });

  it('画像の形式は、サーバーで読める JPEG の版を固定して使う', () => {
    expect(src).toMatch(/npm:jpeg-js@\d+\.\d+\.\d+/);
  });

  it('未作成の用紙は、取り合いにならない受け取り用の関数から取る', () => {
    expect(src).toMatch(/rpc\('claim_answer_cell_pages'/);
    const migration = read('supabase/migrations/202610100001_claim_answer_cell_pages.sql');
    expect(migration).toMatch(/for update skip locked/);
    expect(migration).toMatch(/revoke all on function public\.claim_answer_cell_pages\(text, integer\) from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute on function public\.claim_answer_cell_pages\(text, integer\) to service_role/);
  });
});

describe('呼び出し側', () => {
  it('取り込みのあと、サーバーに作ってもらい、使えなければブラウザで作る', () => {
    const prep = read('js/admin_prep.js');
    expect(prep).toMatch(/requestServerCellGeneration\(projectId\)\.then\(\(generated\) => \{\s*if \(!generated\.ok\) CIQSupabaseAPI\.enqueueAnswerCellGeneration/);
  });

  it('用紙は、サーバーが読める JPEG で保存する', () => {
    const prep = read('js/admin_prep.js');
    expect(prep).toMatch(/canvasToBlob\(sc, 'image\/jpeg', ANSWER_PAGE_JPEG_QUALITY\)/);
    expect(prep).toMatch(/canvasToBlob\(workCanvas, 'image\/jpeg', ANSWER_PAGE_JPEG_QUALITY\)/);
  });

  it('定期実行が、1分おきに続きを進める', () => {
    const worker = read('cloudflare/keepalive/src/index.js');
    expect(worker).toMatch(/ANSWER_CELL_CRON = '\* \* \* \* \*'/);
    expect(worker).toMatch(/generate-answer-cells/);
    expect(read('cloudflare/keepalive/wrangler.toml')).toMatch(/"\* \* \* \* \*"/);
  });
});
