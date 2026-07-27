// create-scorer-invite — 採点者の招待リンクを発行する（AB-1）。
//
// 認可: プロジェクトの active な owner/admin のみ（admin-* と同じ判定）。
// トークンは Edge 内で CSPRNG 生成し、**平文はこの応答でだけ返す**（DB には HMAC のみ保存）。
// 有効期限 7 日・role=scorer は RPC 側で固定。管理者が指定できるのは使用上限人数だけ。

import { handleOptions, jsonResponse, serverErrorResponse, withCors } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { SigningConfigError } from '../_shared/signing.ts';
import { clientIpHash } from '../_shared/rate_limit.ts';
import { logServiceEvent } from '../_shared/audit.ts';
import { generateInviteToken, inviteTokenHash } from '../_shared/invite_token.ts';

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
  return { member, userId: userData.user.id };
}

Deno.serve(withCors(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const projectId = String(body?.projectId || '').trim();
    if (!projectId) return jsonResponse({ error: 'プロジェクト情報が見つかりません。' }, 400);

    // 上限人数のみクライアント指定可（RPC 側でも 1..500 にクランプする）。
    const maxUses = Number(body?.maxUses);
    const requestedMax = Number.isFinite(maxUses) && maxUses > 0 ? Math.floor(maxUses) : 20;

    const supabase = createServiceClient();
    const { member, userId } = await requireAdminMember(supabase, req, projectId);

    const token = generateInviteToken();
    const tokenHash = await inviteTokenHash(token);

    const { data, error } = await supabase.rpc('create_scorer_invite', {
      p_project_id: projectId,
      p_token_hash: tokenHash,
      p_max_uses: requestedMax,
      p_created_by: userId,
    }).single();
    if (error) throw error;

    await logServiceEvent(supabase, {
      projectId,
      action: 'scorer_invite.create',
      targetId: data?.id ? String(data.id) : null,
      actorKind: 'staff',
      actorMemberId: member?.id ? String(member.id) : null,
      actorIpHash: await clientIpHash(req),
      afterData: { max_uses: data?.max_uses ?? requestedMax },
    });

    // 平文トークンを返すのはこの一度だけ（DB には保存していないため再表示はできない）。
    return jsonResponse({
      ok: true,
      invite: {
        id: data?.id,
        token,
        maxUses: data?.max_uses,
        expiresAt: data?.expires_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Forbidden') return jsonResponse({ error: 'この操作を行う権限がありません。' }, 403);
    if (message === 'Authentication required') return jsonResponse({ error: 'Googleログインが必要です。' }, 401);
    if (error instanceof SigningConfigError) {
      console.error('[create-scorer-invite] signing secret is not configured');
      return jsonResponse({ error: '招待リンクを発行できませんでした。運営にお問い合わせください。' }, 503);
    }
    return serverErrorResponse(error, 'create-scorer-invite');
  }
}));
