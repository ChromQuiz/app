// participant_auth.ts — 参加者(エントリー本人)向けの共通認証
//
// 2つの認証経路を提供する:
//   1. credentials: emailHash + disclosurePasswordHash の照合(従来方式)
//   2. token:       my-entry が発行する短命署名トークン(sessionStorage 保持前提)
//
// トークン形式: base64url(JSON payload) + '.' + hmacHex(payload)
//   payload = { p: projectId, e: entryId, h: emailHash, x: expiresAtMs }
// パスワード(平文/ハッシュ)はトークンに含めない。

import { createServiceClient } from './supabase.ts';

const encoder = new TextEncoder();

export const PARTICIPANT_TOKEN_TTL_MS = 30 * 60 * 1000; // 30分(操作ごとにスライド延長)

export function signingSecret() {
  return Deno.env.get('CIQ_EMAIL_SIGNING_SECRET')
    || Deno.env.get('CIQ_EDGE_INTERNAL_SECRET')
    || Deno.env.get('SUPABASE_URL')
    || 'ciq-local-email-signing-secret';
}

export async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function b64urlEncode(value: string) {
  return btoa(String.fromCharCode(...encoder.encode(value)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function b64urlDecode(value: string) {
  const b64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export type ParticipantTokenPayload = {
  p: string; // projectId
  e: string; // entryId
  h: string; // emailHash
  x: number; // expiresAt (ms)
};

export async function issueParticipantToken(
  data: { projectId: string; entryId: string; emailHash: string },
  ttlMs = PARTICIPANT_TOKEN_TTL_MS,
) {
  const payload: ParticipantTokenPayload = {
    p: data.projectId,
    e: data.entryId,
    h: data.emailHash,
    x: Date.now() + ttlMs,
  };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await hmacHex(signingSecret(), body);
  return { token: `${body}.${sig}`, expiresAt: payload.x };
}

export async function verifyParticipantToken(token: string, projectId: string) {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacHex(signingSecret(), body);
  if (!safeEqual(expected, sig)) return null;
  let payload: ParticipantTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body));
  } catch {
    return null;
  }
  if (!payload || payload.p !== projectId) return null;
  if (!payload.e || !payload.h) return null;
  if (!Number.isFinite(payload.x) || Date.now() > payload.x) return null;
  return payload;
}

/**
 * 当日受付QRの署名付き画像URL(checkin-qr)を生成する。
 * メール(send-email)と同一のデータ・同一の署名鍵を使うため、
 * my.html で表示したQRは受付側でそのまま読み取れる。
 */
export async function signedQrUrl(value: string) {
  if (!value) return '';
  const signature = await hmacHex(signingSecret(), value);
  const baseUrl = Deno.env.get('SUPABASE_URL') || '';
  if (!baseUrl) return '';
  const url = new URL('/functions/v1/checkin-qr', baseUrl);
  url.searchParams.set('d', value);
  url.searchParams.set('s', signature);
  return url.href;
}

export type ParticipantAuthResult = {
  entry: Record<string, unknown>;
  emailHash: string;
  viaToken: boolean;
};

export class ParticipantAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * 認証試行のレート制限。emailHash単位で10分間の失敗回数を制限する。
 * (participant_auth_events テーブル / service role 専用)
 */
export async function enforceAuthRateLimit(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string,
  emailHash: string,
  limit = 10,
) {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('participant_auth_events')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('email_hash', emailHash)
    .eq('success', false)
    .gte('created_at', since);
  if (error) throw error;
  if ((count || 0) >= limit) {
    throw new ParticipantAuthError('試行回数が上限に達しました。しばらく待ってからお試しください。', 429);
  }
}

export async function recordAuthAttempt(
  supabase: ReturnType<typeof createServiceClient>,
  projectId: string,
  emailHash: string,
  success: boolean,
) {
  await supabase
    .from('participant_auth_events')
    .insert({ project_id: projectId, email_hash: emailHash, success })
    .then(() => undefined, () => undefined); // 記録失敗は本処理を止めない
}

/**
 * リクエストボディから参加者認証を解決する。
 * - body.token があればトークン検証(entry を id + email_hash で引く)
 * - なければ emailHash + disclosurePasswordHash 照合(レート制限つき)
 * 返す entry には select で指定した列が含まれる。
 */
export async function resolveParticipantAuth(
  supabase: ReturnType<typeof createServiceClient>,
  body: { projectId?: string; token?: string; emailHash?: string; disclosurePasswordHash?: string },
  select: string,
): Promise<ParticipantAuthResult> {
  const projectId = String(body.projectId || '');
  if (!projectId) throw new ParticipantAuthError('Missing required fields', 400);

  const columns = select.includes('email_hash') ? select : `${select}, email_hash`;

  if (body.token) {
    const payload = await verifyParticipantToken(String(body.token), projectId);
    if (!payload) throw new ParticipantAuthError('セッションの有効期限が切れました。もう一度ログインしてください。', 401);
    const { data: entry, error } = await supabase
      .from('entries')
      .select(columns)
      .eq('project_id', projectId)
      .eq('id', payload.e)
      .eq('email_hash', payload.h)
      .single();
    if (error || !entry) throw new ParticipantAuthError('エントリーが見つかりません。', 404);
    return { entry, emailHash: payload.h, viaToken: true };
  }

  const emailHash = String(body.emailHash || '');
  const passwordHash = String(body.disclosurePasswordHash || '');
  if (!emailHash || !passwordHash) throw new ParticipantAuthError('Missing required fields', 400);

  await enforceAuthRateLimit(supabase, projectId, emailHash);

  const { data: entry, error } = await supabase
    .from('entries')
    .select(columns)
    .eq('project_id', projectId)
    .eq('email_hash', emailHash)
    .eq('disclosure_password_hash', passwordHash)
    .single();

  if (error || !entry) {
    await recordAuthAttempt(supabase, projectId, emailHash, false);
    throw new ParticipantAuthError('メールアドレスまたはパスワードが正しくありません。', 404);
  }
  await recordAuthAttempt(supabase, projectId, emailHash, true);
  return { entry, emailHash, viaToken: false };
}
