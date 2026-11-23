// project_storage.ts — 大会に紐づく Storage のファイルを、フォルダごと消す(大会の削除用)。
// 保存先は <bucket>/<project_id>/... (答案: <project_id>/<受付番号>/page.webp など)。

import { createServiceClient } from './supabase.ts';

type Client = ReturnType<typeof createServiceClient>;

const PAGE = 1000;
const MAX_ROUNDS = 200; // 取りこぼしても無限に回らないための上限

// 大会 ID だけを許す(パスの書き換えを防ぐ)。
export function isSafeProjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

// prefix(フォルダ)の下のファイルを、深い階層まで、すべて消す。消した件数を返す。
export async function removeFolder(supabase: Client, bucket: string, prefix: string): Promise<number> {
  const store = supabase.storage.from(bucket);
  let removed = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await store.list(prefix, { limit: PAGE, offset: 0 });
    if (error) throw error;
    const items = data || [];
    if (!items.length) return removed;

    // id が無い項目はフォルダ。先に中身を消す
    const folders = items.filter((item) => !item.id);
    const files = items.filter((item) => item.id).map((item) => `${prefix}/${item.name}`);
    for (const folder of folders) removed += await removeFolder(supabase, bucket, `${prefix}/${folder.name}`);
    if (files.length) {
      const { error: removeError } = await store.remove(files);
      if (removeError) throw removeError;
      removed += files.length;
    }
    // 次の周回で、残りがなければ終わる(消した分だけ前に詰まるので、offset は 0 のまま)
    if (items.length < PAGE && !folders.length) return removed;
  }
  throw new Error(`Storage cleanup did not finish: ${bucket}/${prefix}`);
}

export const PROJECT_STORAGE_BUCKETS = ['answer-pages', 'answer-cells', 'project-icon'] as const;

export async function removeProjectFiles(supabase: Client, projectId: string) {
  if (!isSafeProjectId(projectId)) throw new Error('Invalid project id');
  let removed = 0;
  for (const bucket of PROJECT_STORAGE_BUCKETS) {
    removed += await removeFolder(supabase, bucket, projectId);
  }
  return removed;
}
