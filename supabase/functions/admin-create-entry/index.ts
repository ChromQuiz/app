import { handleOptions, jsonResponse, serverErrorResponse, withCors } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { clientIpHash } from '../_shared/rate_limit.ts';
import { logServiceEvent } from '../_shared/audit.ts';
import { ParticipantHashConfigError, pepperHash } from '../_shared/participant_hash.ts';

type SupabaseClient = ReturnType<typeof createServiceClient>;

// クライアントの SHA-256(hex) 形式検証: 64文字の小文字16進のみ許可(前後空白・大文字・非hexは不可)。
const SHA256_HEX = /^[0-9a-f]{64}$/;
function isClientHash(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX.test(value);
}

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

Deno.serve(withCors(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const { projectId, encryptedPii, emailHash, disclosurePasswordHash, publicProfile } = body;
    if (!projectId || !encryptedPii || !emailHash || !disclosurePasswordHash) {
      return jsonResponse({ error: '代理エントリーの作成に必要な情報が不足しています。入力内容を確認してください。' }, 400);
    }
    // 入力ハッシュの形式検証(クライアント SHA-256 hex)。クライアント送信の v2 値は読まない=無視。
    if (!isClientHash(emailHash) || !isClientHash(disclosurePasswordHash)) {
      return jsonResponse({ error: '登録情報の形式が正しくありません。入力内容を確認して再度お試しください。' }, 400);
    }

    const supabase = createServiceClient();
    const member = await requireAdminMember(supabase, req, projectId);

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
      const mapped = entryErrorResponse(insertError);
      if (mapped) return mapped;
      throw insertError;
    }

    await logServiceEvent(supabase, {
      projectId,
      action: 'entry.create_by_staff',
      targetId: entry?.id ? String(entry.id) : null,
      actorKind: 'staff',
      actorMemberId: member?.id ? String(member.id) : null,
      actorIpHash: await clientIpHash(req),
      afterData: entry?.status ? { status: entry.status } : null,
    });

    return jsonResponse({ ok: true, entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Forbidden') {
      return jsonResponse({ error: 'このプロジェクトに参加者を追加する権限がありません。' }, 403);
    }
    if (message === 'Authentication required') {
      return jsonResponse({ error: 'Googleログインが必要です。' }, 401);
    }
    if (error instanceof ParticipantHashConfigError) {
      console.error('[admin-create-entry] participant hash configuration unavailable');
      return jsonResponse({ error: 'ただいま登録を受け付けられません。時間をおいて再度お試しください。' }, 503);
    }
    return serverErrorResponse(error, 'admin-create-entry');
  }
}));
