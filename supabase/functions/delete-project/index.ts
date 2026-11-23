import { handleOptions, jsonResponse, serverErrorResponse, withCors } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { getBearerToken, requireAdminMember } from '../_shared/project_key.ts';
import { isSafeProjectId, removeProjectFiles } from '../_shared/project_storage.ts';

// 大会の削除(取り消せない)。
// 1. 呼び出した人が、その大会の有効な所有者・管理者であることを確かめる(requireAdminMember)
// 2. 確認用の大会 ID が一致することを確かめる
// 3. Storage の答案画像・アイコンを消す(失敗したら、データベースは触らずに止まる。やり直せる)
// 4. delete_project_data で、データベースの大会を消す(子の表は cascade)
Deno.serve(withCors(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'この方法ではアクセスできません。' }, 405);

  try {
    const token = getBearerToken(req);
    const body = await req.json();
    const projectId = String(body.projectId || '');
    if (!isSafeProjectId(projectId)) {
      return jsonResponse({ error: '大会の情報が見つかりません。ページを再読み込みして、もう一度お試しください。' }, 400);
    }

    const supabase = createServiceClient();
    // 呼び出した人の ID は、Storage を消す前に確かめる(あとで落ちて、画像だけ消えた状態にしない)
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userError || !userId) throw new Error('Authentication required');
    await requireAdminMember(supabase, projectId, token);

    if (String(body.confirmProjectId || '') !== projectId) {
      return jsonResponse({ error: '確認の大会IDが一致しません。ページを再読み込みして、もう一度お試しください。' }, 400);
    }

    await removeProjectFiles(supabase, projectId);

    const { error } = await supabase.rpc('delete_project_data', {
      p_project_id: projectId,
      p_actor_user_id: userId,
    });
    if (error) throw error;
    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Forbidden') return jsonResponse({ error: 'この大会を削除する権限がありません。' }, 403);
    if (message.includes('Authentication')) return jsonResponse({ error: 'Googleログインが必要です。' }, 401);
    return serverErrorResponse(error, 'delete-project');
  }
}));
