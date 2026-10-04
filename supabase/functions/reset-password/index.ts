// reset-password — パスワードを忘れた参加者の再発行
//
// メール認証(send-email の verify_code)を済ませた人だけが、そのメールアドレスで登録した
// エントリーのパスワードを新しいものに差し替えられる。
// 個人情報の復号は行わない(メールアドレスのハッシュだけで対象を特定する)。
// 新しいパスワードはブラウザで作ったハッシュだけを受け取る。平文は受け取らない・保存しない。

import { handleOptions, jsonResponse, serverErrorResponse, withCors } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { clientIp, clientIpHash, enforceIpRateLimit, RateLimitError } from '../_shared/rate_limit.ts';
import { logServiceEvent } from '../_shared/audit.ts';
import { verifyEmailVerifiedToken } from '../_shared/email_verify.ts';
import { ParticipantHashConfigError, pepperHash } from '../_shared/participant_hash.ts';
import { PARTICIPANT_CONFIG_ERROR_MESSAGE } from '../_shared/participant_auth.ts';
import { SigningConfigError } from '../_shared/signing.ts';

const SHA256_HEX = /^[0-9a-f]{64}$/;
const isClientHash = (value: unknown): value is string => typeof value === 'string' && SHA256_HEX.test(value);

const TOKEN_ERROR = 'メール認証を確認できませんでした。もう一度メール認証を行ってください。';

Deno.serve(withCors(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'この方法ではアクセスできません。' }, 405);

  try {
    const body = await req.json();
    const projectId = String(body.projectId || '');
    const emailHash = body.emailHash;
    const newPasswordHash = body.newPasswordHash;
    const emailVerifiedToken = String(body.emailVerifiedToken || '');

    if (!projectId) return jsonResponse({ error: '大会情報が見つかりません。メール内のリンクから開き直してください。' }, 400);
    if (!isClientHash(emailHash) || !isClientHash(newPasswordHash)) {
      return jsonResponse({ error: '入力内容を確認できませんでした。ページを読み込み直して、もう一度お試しください。' }, 400);
    }
    if (!emailVerifiedToken) return jsonResponse({ error: TOKEN_ERROR }, 400);

    const ev = await verifyEmailVerifiedToken(emailVerifiedToken, projectId, emailHash);
    if (!ev.ok) {
      console.error(`[reset-password] email verification rejected: ${ev.reason}`);
      return jsonResponse({ error: TOKEN_ERROR }, 401);
    }

    const supabase = createServiceClient();
    await enforceIpRateLimit(supabase, {
      bucket: 'participant_auth',
      ip: clientIp(req),
      projectId,
      message: '操作の回数が上限に達しました。時間をおいて再度お試しください。',
    });

    const emailHashV2 = await pepperHash(emailHash);
    const passwordHashV2 = await pepperHash(newPasswordHash);

    const { data: updated, error } = await supabase
      .from('entries')
      .update({ disclosure_password_hash_v2: passwordHashV2 })
      .eq('project_id', projectId)
      .eq('email_hash_v2', emailHashV2)
      .select('id');
    if (error) throw error;
    if (!updated || updated.length === 0) {
      return jsonResponse({ error: 'このメールアドレスで登録されたエントリーが見つかりません。' }, 404);
    }

    const ipHash = await clientIpHash(req);
    for (const row of updated) {
      await logServiceEvent(supabase, {
        projectId,
        action: 'entry.password_reset',
        targetId: String(row.id),
        actorKind: 'participant',
        actorIpHash: ipHash,
      });
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof RateLimitError) return jsonResponse({ error: error.message }, error.status);
    if (error instanceof SigningConfigError) {
      console.error('[reset-password] signing secret is not configured');
      return jsonResponse({ error: 'ただいまこの操作を受け付けられません。時間をおいて再度お試しください。' }, 503);
    }
    if (error instanceof ParticipantHashConfigError) {
      console.error('[reset-password] participant hash pepper is not configured');
      return jsonResponse({ error: PARTICIPANT_CONFIG_ERROR_MESSAGE }, 503);
    }
    return serverErrorResponse(error, 'reset-password');
  }
}));
