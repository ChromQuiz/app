import { handleOptions, jsonResponse, serverErrorResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { ParticipantAuthError, resolveParticipantAuth } from '../_shared/participant_auth.ts';
import { SigningConfigError } from '../_shared/signing.ts';
import { clientIp, clientIpHash } from '../_shared/rate_limit.ts';
import { logServiceEvent } from '../_shared/audit.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const { projectId } = body;
    if (!projectId) {
      return jsonResponse({ error: 'プロジェクト情報が見つかりません。URLを確認してください。' }, 400);
    }

    const supabase = createServiceClient();

    // 認証(トークン or ハッシュ照合)。RPC は従来どおりハッシュ一致を要求するため、
    // 認証済みエントリー行から保存済みハッシュを引いて渡す。
    const { entry, emailHash } = await resolveParticipantAuth(
      supabase,
      body,
      'id, disclosure_password_hash',
      { ip: clientIp(req) },
    );

    const { data, error } = await supabase
      .rpc('cancel_entry_atomic', {
        p_project_id: projectId,
        p_email_hash: emailHash,
        p_disclosure_password_hash: entry.disclosure_password_hash,
      })
      .single();

    if (error) {
      const message = error.message || '';
      if (message.includes('Entry already checked in')) {
        return jsonResponse({ error: '当日受付済みのため、キャンセルできません。変更が必要な場合は運営へ連絡してください。' }, 409);
      }
      return jsonResponse({ error: 'メールアドレスまたはパスワードが正しくありません。' }, 404);
    }
    if (!data) return jsonResponse({ error: 'メールアドレスまたはパスワードが正しくありません。' }, 404);

    await logServiceEvent(supabase, {
      projectId,
      action: 'entry.cancel',
      targetId: data.canceled_entry_id ? String(data.canceled_entry_id) : null,
      actorKind: 'participant',
      actorIpHash: await clientIpHash(req),
      afterData: { status: 'canceled' },
    });

    return jsonResponse({
      ok: true,
      canceledEntry: {
        id: data.canceled_entry_id,
        entryNumber: data.canceled_entry_number,
      },
      promotedEntry: data.promoted_entry_id ? {
        id: data.promoted_entry_id,
        entryNumber: data.promoted_entry_number,
      } : null,
    });
  } catch (error) {
    if (error instanceof ParticipantAuthError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    if (error instanceof SigningConfigError) {
      console.error('[cancel-entry] signing secret is not configured');
      return jsonResponse({ error: 'ただいまこの操作を受け付けられません。時間をおいて再度お試しください。' }, 503);
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Entry already checked in')) {
      return jsonResponse({ error: '当日受付済みのため、キャンセルできません。変更が必要な場合は運営へ連絡してください。' }, 409);
    }
    return serverErrorResponse(error, 'cancel-entry');
  }
});
