// audit.ts — service_role 経路(Edge Functions)の監査ログ記録ラッパ。
//
// 方針:
//  - fail-open: 記録失敗は本処理を止めない(例外を投げない・握りつぶす)。
//  - PII を保存しない: target_id は entry.id(UUID)のみ。after_data は状態遷移のみ。
//    氏名・メール・email_hash・password_hash・encrypted_pii・受付番号などは渡さない。
//  - 生IPは保存しない: actor_ip_hash は clientIpHash() で HMAC 化済みの値のみ。

import { createServiceClient } from './supabase.ts';

export type ActorKind = 'participant' | 'staff' | 'system';

export type ServiceAuditEvent = {
  projectId: string;
  action: string;
  targetId?: string | null;
  actorKind?: ActorKind;
  actorIpHash?: string | null;
  actorUserId?: string | null;
  actorMemberId?: string | null;
  // 状態遷移のみ(例 { status: 'canceled' })。PII を含めてはならない。
  afterData?: Record<string, unknown> | null;
};

/**
 * 監査イベントを記録する。失敗しても呼び出し元の本処理は止めない(fail-open)。
 */
export async function logServiceEvent(
  supabase: ReturnType<typeof createServiceClient>,
  event: ServiceAuditEvent,
): Promise<void> {
  try {
    await supabase.rpc('log_service_event', {
      p_project_id: event.projectId,
      p_action: event.action,
      p_target_id: event.targetId ?? null,
      p_actor_kind: event.actorKind ?? 'system',
      p_actor_ip_hash: event.actorIpHash || null,
      p_actor_user_id: event.actorUserId ?? null,
      p_actor_member_id: event.actorMemberId ?? null,
      p_after_data: event.afterData ?? null,
    }).then(() => undefined, () => undefined); // 記録失敗は本処理を止めない
  } catch {
    // ネットワーク等の同期例外も握りつぶす(fail-open)
  }
}
