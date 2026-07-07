import { handleOptions, jsonResponse, serverErrorResponse } from '../_shared/http.ts';
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
  return member;
}

function entryErrorResponse(error: { code?: string; message?: string }) {
  const message = error.message || '';
  if (error.code === '23505' || message.includes('entries_active_email_unique')) {
    return jsonResponse({ error: 'このメールアドレスは既にエントリー済みです。' }, 409);
  }
  if (message.includes('Entry is closed')) {
    return jsonResponse({ error: '受付は現在停止中です。' }, 403);
  }
  if (message.includes('Entry period has not started')) {
    return jsonResponse({ error: 'エントリー受付はまだ開始されていません。' }, 403);
  }
  if (message.includes('Entry period has ended')) {
    return jsonResponse({ error: 'エントリー受付は終了しました。' }, 403);
  }
  return null;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const { projectId, encryptedPii, emailHash, disclosurePasswordHash, publicProfile } = body;
    if (!projectId || !encryptedPii || !emailHash || !disclosurePasswordHash) {
      return jsonResponse({ error: '代理エントリーの作成に必要な情報が不足しています。入力内容を確認してください。' }, 400);
    }

    const supabase = createServiceClient();
    await requireAdminMember(supabase, req, projectId);

    const { data: entry, error: insertError } = await supabase
      .rpc('create_entry_atomic', {
        p_project_id: projectId,
        p_encrypted_pii: encryptedPii,
        p_email_hash: emailHash,
        p_disclosure_password_hash: disclosurePasswordHash,
        p_entry_name: publicProfile?.entryName || null,
        p_affiliation: publicProfile?.affiliation || null,
        p_grade: publicProfile?.grade || null,
        p_message: publicProfile?.message || null,
        p_inquiry: publicProfile?.inquiry || null,
        p_is_chubu: Boolean(publicProfile?.isChubu),
      })
      .single();
    if (insertError) {
      const mapped = entryErrorResponse(insertError);
      if (mapped) return mapped;
      throw insertError;
    }

    return jsonResponse({ ok: true, entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Forbidden') {
      return jsonResponse({ error: 'このプロジェクトに参加者を追加する権限がありません。' }, 403);
    }
    if (message === 'Authentication required') {
      return jsonResponse({ error: 'Googleログインが必要です。' }, 401);
    }
    return serverErrorResponse(error, 'admin-create-entry');
  }
});
