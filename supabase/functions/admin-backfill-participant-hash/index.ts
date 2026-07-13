// admin-backfill-participant-hash — 一時的な管理者専用バックフィル(P2-e3)
//
// 目的: 既存 entries のうち email_hash_v2 / disclosure_password_hash_v2 が NULL の行を、
//       v2 = HMAC-SHA256(CIQ_PARTICIPANT_HASH_PEPPER, 旧hash) で補完する(dual-write の遡及)。
//
// 原則:
//  - pepper は Edge Secret 内から出さない(participant_hash.ts 経由で利用・値はログ/レスポンスに出さない)。
//  - クライアントからは projectId のみ受け取る(pepper/hash/v2/SQL/列名/batch は受け取らない)。
//  - 既に非NULLの v2 列は絶対に上書きしない(NULL列だけ patch・UPDATE 時も IS NULL ガード)。
//  - v2 以外の列は更新しない。1行の失敗でバッチ全体を止めない。
//  - pepper 未設定は設定障害として処理全体を中断し 503(構造上、UPDATE 前に停止)。
//  - このFunctionは実行後に削除する一時資産。

import { handleOptions, jsonResponse, serverErrorResponse, withCors } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { ParticipantHashConfigError, participantPepper, pepperHash } from '../_shared/participant_hash.ts';

type SupabaseClient = ReturnType<typeof createServiceClient>;

// サーバ固定のバッチサイズ(クライアントからは受け取らない)。
const BATCH_SIZE = 25;

// 旧hashが有効な SHA-256(hex) か(64文字小文字16進)。不正・欠落行は更新せず failed に数える。
const SHA256_HEX = /^[0-9a-f]{64}$/;
function isSourceHash(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX.test(value);
}

// 既存の管理者認可パターン(admin-create-entry と同型)。owner/admin の active member を要求。
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

// 同 projectId で v2 のいずれかが NULL の残件数(処理後の remaining 算出用)。
async function countRemaining(supabase: SupabaseClient, projectId: string): Promise<number> {
  const { count, error } = await supabase
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .or('email_hash_v2.is.null,disclosure_password_hash_v2.is.null');
  if (error) throw error;
  return count || 0;
}

Deno.serve(withCors(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const projectId = body?.projectId;
    if (typeof projectId !== 'string' || !projectId.trim()) {
      return jsonResponse({ error: 'projectId is required' }, 400);
    }

    const supabase = createServiceClient();
    // 認可成功後にのみ対象取得・更新を行う。
    await requireAdminMember(supabase, req, projectId);

    // pepper 事前検証: 未設定なら UPDATE を1件も行わずここで中断(構造上の保証)。
    participantPepper();

    // v2 のいずれかが NULL の行を安定順(id 昇順)で1バッチ取得。取得列は最小限。
    const { data: rows, error: fetchError } = await supabase
      .from('entries')
      .select('id, email_hash, disclosure_password_hash, email_hash_v2, disclosure_password_hash_v2')
      .eq('project_id', projectId)
      .or('email_hash_v2.is.null,disclosure_password_hash_v2.is.null')
      .order('id', { ascending: true })
      .limit(BATCH_SIZE);
    if (fetchError) throw fetchError;

    let processed = 0;
    let updated = 0;
    let failed = 0;

    for (const row of rows ?? []) {
      processed += 1;
      try {
        const needEmail = row.email_hash_v2 === null;
        const needPw = row.disclosure_password_hash_v2 === null;
        if (!needEmail && !needPw) continue; // 両方非NULL(取得条件上通常起きない): 更新しない

        // 必要な旧hashがすべて有効でなければ、部分更新せず failed に数える。
        if ((needEmail && !isSourceHash(row.email_hash)) || (needPw && !isSourceHash(row.disclosure_password_hash))) {
          failed += 1;
          console.error('[admin-backfill-participant-hash] row skipped: invalid or missing source hash');
          continue;
        }

        // 必要な v2 をすべて算出してから UPDATE(全計算成功後にのみ書き込む)。
        const patch: Record<string, string> = {};
        if (needEmail) patch.email_hash_v2 = await pepperHash(row.email_hash);
        if (needPw) patch.disclosure_password_hash_v2 = await pepperHash(row.disclosure_password_hash);

        // 対象行限定(id + project_id)＋ 競合時に既存非NULLを上書きしないよう IS NULL ガード。
        let query = supabase.from('entries').update(patch).eq('id', row.id).eq('project_id', projectId);
        if (needEmail) query = query.is('email_hash_v2', null);
        if (needPw) query = query.is('disclosure_password_hash_v2', null);
        const { error: updateError } = await query;
        if (updateError) {
          failed += 1;
          console.error('[admin-backfill-participant-hash] row update failed');
          continue;
        }
        updated += 1;
      } catch (rowError) {
        // 設定障害は全体中断(以降も失敗するため)。それ以外の行エラーは failed に数えて継続。
        if (rowError instanceof ParticipantHashConfigError) throw rowError;
        failed += 1;
        console.error('[admin-backfill-participant-hash] row error');
      }
    }

    const remaining = await countRemaining(supabase, projectId);
    console.error(`[admin-backfill-participant-hash] done processed=${processed} updated=${updated} failed=${failed} remaining=${remaining}`);
    return jsonResponse({ processed, updated, failed, remaining, done: remaining === 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Authentication required') {
      return jsonResponse({ error: 'Googleログインが必要です。' }, 401);
    }
    if (message === 'Forbidden') {
      return jsonResponse({ error: 'この操作を行う権限がありません。' }, 403);
    }
    if (error instanceof ParticipantHashConfigError) {
      console.error('[admin-backfill-participant-hash] participant hash configuration unavailable');
      return jsonResponse({ error: 'ただいま処理を実行できません。時間をおいて再度お試しください。' }, 503);
    }
    return serverErrorResponse(error, 'admin-backfill-participant-hash');
  }
}));
