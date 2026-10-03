// qr_token.ts — 当日受付二次元コードの署名付きペイロード（V7）。
//
// 背景: 従来の 二次元コード は素の entry UUID を埋め込んでいた。UUID は公開エントリーリストから取得可能で、
//   誰でも他人の 二次元コード を生成して受付を通せた（なりすまし受付）。
//
// 形式（現行）: `<entryId>.<sig>`
//   sig = HMAC-SHA256(signingSecret, `qr3:<entryId>`) の先頭 32 文字（16 進 = 128 bit）
//   - 署名鍵は V1 で必須化済みの CIQ_EMAIL_SIGNING_SECRET（未設定なら SigningConfigError → 上位で 503）。
//   - 128 bit に切るのは 二次元コード を粗く（読み取りやすく）するため。HMAC の出力長の半分は一般に十分とされ、
//     総当たりは受付側の失敗照会レート制限（checkin_miss）でも抑えられる。
//
// 有効期限は持たない。理由:
//   - エントリーから大会当日まで 1 か月以上空くため、期限を付けると当日に使えない 二次元コード が出る。
//   - 他の大会では使えない: entryId は UUID で全体一意、受付は `project_id` で絞って照合する（check-in）。
//   - 受付済みの 二次元コード は再利用できない: 受付は条件付き UPDATE で原子的に拒否される。
//   - 非常時は CIQ_EMAIL_SIGNING_SECRET を更新すれば、発行済みの全 二次元コード が即時失効する。
//   - 流出した 二次元コード で受付できるのは、その大会の間の 1 回だけで、受付画面の氏名と受付番号の目視確認が残る。
//
// 旧形式（期限つき）: `<entryId>.<expMs>.<sig64>`（署名対象 `qr1:<entryId>:<expMs>`）も、
//   発行済みの 二次元コード を壊さないよう検証だけは受け付ける。期限は従来どおり守る。
//   新規発行は現行形式のみ。
//
// 大文字小文字: 画像には大文字で埋め込み（英数字モードで粗くできる）、検証は小文字に揃えて行う。
//
// 互換性: 素の UUID（最初期の 二次元コード）は null を返す＝受付側で拒否する（fail-closed）。
//   運用のフォールバックとして運営専用の「受付番号で受付」を用意している。

import { hmacHex, safeEqual, signingSecret } from './signing.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^[0-9a-f]+$/;

// 署名対象。用途タグ + バージョンを含めることで、
//  (a) 他用途の署名（参加者トークン=base64url JSON / 受付二次元コード URL=素のUUID / 認証コード）と衝突しない
//  (b) 将来フォーマットを変える際に旧トークンを一括失効できる
const TOKEN_VERSION = 'qr3';
const LEGACY_TOKEN_VERSION = 'qr1';
const SIG_HEX_LENGTH = 32;
const LEGACY_SIG_HEX_LENGTH = 64;

function payload(entryId: string) {
  return `${TOKEN_VERSION}:${entryId}`;
}

function legacyPayload(entryId: string, expMs: number) {
  return `${LEGACY_TOKEN_VERSION}:${entryId}:${expMs}`;
}

/** 署名付き二次元コードトークンを発行する。entryId は UUID 形式であること。 */
export async function issueQrToken(entryId: string): Promise<string> {
  const id = String(entryId || '').trim().toLowerCase();
  if (!UUID_RE.test(id)) throw new Error('issueQrToken: entryId must be a UUID');
  const sig = (await hmacHex(signingSecret(), payload(id))).slice(0, SIG_HEX_LENGTH);
  return `${id}.${sig}`;
}

/**
 * 二次元コードトークンを検証して entryId を返す。無効・改ざん・（旧形式の）期限切れ・素のUUIDは null。
 * 署名鍵未設定時は SigningConfigError を送出する（呼び出し側で 503 にマップする）。
 */
export async function verifyQrToken(raw: unknown): Promise<string | null> {
  if (typeof raw !== 'string') return null;
  const parts = raw.trim().toLowerCase().split('.');   // 画像は大文字、署名は小文字で計算する

  if (parts.length === 2) {
    const [id, sig] = parts;
    if (!UUID_RE.test(id)) return null;
    if (sig.length !== SIG_HEX_LENGTH || !HEX_RE.test(sig)) return null;
    const expected = (await hmacHex(signingSecret(), payload(id))).slice(0, SIG_HEX_LENGTH);
    return safeEqual(expected, sig) ? id : null;
  }

  if (parts.length === 3) {   // 旧形式（期限つき）。発行済みの 二次元コード のため受け付ける
    const [id, expRaw, sig] = parts;
    if (!UUID_RE.test(id)) return null;
    if (sig.length !== LEGACY_SIG_HEX_LENGTH || !HEX_RE.test(sig)) return null;
    const expMs = Number(expRaw);
    if (!Number.isFinite(expMs) || expMs <= 0) return null;
    if (Date.now() > expMs) return null;   // 期限切れ
    const expected = await hmacHex(signingSecret(), legacyPayload(id, expMs));
    return safeEqual(expected, sig) ? id : null;
  }

  return null;   // 素の UUID など
}
