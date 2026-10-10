import { handleOptions, jsonResponse, serverErrorResponse, withCors } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { getBearerToken, requireAdminMember, unwrapPrivateKey, wrapPrivateKey } from '../_shared/project_key.ts';

Deno.serve(withCors(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'この方法ではアクセスできません。' }, 405);

  try {
    const token = getBearerToken(req);
    const body = await req.json();
    const action = String(body.action || '');
    const projectId = String(body.projectId || '');
    if (!projectId) return jsonResponse({ error: '大会の情報が見つかりません。ページを再読み込みして、もう一度お試しください。' }, 400);

    const supabase = createServiceClient();
    const member = await requireAdminMember(supabase, projectId, token);

    if (action === 'store') {
      if (!body.privateKeyJwk || typeof body.privateKeyJwk !== 'object') {
        return jsonResponse({ error: '保存する鍵の情報が不足しています。ページを再読み込みして、もう一度お試しください。' }, 400);
      }
      const encryptedPrivateKey = await wrapPrivateKey(body.privateKeyJwk);
      const { error } = await supabase
        .from('project_private_keys')
        .upsert({
          project_id: projectId,
          encrypted_private_key: encryptedPrivateKey,
          updated_by: member.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'project_id' });
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    if (action === 'fetch') {
      const { data, error } = await supabase
        .from('project_private_keys')
        .select('encrypted_private_key')
        .eq('project_id', projectId)
        .single();
      if (error || !data?.encrypted_private_key) {
        return jsonResponse({ error: 'この大会の鍵は保存されていません。' }, 404);
      }
      const privateKeyJwk = await unwrapPrivateKey(data.encrypted_private_key);
      return jsonResponse({ ok: true, privateKeyJwk });
    }

    return jsonResponse({ error: '不明な操作です。' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Forbidden') return jsonResponse({ error: 'この大会の鍵を扱う権限がありません。' }, 403);
    if (message.includes('Authentication')) return jsonResponse({ error: 'Googleログインが必要です。' }, 401);
    return serverErrorResponse(error, 'project-key');
  }
}));
