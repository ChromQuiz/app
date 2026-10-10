// answer_cells.ts — 解答欄の画像を、用紙の画像から切り出す処理（画像の読み書きには依存しない部分）。
//
// 座標の換算は、ブラウザ側（js/supabase_api.js の cropImageRegionBlobOnMainThread）と同じ式にする。
// 取り込み時の座標は「取り込み時の用紙の幅(sourceWidth)」基準。保存してある用紙画像はそれより小さいので、幅の比で換算する。

export const ANSWER_CELL_VERSION = 'answer-cell-v1';

export type Region = { x: number; y: number; w: number; h: number };
export type Rgba = { data: Uint8Array; width: number; height: number };

export type CellGeneration = {
  version: string;
  status: 'not_started' | 'processing' | 'partial' | 'complete' | 'failed';
  startedAt: string | null;
  generatedAt: string | null;
  failedAt: string | null;
  questions: Record<string, string>;
  /** 最後に起きた失敗の理由（原因を後から調べるため。個人情報は入れない）。 */
  lastError?: string | null;
};

export function questionNumberOf(key: string): number {
  return Number(String(key).replace(/^q/, ''));
}

/** 保存画像の上での、切り出す範囲（画像からはみ出さないように切る）。 */
export function regionToPixels(region: Region, imageWidth: number, imageHeight: number, sourceWidth: number | null) {
  const scale = sourceWidth ? imageWidth / sourceWidth : 1;
  const x = Math.max(0, Math.round(Number(region.x || 0) * scale));
  const y = Math.max(0, Math.round(Number(region.y || 0) * scale));
  const w = Math.max(1, Math.round(Number(region.w || 1) * scale));
  const h = Math.max(1, Math.round(Number(region.h || 1) * scale));
  return {
    x,
    y,
    width: Math.min(w, Math.max(1, imageWidth - x)),
    height: Math.min(h, Math.max(1, imageHeight - y)),
  };
}

export function cropRgba(image: Rgba, region: Region, sourceWidth: number | null): Rgba {
  const box = regionToPixels(region, image.width, image.height, sourceWidth);
  const x = Math.min(box.x, image.width - 1);
  const y = Math.min(box.y, image.height - 1);
  const width = Math.min(box.width, image.width - x);
  const height = Math.min(box.height, image.height - y);
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * image.width + x) * 4;
    data.set(image.data.subarray(from, from + width * 4), row * width * 4);
  }
  return { data, width, height };
}

/** 作る必要のある問題。版が違えば、作り済みの印は信用せず、全問作り直す。 */
export function pendingQuestionKeys(regions: Record<string, Region | null>, generation: Partial<CellGeneration> | null | undefined): string[] {
  const keys = Object.keys(regions || {})
    .filter((key) => regions[key])
    .sort((a, b) => questionNumberOf(a) - questionNumberOf(b));
  const sameVersion = generation?.version === ANSWER_CELL_VERSION;
  const done = sameVersion ? (generation?.questions || {}) : {};
  return keys.filter((key) => done[key] !== 'ready');
}

/** 作った結果を、いまの状態に重ねた「次の状態」。全問できたら complete。 */
export function nextGeneration(
  allKeys: string[],
  previous: Partial<CellGeneration> | null | undefined,
  results: Record<string, 'ready' | 'failed'>,
  now = new Date().toISOString(),
  lastError: string | null = null,
): CellGeneration {
  const sameVersion = previous?.version === ANSWER_CELL_VERSION;
  const questions: Record<string, string> = { ...(sameVersion ? (previous?.questions || {}) : {}), ...results };
  const readyCount = allKeys.filter((key) => questions[key] === 'ready').length;
  const failedCount = allKeys.filter((key) => questions[key] === 'failed').length;
  let status: CellGeneration['status'] = 'partial';
  if (allKeys.length && readyCount >= allKeys.length) status = 'complete';
  else if (!readyCount && failedCount) status = 'failed';
  return {
    version: ANSWER_CELL_VERSION,
    status,
    startedAt: previous?.startedAt || null,
    generatedAt: status === 'complete' ? now : null,
    failedAt: failedCount ? now : null,
    questions,
    lastError,
  };
}
