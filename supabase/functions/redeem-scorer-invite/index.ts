// redeem-scorer-invite — 招待リンクを引き換えて採点者として参加する（AB-1）。
//
// 認可: Google ログイン済み（Supabase Auth）であること。招待トークンの正当性はサーバ側で検証する。
// 期限切れ・無効化・上限到達はすべて RPC 内で判定し、使用回数は原子的に加算する。
// 失敗理由は利用者向けの日本語に丸め、内部情報は返さない。

import { handleOptions, jsonResponse, serverErrorResponse, withCors } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { SigningConfigError } from '../_shared/signing.ts';
import { clientIp, clientIpHash, enforceIpRateLimit, RateLimitError } from '../_shared/rate_limit.ts';
import { logServiceEvent } from '../_shared/audit.ts';
import { inviteTokenHash, isPlausibleInviteToken } from '../_shared/invite_token.ts';

const INVALID_MESSAGE = 'この招待リンクは使用できません。管理者に新しいリンクを発行してもらってください。';

Deno.serve(withCors(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const token = body?.token;
    // 形式が明らかに不正なものは DB 照会前に弾く。
    if (!isPlausibleInviteToken(token)) return jsonResponse({ error: INVALID_MESSAGE }, 400);

    const authHeader = req.headers.get('authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return jsonResponse({ error: 'Googleログインが必要です。' }, 401);

    const supabase = createServiceClient();

    // トークン総当たりを抑える（256bit なので現実的な脅威ではないが、多層防御として入口で制限）。
    await enforceIpRateLimit(supabase, { bucket: 'participant_auth', ip: clientIp(req), projectId: null });

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData.user) return jsonResponse({ error: 'Googleログインが必要です。' }, 401);

    const displayName = String(
      body?.displayName
      || userData.user.user_metadata?.full_name
      || userData.user.user_metadata?.name
      || userData.user.email
      || 'Scorer',
    ).slice(0, 100);

    const tokenHash = await inviteTokenHash(String(token));

    const { data, error } = await supabase.rpc('redeem_scorer_invite', {
      p_token_hash: tokenHash,
      p_user_id: userData.user.id,
      p_display_name: displayName,
    }).single();

    if (error) {
      const message = error.message || '';
      // 利用者にはリンクが使えない事実だけを伝え、どの条件で落ちたかは細かく出し分けない。
      if (message.includes('Invalid invite')) return jsonResponse({ error: INVALID_MESSAGE }, 404);
      if (message.includes('Invite expired')) return jsonResponse({ error: 'この招待リンクは有効期限が切れています。管理者に新しいリンクを発行してもらってください。' }, 410);
      if (message.includes('Invite revoked')) return jsonResponse({ error: INVALID_MESSAGE }, 403);
      if (message.includes('Invite exhausted')) return jsonResponse({ error: 'この招待リンクは使用上限に達しています。管理者にお問い合わせください。' }, 409);
      if (message.includes('Member was removed')) return jsonResponse({ error: 'このアカウントはプロジェクトから削除されています。管理者にお問い合わせください。' }, 403);
      throw error;
    }

    if (!data?.already_member) {
      await logServiceEvent(supabase, {
        projectId: String(data?.project_id || ''),
        action: 'scorer_invite.redeem',
        actorKind: 'staff',
        actorUserId: userData.user.id,
        actorIpHash: await clientIpHash(req),
        afterData: { role: data?.role || 'scorer' },
      });
    }

    return jsonResponse({
      ok: true,
      projectId: data?.project_id,
      role: data?.role,
      displayName: data?.display_name,
      alreadyMember: Boolean(data?.already_member),
    });
  } catch (error) {
    if (error instanceof RateLimitError) return jsonResponse({ error: error.message }, error.status);
    if (error instanceof SigningConfigError) {
      console.error('[redeem-scorer-invite] signing secret is not configured');
      return jsonResponse({ error: '現在ご参加いただけません。時間をおいて再度お試しください。' }, 503);
    }
    return serverErrorResponse(error, 'redeem-scorer-invite');
  }
}));
