// rate_limit.ts — IP単位レート制限(fail-open)の共通モジュール
//
// 方針:
//  - fail-open: 自身のDB障害・ハッシュ化失敗・insert失敗はすべて握りつぶして通過。
//    「上限超過」のときだけ RateLimitError(429) を投げる。
//  - 生IPは保存しない。scope_key = HMAC(pepper, ip) のみを rate_limit_events に記録する。
//  - IPが取れない(unknown)ときは制限をスキップ(多数が同一scope_keyを共有して
//    相互ブロックするのを防ぐ)。
//
// 既存の recipient_hash / email_hash 軸の制限とは独立した「IP軸」を追加する。

import { createServiceClient } from './supabase.ts';
import { hmacHex, signingSecret } from './signing.ts';

export class RateLimitError extends Error {
  status: number;
  constructor(message = 'リクエストが多すぎます。しばらく待ってから再度お試しください。') {
    super(message);
    this.name = 'RateLimitError';
    this.status = 429;
  }
}

/** x-forwarded-for の先頭ホップを実クライアントIPとして採用。取れなければ 'unknown'。 */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0].trim();
  return first || req.headers.get('cf-connecting-ip') || 'unknown';
}

/** IPハッシュ用のpepper。専用値が無ければ(V1で必須化済みの)署名鍵を流用する。 */
function ratePepper(): string {
  return Deno.env.get('CIQ_RATE_LIMIT_PEPPER') || signingSecret();
}

/**
 * 実クライアントIPを HMAC 化して返す(監査ログ用)。生IPは保存も返却もしない。
 * IP不明・pepper導出失敗時は '' を返す(記録は継続=fail-open)。
 */
export async function clientIpHash(req: Request): Promise<string> {
  const ip = clientIp(req);
  if (!ip || ip === 'unknown') return '';
  try {
    return await hmacHex(ratePepper(), ip);
  } catch {
    return '';
  }
}

/** env上書き対応の正の整数取得。未設定・不正なら既定値。 */
function intEnv(name: string, fallback: number): number {
  const v = Number(Deno.env.get(name));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

// 既定閾値(env で上書き可)。window は分単位。
export const RATE_LIMITS = {
  send_verification: { limit: () => intEnv('CIQ_RL_SEND_VERIFICATION_IP', 5), windowMs: 10 * 60 * 1000 },
  create_entry: { limit: () => intEnv('CIQ_RL_CREATE_ENTRY_IP', 10), windowMs: 60 * 60 * 1000 },
  participant_auth: { limit: () => intEnv('CIQ_RL_PARTICIPANT_AUTH_IP', 20), windowMs: 10 * 60 * 1000 },
} as const;

type Bucket = keyof typeof RATE_LIMITS;

/**
 * IP単位のレート制限を適用する。
 * 上限超過時のみ RateLimitError を投げる。それ以外(障害含む)は fail-open で通過。
 */
export async function enforceIpRateLimit(
  supabase: ReturnType<typeof createServiceClient>,
  opts: { bucket: Bucket; ip: string; projectId?: string | null },
): Promise<void> {
  const ip = opts.ip;
  if (!ip || ip === 'unknown') return; // IP不明時はスキップ(fail-open)

  let scopeKey: string;
  try {
    scopeKey = await hmacHex(ratePepper(), ip);
  } catch {
    return; // pepper導出/ハッシュ失敗 → fail-open
  }

  const conf = RATE_LIMITS[opts.bucket];
  const limit = conf.limit();

  // カウント判定と記録を1つのアトミック RPC(pg_advisory_xact_lock で直列化)で行う。
  // 「select count → insert」の2段だと並列バーストが insert 前に count<limit を読んで上限を突破するため、
  // 直前までの窓内件数(このヒットを含まない)を RPC から受け取り、limit 到達で 429 を投げる。
  // RPC 障害(error/例外)は握りつぶして通過(fail-open)。
  let priorCount: number;
  try {
    const { data, error } = await supabase.rpc('rate_limit_hit', {
      p_bucket: opts.bucket,
      p_scope_key: scopeKey,
      p_window_seconds: Math.floor(conf.windowMs / 1000),
      p_limit: limit,
      p_project_id: opts.projectId ?? null,
    });
    if (error) return; // RPC 失敗 → fail-open
    priorCount = Number(data) || 0;
  } catch {
    return; // 例外 → fail-open
  }

  if (priorCount >= limit) {
    throw new RateLimitError();
  }
}

/**
 * プロジェクト単位の日次メール送信上限(V2 の backstop)。
 * IP を横断した分散的なメール爆撃・無料枠枯渇を抑える。scope_key は project_id(機密でない)。
 * 既定 500通/日(CIQ_EMAIL_DAILY_CAP で上書き可)。RPC は並列安全(advisory lock)。障害時は fail-open。
 */
export async function enforceProjectDailyEmailCap(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string | null,
): Promise<void> {
  if (!projectId) return;
  const cap = intEnv('CIQ_EMAIL_DAILY_CAP', 500);
  let priorCount: number;
  try {
    const { data, error } = await supabase.rpc('rate_limit_hit', {
      p_bucket: 'email_daily',
      p_scope_key: `project:${projectId}`,
      p_window_seconds: 24 * 60 * 60,
      p_limit: cap,
      p_project_id: projectId,
    });
    if (error) return; // fail-open
    priorCount = Number(data) || 0;
  } catch {
    return; // fail-open
  }
  if (priorCount >= cap) {
    throw new RateLimitError('本日のメール送信上限に達しました。しばらくしてから再度お試しください。');
  }
}
