// qr_token.ts — 当日受付QRの署名付きペイロード（V7）。
//
// 背景: 従来の QR は素の entry UUID を埋め込んでいた。UUID は公開エントリーリストから取得可能で、
//   誰でも他人の QR を生成して受付を通せた（なりすまし受付）。また有効期限が無く使い回しできた。
//
// 形式: `<entryId>.<expMs>.<sig>`
//   sig = HMAC-SHA256(signingSecret, `qr:<entryId>:<expMs>`)
//   - 署名鍵は V1 で必須化済みの CIQ_EMAIL_SIGNING_SECRET（未設定なら SigningConfigError → 上位で 503）。
//   - exp を含めるため、漏洩した QR の有効期間が有限になる。
//   - QR 画像は表示のたびにサーバ側で生成されるため、鍵ローテーションや期限切れは再表示で解決する。
//
// 互換性: 旧 QR（素の UUID）は verifyQrToken() が null を返す＝受付側で拒否する（fail-closed）。
//   運用のフォールバックとして受付 UI に「受付番号で受付」を用意している。

import { hmacHex, safeEqual, signingSecret } from './signing.ts';

// 既定の有効期間。大会当日までの余裕を見て長め（400日）に取る。
// 「無期限の使い回し」を避けることが目的で、短期失効を狙うものではない。
const DEFAULT_TTL_MS = 400 * 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function payload(entryId: string, expMs: number) {
  return `qr:${entryId}:${expMs}`;
}

/** 署名付きQRトークンを発行する。entryId は UUID 形式であること。 */
export async function issueQrToken(entryId: string, ttlMs = DEFAULT_TTL_MS): Promise<string> {
  const id = String(entryId || '').trim();
  if (!UUID_RE.test(id)) throw new Error('issueQrToken: entryId must be a UUID');
  const expMs = Date.now() + ttlMs;
  const sig = await hmacHex(signingSecret(), payload(id, expMs));
  return `${id}.${expMs}.${sig}`;
}

/**
 * QRトークンを検証して entryId を返す。無効・改ざん・期限切れ・旧形式(素のUUID)は null。
 * 署名鍵未設定時は SigningConfigError を送出する（呼び出し側で 503 にマップする）。
 */
export async function verifyQrToken(raw: unknown): Promise<string | null> {
  if (typeof raw !== 'string') return null;
  const parts = raw.trim().split('.');
  if (parts.length !== 3) return null;   // 旧形式(素のUUID)はここで弾かれる
  const [id, expRaw, sig] = parts;
  if (!UUID_RE.test(id)) return null;
  const expMs = Number(expRaw);
  if (!Number.isFinite(expMs) || expMs <= 0) return null;
  if (Date.now() > expMs) return null;   // 期限切れ
  const expected = await hmacHex(signingSecret(), payload(id, expMs));
  if (!safeEqual(expected, sig)) return null;
  return id;
}
