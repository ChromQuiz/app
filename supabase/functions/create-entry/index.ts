import { handleOptions, jsonResponse, serverErrorResponse, withCors } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { clientIp, clientIpHash, enforceIpRateLimit, RateLimitError } from '../_shared/rate_limit.ts';
import { logServiceEvent } from '../_shared/audit.ts';
import { emailVerificationRequired, verifyEmailVerifiedToken } from '../_shared/email_verify.ts';
import { ParticipantHashConfigError, pepperHash } from '../_shared/participant_hash.ts';

// クライアントの SHA-256(hex) 形式検証: 64文字の小文字16進のみ許可(前後空白・大文字・非hexは不可)。
const SHA256_HEX = /^[0-9a-f]{64}$/;
function isClientHash(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX.test(value);
}

Deno.serve(withCors(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const { projectId, encryptedPii, emailHash, disclosurePasswordHash, publicProfile, emailVerifiedToken } = body;
    if (!projectId) return jsonResponse({ error: 'プロジェクト情報が見つかりません。URLを確認してください。' }, 400);
    if (!encryptedPii || !emailHash || !disclosurePasswordHash) {
      return jsonResponse({ error: 'エントリー情報が不足しています。入力内容を確認してもう一度送信してください。' }, 400);
    }
    // 入力ハッシュの形式検証(クライアント SHA-256 hex)。クライアント送信の v2 値は読まない=無視。
    if (!isClientHash(emailHash) || !isClientHash(disclosurePasswordHash)) {
      return jsonResponse({ error: '登録情報の形式が正しくありません。入力内容を確認して再度お試しください。' }, 400);
    }

    // 公開登録はメール認証済みトークンを必須にする(フロント検証には依存しない)。
    // 欠落=400 / 無効・改ざん・期限切れ・メール不一致・projectId不一致=401。理由はサーバログのみ。
    if (emailVerificationRequired()) {
      if (!emailVerifiedToken) {
        return jsonResponse({ error: 'メール認証を確認できませんでした。もう一度メール認証を行ってください。' }, 400);
      }
      const ev = await verifyEmailVerifiedToken(String(emailVerifiedToken), String(projectId), String(emailHash));
      if (!ev.ok) {
        console.error(`[create-entry] email verification rejected: ${ev.reason}`);
        return jsonResponse({ error: 'メール認証を確認できませんでした。もう一度メール認証を行ってください。' }, 401);
      }
    }

    const supabase = createServiceClient();
    await enforceIpRateLimit(supabase, { bucket: 'create_entry', ip: clientIp(req), projectId });

    // v2(peppered)を生成。両方そろってから RPC を呼ぶ(pepper 未設定なら例外→RPC未実行)。
    const emailHashV2 = await pepperHash(emailHash);
    const disclosurePasswordHashV2 = await pepperHash(disclosurePasswordHash);

    const { data: entry, error: insertError } = await supabase
      .rpc('create_entry_atomic', {
        // P2-e5 ②: 旧列(p_email_hash / p_disclosure_password_hash)は送らない。書込は v2 のみ。
        p_project_id: projectId,
        p_encrypted_pii: encryptedPii,
        p_entry_name: publicProfile?.entryName || null,
        p_affiliation: publicProfile?.affiliation || null,
        p_grade: publicProfile?.grade || null,
        p_message: publicProfile?.message || null,
        p_inquiry: publicProfile?.inquiry || null,
        p_is_chubu: Boolean(publicProfile?.isChubu),
        p_email_hash_v2: emailHashV2,
        p_disclosure_password_hash_v2: disclosurePasswordHashV2,
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

    await logServiceEvent(supabase, {
      projectId,
      action: 'entry.create',
      targetId: entry?.id ? String(entry.id) : null,
      actorKind: 'participant',
      actorIpHash: await clientIpHash(req),
      afterData: entry?.status ? { status: entry.status } : null,
    });

    return jsonResponse({ ok: true, entry });
  } catch (error) {
    if (error instanceof RateLimitError) return jsonResponse({ error: error.message }, error.status);
    if (error instanceof ParticipantHashConfigError) {
      console.error('[create-entry] participant hash configuration unavailable');
      return jsonResponse({ error: 'ただいま登録を受け付けられません。時間をおいて再度お試しください。' }, 503);
    }
    return serverErrorResponse(error, 'create-entry');
  }
}));
