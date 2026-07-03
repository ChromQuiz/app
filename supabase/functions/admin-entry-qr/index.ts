import { handleOptions, jsonResponse } from '../_shared/http.ts';
import { makeQrSvg } from '../_shared/qr.ts';
import { createServiceClient } from '../_shared/supabase.ts';

type SupabaseClient = ReturnType<typeof createServiceClient>;

async function requireAdminMember(supabase: SupabaseClient, req: Request, projectId: string) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Authentication required');

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Authentication required');

  const { data: member, error: memberError } = await supabase
    .from('project_members')
    .select('id, role, status')
    .eq('project_id', projectId)
    .eq('user_id', userData.user.id)
    .single();
  if (memberError || !member || member.status !== 'active') throw new Error('Forbidden');
  if (member.role !== 'owner' && member.role !== 'admin') throw new Error('Forbidden');
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { projectId, entryId } = await req.json();
    if (!projectId || !entryId) return jsonResponse({ error: 'Missing required fields' }, 400);

    const supabase = createServiceClient();
    await requireAdminMember(supabase, req, projectId);

    const { data: entry, error } = await supabase
      .from('entries')
      .select('id')
      .eq('project_id', projectId)
      .eq('id', entryId)
      .single();
    if (error || !entry) return jsonResponse({ error: 'エントリーが見つかりません。' }, 404);

    const svg = await makeQrSvg(entry.id);
    return jsonResponse({ ok: true, svg });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'Forbidden' ? 403 : message === 'Authentication required' ? 401 : 500;
    const publicMessage = message === 'Forbidden'
      ? 'このプロジェクトのQRコードを取得する権限がありません。'
      : message === 'Authentication required'
        ? 'Googleログインが必要です。'
        : message;
    return jsonResponse({ error: publicMessage }, status);
  }
});
