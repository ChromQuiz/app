// participant_hash.ts — 参加者認証ハッシュの pepper 化(v2)共通モジュール
//
// entries.email_hash / disclosure_password_hash はクライアントの無塩 SHA-256。
// これに Edge 側で追加の HMAC pepper を適用した v2 形式:
//   v2 = HMAC-SHA256(CIQ_PARTICIPANT_HASH_PEPPER, clientHash)
// を保存・比較する段階移行のための土台。
//
// - pepper は署名鍵(CIQ_EMAIL_SIGNING_SECRET)やレート pepper(CIQ_RATE_LIMIT_PEPPER)とは別。
// - フォールバックは持たない。未設定/空/32文字未満なら ParticipantHashConfigError。
// - クライアントの v2 は信用しない。v2 は必ず Edge 側でこの関数から生成する。
// - Secret値・入力ハッシュ・生成した v2 はログへ出さない。
//
// この段階(P2-e1)では他の Edge Function から import しない(休眠モジュール)。

import { hmacHex } from './signing.ts';

const MIN_PEPPER_LENGTH = 32;

/** pepper 未設定・空・短すぎるときに投げる型付きエラー。 */
export class ParticipantHashConfigError extends Error {
  constructor() {
    super('Participant hash pepper is not configured');
    this.name = 'ParticipantHashConfigError';
  }
}

/**
 * 参加者ハッシュ用 pepper を返す。
 * CIQ_PARTICIPANT_HASH_PEPPER のみを供給元とし、他の Secret へはフォールバックしない。
 * 未設定・空・MIN_PEPPER_LENGTH 未満なら例外(安全側に停止)。
 */
export function participantPepper(): string {
  const pepper = Deno.env.get('CIQ_PARTICIPANT_HASH_PEPPER');
  if (!pepper || pepper.length < MIN_PEPPER_LENGTH) throw new ParticipantHashConfigError();
  return pepper;
}

/**
 * クライアント SHA-256(hex) から v2 = HMAC-SHA256(pepper, clientHash) を生成する。
 * clientHash は非空文字列であること。値はログに出さない。
 */
export async function pepperHash(clientHash: string): Promise<string> {
  if (typeof clientHash !== 'string' || clientHash.length === 0) {
    throw new Error('pepperHash: clientHash must be a non-empty string');
  }
  return hmacHex(participantPepper(), clientHash);
}
