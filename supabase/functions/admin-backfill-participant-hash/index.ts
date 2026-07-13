// admin-backfill-participant-hash — 一時的なバックフィル(P2-e3)
//
// 目的: 既存 entries のうち email_hash_v2 / disclosure_password_hash_v2 が NULL の行を、
//       v2 = HMAC-SHA256(CIQ_PARTICIPANT_HASH_PEPPER, 旧hash) で補完する(dual-write の遡及)。
//
// 認証: 一度限りの内部Secret認証。リクエストヘッダ x-ciq-backfill-secret と Edge Secret
//       CIQ_PARTICIPANT_BACKFILL_SECRET をタイミングセーフ比較(safeEqual)し、不一致・欠落は 401。
//       Secret値はログ/レスポンスに一切出さない。この経路以外の入力(SQL/行ID/batch)は受け付けない。
//
// 原則:
//  - pepper は Edge Secret 内から出さない(participant_hash.ts 経由で利用・値はログ/レスポンスに出さない)。
//  - クライアントからは projectId のみ受け取る(pepper/hash/v2/SQL/列名/batch は受け取らない)。
//  - 既に非NULLの v2 列は絶対に上書きしない(NULL列だけ patch・UPDATE 時も IS NULL ガード)。
//  - v2 以外の列は更新しない。1行の失敗でバッチ全体を止めない。
//  - pepper 未設定は設定障害として処理全体を中断し 503(構造上、UPDATE 前に停止)。
//  - 冪等・再実行可能。このFunction・Secretは実行後にすべて撤去する一時資産。

import { handleOptions, jsonResponse, serverErrorResponse, withCors } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { safeEqual } from '../_shared/signing.ts';
import { ParticipantHashConfigError, participantPepper, pepperHash } from '../_shared/participant_hash.ts';

type SupabaseClient = ReturnType<typeof createServiceClient>;

// サーバ固定のバッチサイズ(クライアントからは受け取らない)。
const BATCH_SIZE = 25;

// 内部Secretの最小長(32バイト=hex64相当)。短すぎる/未設定は認証不可とする。
const BACKFILL_SECRET_MIN_LENGTH = 32;

// 旧hashが有効な SHA-256(hex) か(64文字小文字16進)。不正・欠落行は更新せず failed に数える。
const SHA256_HEX = /^[0-9a-f]{64}$/;
function isSourceHash(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX.test(value);
}

/** 内部Secret認証の失敗(欠落・不一致・サーバSecret未設定)。呼び出し側は 401 にマップする。 */
class BackfillAuthError extends Error {
  constructor() {
    super('Backfill authentication failed');
    this.name = 'BackfillAuthError';
  }
}

// 一度限りの内部Secret認証。x-ciq-backfill-secret と Edge Secret をタイミングセーフ比較する。
// サーバSecret未設定/短すぎる場合も認証不可(401)。値はログ・レスポンスに出さない。
function requireBackfillSecret(req: Request) {
  const expected = Deno.env.get('CIQ_PARTICIPANT_BACKFILL_SECRET') || '';
  const provided = req.headers.get('x-ciq-backfill-secret') || '';
  if (expected.length < BACKFILL_SECRET_MIN_LENGTH) throw new BackfillAuthError();
  if (!provided || !safeEqual(provided, expected)) throw new BackfillAuthError();
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

    // 内部Secret認証: 一致した場合のみ以降のバックフィル処理へ進む(不一致・欠落は 401)。
    requireBackfillSecret(req);

    const supabase = createServiceClient();

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
    if (error instanceof BackfillAuthError) {
      // Secret値やヘッダ内容はログに出さない(汎用の失敗のみ記録)。
      console.error('[admin-backfill-participant-hash] backfill authentication failed');
      return jsonResponse({ error: '認証に失敗しました。' }, 401);
    }
    if (error instanceof ParticipantHashConfigError) {
      console.error('[admin-backfill-participant-hash] participant hash configuration unavailable');
      return jsonResponse({ error: 'ただいま処理を実行できません。時間をおいて再度お試しください。' }, 503);
    }
    return serverErrorResponse(error, 'admin-backfill-participant-hash');
  }
}));
