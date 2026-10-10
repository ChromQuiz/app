// generate-answer-cells — 用紙の画像から、解答欄の画像（問題ごとの小さな画像）をサーバーで作って保存する。
//
// 呼べるのは、定期実行・サーバー内の処理（共有の合言葉 x-ciq-cron-secret つき）か、その大会の active な owner / admin だけ。
// 作った画像は answer-cells に保存する（バケットは非公開のまま。書き込みはこの関数が service role で行う）。
// 1回の呼び出しで、未作成の用紙を数枚だけ受け取って処理する。残りは、呼び出しを繰り返して進める。

import jpeg from 'npm:jpeg-js@0.4.4';
import { handleOptions, jsonResponse, serverErrorResponse, withCors } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { safeEqual } from '../_shared/signing.ts';
import { getBearerToken, requireAdminMember } from '../_shared/project_key.ts';
import {
  ANSWER_CELL_VERSION,
  cropRgba,
  nextGeneration,
  pendingQuestionKeys,
  questionNumberOf,
  type Region,
} from '../_shared/answer_cells.ts';

const PAGES_PER_CALL = 2;
// 1回の呼び出しで、1人あたり作る枚数。全員の前のほうの問題を先にそろえるため、作りきらずに手放す。
const MAX_CELLS_PER_PAGE_CALL = 20;
const UPLOAD_CONCURRENCY = 6;
const CELL_JPEG_QUALITY = 80;
const TIME_BUDGET_MS = 20_000;

type Supabase = ReturnType<typeof createServiceClient>;

type ClaimedPage = {
  id: string;
  project_id: string;
  entry_id: string;
  entry_number: number;
  storage_path: string;
  cells: { regions?: Record<string, Region | null>; pageWidth?: number | null; cellGeneration?: Record<string, unknown> } | null;
};

// 途中経過を保存する間隔（枚数）。関数が途中で止められても、ここまでの分は「できた」と残る。
const CHECKPOINT_EVERY = 12;

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error)).slice(0, 200);
}

async function processPage(supabase: Supabase, page: ClaimedPage): Promise<{ made: number; failed: number }> {
  const regions = page.cells?.regions || {};
  const generation = (page.cells?.cellGeneration || null) as Record<string, unknown> | null;
  const allKeys = Object.keys(regions).filter((key) => regions[key]);
  const targets = pendingQuestionKeys(regions, generation as never).slice(0, MAX_CELLS_PER_PAGE_CALL);

  const results: Record<string, 'ready' | 'failed'> = {};
  let lastError: string | null = null;

  // 途中経過の保存。「作成中」の開始時刻も更新して、他の呼び出しに取られないようにする。
  const save = async (final: boolean) => {
    const next = nextGeneration(allKeys, generation as never, results, new Date().toISOString(), lastError);
    const stored = final ? next : { ...next, status: 'processing' as const, startedAt: new Date().toISOString() };
    // service_role は answer_pages を直接書けない。cellGeneration だけを書き換える関数を通す。
    const { error } = await supabase.rpc('save_answer_cell_progress', { p_page_id: page.id, p_generation: stored });
    if (error) lastError = errorText(error);
  };

  if (targets.length) {
    try {
      const { data: blob, error } = await supabase.storage.from('answer-pages').download(page.storage_path);
      if (error || !blob) throw error || new Error('page download failed');
      const decoded = jpeg.decode(new Uint8Array(await blob.arrayBuffer()), { useTArray: true, formatAsRGBA: true });
      const image = { data: decoded.data as Uint8Array, width: decoded.width, height: decoded.height };
      const sourceWidth = Number(page.cells?.pageWidth || 0) || null;

      let sinceCheckpoint = 0;
      for (let i = 0; i < targets.length; i += UPLOAD_CONCURRENCY) {
        const batch = targets.slice(i, i + UPLOAD_CONCURRENCY);
        await Promise.all(batch.map(async (key) => {
          try {
            const cell = cropRgba(image, regions[key] as Region, sourceWidth);
            const encoded = jpeg.encode({ data: cell.data, width: cell.width, height: cell.height }, CELL_JPEG_QUALITY);
            const path = `${page.project_id}/${page.entry_number}/q${questionNumberOf(key)}.webp`;
            const { error: uploadError } = await supabase.storage
              .from('answer-cells')
              .upload(path, new Uint8Array(encoded.data), { contentType: 'image/jpeg', upsert: true });
            if (uploadError) throw uploadError;
            results[key] = 'ready';
          } catch (cellError) {
            results[key] = 'failed';
            lastError = errorText(cellError);
          }
        }));
        sinceCheckpoint += batch.length;
        if (sinceCheckpoint >= CHECKPOINT_EVERY && i + UPLOAD_CONCURRENCY < targets.length) {
          sinceCheckpoint = 0;
          await save(false);
        }
      }
    } catch (pageError) {
      // 用紙を読めなかった（形式が違う・壊れている）。全問を失敗として記録し、あとで取り直す。
      lastError = errorText(pageError);
      for (const key of targets) results[key] = 'failed';
    }
  }

  await save(true);

  const made = Object.values(results).filter((value) => value === 'ready').length;
  return { made, failed: Object.values(results).length - made };
}

Deno.serve(withCors(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'この方法ではアクセスできません。' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const scopeProjectId = String(body?.projectId ?? '').trim();
    const supabase = createServiceClient();

    const cronSecret = Deno.env.get('CIQ_CRON_SECRET') || '';
    const given = req.headers.get('x-ciq-cron-secret') || '';
    const isInternal = Boolean(cronSecret) && Boolean(given) && given.length === cronSecret.length && safeEqual(given, cronSecret);
    if (!isInternal) {
      if (!scopeProjectId) return jsonResponse({ error: '大会情報を取得できませんでした。ページを再読み込みして、もう一度お試しください。' }, 400);
      try {
        await requireAdminMember(supabase, scopeProjectId, getBearerToken(req));
      } catch {
        return jsonResponse({ error: 'この操作を行う権限がありません。' }, 403);
      }
    }

    const startedAt = Date.now();
    const { data: claimed, error: claimError } = await supabase.rpc('claim_answer_cell_pages', {
      p_project_id: scopeProjectId || null,
      p_limit: PAGES_PER_CALL,
    });
    if (claimError) throw claimError;

    let pages = 0;
    let made = 0;
    let failed = 0;
    for (const page of (claimed || []) as ClaimedPage[]) {
      // 時間がなければ、残りは「作成中」のまま返す（3分後に別の呼び出しが取り直す）。
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      const result = await processPage(supabase, page);
      pages += 1;
      made += result.made;
      failed += result.failed;
    }

    return jsonResponse({ ok: true, version: ANSWER_CELL_VERSION, pages, made, failed });
  } catch (error) {
    return serverErrorResponse(error, 'generate-answer-cells');
  }
}));
