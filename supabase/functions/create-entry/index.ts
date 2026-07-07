import { handleOptions, jsonResponse, serverErrorResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { clientIp, enforceIpRateLimit, RateLimitError } from '../_shared/rate_limit.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const { projectId, encryptedPii, emailHash, disclosurePasswordHash, publicProfile } = body;
    if (!projectId) return jsonResponse({ error: 'プロジェクト情報が見つかりません。URLを確認してください。' }, 400);
    if (!encryptedPii || !emailHash || !disclosurePasswordHash) {
      return jsonResponse({ error: 'エントリー情報が不足しています。入力内容を確認してもう一度送信してください。' }, 400);
    }

    const supabase = createServiceClient();
    await enforceIpRateLimit(supabase, { bucket: 'create_entry', ip: clientIp(req), projectId });

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
      const message = insertError.message || '';
      if (insertError.code === '23505' || message.includes('entries_active_email_unique')) {
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
      throw insertError;
    }

    return jsonResponse({ ok: true, entry });
  } catch (error) {
    if (error instanceof RateLimitError) return jsonResponse({ error: error.message }, error.status);
    return serverErrorResponse(error, 'create-entry');
  }
});
