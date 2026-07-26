// turnstile.ts — Cloudflare Turnstile のサーバ側検証(V2)。
//
// クライアントの成功状態は信用しない。必ず Siteverify API でサーバ検証する。
// 方針:
//  - 本番は原則 fail-closed: secret 未設定・検証失敗・タイムアウト・5xx はすべて拒否。
//  - 例外の緊急回避のみ CIQ_TURNSTILE_DISABLED=1 で一時バイパス(恒常運用は不可・運用文書参照)。
//  - secret はここ(env)だけで扱い、クライアント/コミットには出さない。
//  - action と hostname を検証し、token の未指定・失敗・期限切れ/重複(timeout-or-duplicate)を拒否する。

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5000;

/** 検証失敗(クライアント起因)。403。詳細はログのみ、利用者へは汎用文言。 */
export class TurnstileError extends Error {
  status: number;
  code: string;
  constructor(code: string) {
    super(`Turnstile verification failed: ${code}`);
    this.name = 'TurnstileError';
    this.code = code;
    this.status = 403;
  }
}

/** 設定不備(secret 未設定)。503。本番 fail-closed のため受付を止める。 */
export class TurnstileConfigError extends Error {
  status = 503;
  constructor() {
    super('Turnstile secret is not configured');
    this.name = 'TurnstileConfigError';
  }
}

/** 緊急バイパス(Cloudflare 障害時のみ・運用文書に手順)。恒常運用は不可。 */
export function turnstileDisabled(): boolean {
  return Deno.env.get('CIQ_TURNSTILE_DISABLED') === '1';
}

/** env の許可ホスト名一覧(カンマ区切り)。未設定なら空配列(=hostname 検証をスキップ、運用で必ず設定)。 */
export function expectedHostnames(): string[] {
  return (Deno.env.get('CIQ_TURNSTILE_HOSTNAMES') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

export type SiteverifyResult = {
  success?: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
  challenge_ts?: string;
};

/**
 * Siteverify のレスポンスを評価する純粋関数(ネットワーク/Deno 非依存 → Node で単体テスト可能)。
 * 不正なら TurnstileError を投げる。
 *  - success!==true → 失敗(期限切れ/重複 timeout-or-duplicate もここに含まれる)
 *  - expectedHostnames 指定時に hostname 不一致 → 失敗
 *  - action 指定時に action 不一致 → 失敗
 */
export function evaluateTurnstileResult(
  data: SiteverifyResult | null,
  opts: { action?: string; expectedHostnames?: string[] },
): void {
  if (!data || data.success !== true) {
    const codes = (data && data['error-codes']) || [];
    throw new TurnstileError(codes.length ? `verify:${codes.join(',')}` : 'verify:unsuccessful');
  }
  const hosts = opts.expectedHostnames || [];
  if (hosts.length > 0 && !hosts.includes(String(data.hostname))) {
    throw new TurnstileError('hostname_mismatch');
  }
  if (opts.action && String(data.action) !== opts.action) {
    throw new TurnstileError('action_mismatch');
  }
}

/**
 * Turnstile token をサーバ検証する。
 * - CIQ_TURNSTILE_DISABLED=1 → 緊急バイパス(検証せず通過・警告ログ)。
 * - TURNSTILE_SECRET_KEY 未設定 → TurnstileConfigError(fail-closed・503)。
 * - token 未指定 → TurnstileError('missing')。
 * - Siteverify タイムアウト/ネットワーク障害/5xx → TurnstileError('unavailable')(fail-closed)。
 * - それ以外は evaluateTurnstileResult に委譲。
 */
export async function verifyTurnstile(opts: {
  token: string | null | undefined;
  action: string;
  remoteip?: string | null;
}): Promise<void> {
  if (turnstileDisabled()) {
    console.warn('[turnstile] verification bypassed by CIQ_TURNSTILE_DISABLED (emergency).');
    return;
  }
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) throw new TurnstileConfigError();
  if (!opts.token) throw new TurnstileError('missing');

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', String(opts.token));
  if (opts.remoteip && opts.remoteip !== 'unknown') body.set('remoteip', opts.remoteip);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(SITEVERIFY_URL, { method: 'POST', body, signal: controller.signal });
  } catch (_e) {
    throw new TurnstileError('unavailable'); // タイムアウト/ネットワーク障害 → fail-closed
  } finally {
    clearTimeout(timer);
  }

  if (res.status >= 500) throw new TurnstileError('unavailable'); // Cloudflare 5xx → fail-closed
  if (!res.ok) throw new TurnstileError('http_' + res.status);

  const data = await res.json().catch(() => null) as SiteverifyResult | null;
  evaluateTurnstileResult(data, { action: opts.action, expectedHostnames: expectedHostnames() });
}
