// promotion_notice.ts — キャンセル待ちから繰り上がった人への通知メールを、サーバーが自動で送る。
//
// 流れ: waitlist_promotion_notice = 'pending' の人を 1 件ずつ「送信中」に取り（取れたものだけ処理）、
// プロジェクトの秘密鍵で宛先を復号して送り、'sent' または 'failed' にする。
// 復号した個人情報はこの関数のメモリにだけ置く。ログに出さない・保存しない。
// メールの文面と送信は呼び出し側（send-email）が渡す send で行う。

import { createServiceClient } from './supabase.ts';
import { unwrapPrivateKey } from './project_key.ts';
import { decryptPii } from './pii_decrypt.ts';

type Supabase = ReturnType<typeof createServiceClient>;

export type PromotionSend = (args: {
  projectId: string;
  entryId: string;
  entryNumber: number;
  email: string;
  familyName: string;
  firstName: string;
}) => Promise<void>;

export type PromotionResult = { sent: number; failed: number; skipped: number };

// 「送信中」のまま 10 分以上たったものは、途中で止まったとみなして取り直す。
const STALE_SENDING_MS = 10 * 60 * 1000;
const BATCH_LIMIT = 50;

export async function processPromotionNotices(
  supabase: Supabase,
  options: { projectId?: string; send: PromotionSend },
): Promise<PromotionResult> {
  const result: PromotionResult = { sent: 0, failed: 0, skipped: 0 };

  const staleBefore = new Date(Date.now() - STALE_SENDING_MS).toISOString();
  let reclaim = supabase
    .from('entries')
    .update({ waitlist_promotion_notice: 'pending' })
    .eq('waitlist_promotion_notice', 'sending')
    .lt('updated_at', staleBefore);
  if (options.projectId) reclaim = reclaim.eq('project_id', options.projectId);
  await reclaim;

  let query = supabase
    .from('entries')
    .select('id, project_id, entry_number, status, encrypted_pii')
    .eq('waitlist_promotion_notice', 'pending')
    .in('status', ['registered', 'late'])
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);
  if (options.projectId) query = query.eq('project_id', options.projectId);
  const { data: rows, error } = await query;
  if (error) throw error;

  const keys = new Map<string, JsonWebKey | null>();
  async function keyFor(projectId: string): Promise<JsonWebKey | null> {
    if (keys.has(projectId)) return keys.get(projectId) ?? null;
    let key: JsonWebKey | null = null;
    const { data } = await supabase
      .from('project_private_keys')
      .select('encrypted_private_key')
      .eq('project_id', projectId)
      .maybeSingle();
    if (data?.encrypted_private_key) {
      try {
        key = await unwrapPrivateKey(data.encrypted_private_key);
      } catch {
        key = null;
      }
    }
    keys.set(projectId, key);
    return key;
  }

  async function setState(id: string, state: 'sent' | 'failed') {
    await supabase.from('entries').update({ waitlist_promotion_notice: state }).eq('id', id);
  }

  for (const row of rows || []) {
    // 同時に走る別の処理と取り合わないよう、「送信待ち」から「送信中」にできたものだけを処理する。
    const { data: claimed } = await supabase
      .from('entries')
      .update({ waitlist_promotion_notice: 'sending' })
      .eq('id', row.id)
      .eq('waitlist_promotion_notice', 'pending')
      .select('id');
    if (!claimed || claimed.length === 0) {
      result.skipped += 1;
      continue;
    }

    try {
      const key = await keyFor(String(row.project_id));
      if (!key || !row.encrypted_pii) throw new Error('no key or pii');
      const pii = await decryptPii(String(row.encrypted_pii), key);
      const email = String(pii.email || '').trim();
      if (!email) throw new Error('no email');
      await options.send({
        projectId: String(row.project_id),
        entryId: String(row.id),
        entryNumber: Number(row.entry_number),
        email,
        familyName: String(pii.familyName || ''),
        firstName: String(pii.firstName || ''),
      });
      await setState(String(row.id), 'sent');
      result.sent += 1;
    } catch (error) {
      // 宛先・氏名は error に入りうるので、種類だけを残す。
      console.error(`[promotion-notice] failed for entry ${row.id}: ${error instanceof Error ? error.name : 'error'}`);
      await setState(String(row.id), 'failed');
      result.failed += 1;
    }
  }
  return result;
}

/**
 * 繰り上がりが起きたかもしれない処理の直後に呼ぶ。送信処理は send-email が行う。
 * CIQ_CRON_SECRET が未設定なら何もしない（定期実行と管理画面が拾う）。失敗しても呼び出し元を止めない。
 */
export function triggerPromotionNotices(projectId: string): void {
  const secret = Deno.env.get('CIQ_CRON_SECRET');
  const base = Deno.env.get('SUPABASE_URL');
  if (!secret || !base || !projectId) return;
  const task = fetch(`${base.replace(/\/$/, '')}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ciq-cron-secret': secret },
    body: JSON.stringify({ type: 'process_promotions', projectId }),
  }).then(() => undefined, () => undefined);
  // 応答を待たせない。実行環境が終了を待てるなら待たせる。
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  runtime?.waitUntil?.(task);
}
