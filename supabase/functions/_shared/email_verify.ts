// email_verify.ts — メール認証済みトークン(ステートレス)
//
// verify_code 成功時に、サーバ側で正規化・ハッシュ化した emailHash と projectId に
// 束ねた短命署名トークンを発行し、create-entry が必須検証する。
// 署名は既存の CIQ_EMAIL_SIGNING_SECRET(signing.ts)を再利用。秘密はブラウザに出さない。
//
// トークン形式: base64url(JSON payload) + '.' + hmacHex(payload)
//   payload = { v, p: projectId, eh: emailHash(server算出), iat, exp, jti }
// jti は将来のワンタイム化(P2-d2)用に含めるだけで、今回はDB消費管理しない。

import { hmacHex, safeEqual, signingSecret } from './signing.ts';

const encoder = new TextEncoder();

export const EMAIL_VERIFIED_TOKEN_VERSION = 'ev1';
export const EMAIL_VERIFIED_TTL_MS = 30 * 60 * 1000; // 30分
// 発行者と検証者のクロックスキュー許容(未来すぎる iat を弾く上限)。
export const EMAIL_VERIFIED_CLOCK_SKEW_MS = 5 * 60 * 1000; // 5分

/** メール正規化。フロントの値に依存せず、常にサーバ側で trim + toLowerCase する。 */
export function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/** 正規化済みメールから SHA-256(hex) を生成(create-entry の emailHash と同一計算)。 */
export async function emailHashFromNormalized(normalizedEmail: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(normalizedEmail));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64urlEncode(value: string): string {
  return btoa(String.fromCharCode(...encoder.encode(value)))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function b64urlDecode(value: string): string {
  const b64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
}

export type EmailVerifiedPayload = {
  v: string;    // トークン種別・バージョン
  p: string;    // projectId
  eh: string;   // サーバ側で正規化メールから生成した emailHash
  iat: number;  // 発行日時(ms)
  exp: number;  // 有効期限(ms)
  jti: string;  // ランダム識別子(将来のワンタイム化用)
};

/**
 * メール認証済みトークンを発行する。
 * emailHash はサーバ側で正規化メールから生成し、フロントの値には依存しない。
 */
export async function issueEmailVerifiedToken(
  projectId: string,
  normalizedEmail: string,
  ttlMs = EMAIL_VERIFIED_TTL_MS,
): Promise<{ token: string; expiresAt: number }> {
  if (typeof projectId !== 'string' || !projectId.trim()) {
    throw new Error('issueEmailVerifiedToken: projectId is required');
  }
  if (typeof normalizedEmail !== 'string' || !normalizedEmail) {
    throw new Error('issueEmailVerifiedToken: normalizedEmail is required');
  }
  const now = Date.now();
  const payload: EmailVerifiedPayload = {
    v: EMAIL_VERIFIED_TOKEN_VERSION,
    p: projectId,
    eh: await emailHashFromNormalized(normalizedEmail),
    iat: now,
    exp: now + ttlMs,
    jti: crypto.randomUUID(),
  };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacHex(signingSecret(), body);
  return { token: `${body}.${sig}`, expiresAt: payload.exp };
}

export type EmailVerifiedResult =
  | { ok: true; payload: EmailVerifiedPayload }
  | { ok: false; reason: string };

/**
 * トークンを検証する。署名・バージョン・projectId・emailHash・有効期限をサーバ側で確認。
 * 失敗理由(reason)は呼び出し側がサーバログにのみ記録する(メール/トークン/ハッシュは出さない)。
 */
export async function verifyEmailVerifiedToken(
  token: string,
  projectId: string,
  expectedEmailHash: string,
): Promise<EmailVerifiedResult> {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'missing' };
  if (typeof projectId !== 'string' || !projectId) return { ok: false, reason: 'no_project' };
  if (typeof expectedEmailHash !== 'string' || !expectedEmailHash) return { ok: false, reason: 'no_email_hash' };

  const dot = token.lastIndexOf('.');
  if (dot <= 0) return { ok: false, reason: 'malformed' };
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = await hmacHex(signingSecret(), body);
  if (expected.length !== sig.length || !safeEqual(expected, sig)) return { ok: false, reason: 'bad_signature' };

  let payload: EmailVerifiedPayload;
  try {
    payload = JSON.parse(b64urlDecode(body));
  } catch {
    return { ok: false, reason: 'malformed_payload' };
  }
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'malformed_payload' };

  // フィールド型の厳密検証
  if (typeof payload.v !== 'string' || payload.v !== EMAIL_VERIFIED_TOKEN_VERSION) return { ok: false, reason: 'version' };
  if (typeof payload.jti !== 'string' || !payload.jti) return { ok: false, reason: 'bad_jti' };
  if (typeof payload.iat !== 'number' || !Number.isFinite(payload.iat)) return { ok: false, reason: 'bad_iat' };
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return { ok: false, reason: 'bad_exp' };

  // 束縛の検証(projectId / emailHash)
  if (typeof payload.p !== 'string' || payload.p !== projectId) return { ok: false, reason: 'project_mismatch' };
  if (typeof payload.eh !== 'string' || payload.eh.length !== expectedEmailHash.length
      || !safeEqual(payload.eh, expectedEmailHash)) {
    return { ok: false, reason: 'email_mismatch' };
  }

  // 時刻の妥当性
  const now = Date.now();
  if (payload.exp <= payload.iat) return { ok: false, reason: 'bad_window' };
  if (payload.iat > now + EMAIL_VERIFIED_CLOCK_SKEW_MS) return { ok: false, reason: 'future_iat' };
  if (now > payload.exp) return { ok: false, reason: 'expired' };

  return { ok: true, payload };
}

/**
 * メール認証必須化のロールアウトフラグ。
 * CIQ_REQUIRE_EMAIL_VERIFICATION が明示的に 'false' のときだけ無効化。
 * 未設定・空・'true' は有効(既定)。緊急時の一時ロールバック用途。
 */
export function emailVerificationRequired(): boolean {
  const raw = String(Deno.env.get('CIQ_REQUIRE_EMAIL_VERIFICATION') ?? '').trim().toLowerCase();
  return raw !== 'false';
}
