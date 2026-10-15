// qr_token.ts — 当日受付二次元コードの値（V8）。
//
// 背景: 従来の二次元コードは `<entryId>.<署名>`（69 文字・version 3・29×29）で、前半は公開エントリーリストから取れる UUID だった。
//   今は、エントリーIDとは無関係な 20 文字のコードを埋め込み、サーバーはそのハッシュで受付の相手を引く。
//
// 形式: base32（A-Z と 2-7）20 文字 = 100 bit。
//   code = base32( HMAC-SHA256(signingSecret, `qr4:<entryId>:<rotation>`) の先頭 100 bit )
//   - 英数字モードで符号化できる文字だけを使う。20 文字は version 1（21×21）・誤り訂正 M の上限ちょうど。
//   - 署名鍵は V1 で必須化済みの CIQ_EMAIL_SIGNING_SECRET（未設定なら SigningConfigError → 上位で 503）。
//
// 保存: DB には sha256(code) だけを持つ（entries.checkin_token_hash）。コードは、表示のたびにここで作り直す。
//   コードを表示した人の画面から、ハッシュを DB に書き込む（ensureCheckinCode）。同じ値なら何も変えない。
//   - DB が漏れても、ハッシュからコードは作れない。署名鍵とエントリーIDが要る。
//   - 受付は DB の照会だけで済み、署名鍵に依存しない（鍵が未設定でも受付は止まらない）。
//
// 有効期限は持たない。理由:
//   - エントリーから大会当日まで 1 か月以上空くため、期限を付けると当日に使えない二次元コードが出る。
//   - 他の大会では使えない: 受付は `project_id` と ハッシュで絞って照合する（check-in）。
//   - 受付済みの二次元コードは再利用できない: 受付は条件付き UPDATE で原子的に拒否される。
//   - 非常時は CIQ_EMAIL_SIGNING_SECRET を更新すれば、新しいコードが表示のたびにハッシュを置き換え、発行済みのコードは失効する。
//   - 1 人分だけ失効させたいときは entries.checkin_token_rotation を 1 上げる（次の表示から新しいコードになる）。
//   - 流出した二次元コードで受付できるのは、その大会の間の 1 回だけ。受付画面には受付番号・所属・学年が出る（氏名は出ない）ので、本人との照合はそれで行う。
//
// 総当たり: 失敗した照会（コードが DB に無い）は check-in の checkin_miss（IP 単位）で制限される。100 bit は、その前提で十分に大きい。
//
// 大文字小文字: 画像には大文字で埋め込み、読み取り側で小文字になっても大文字に揃えて扱う。
//
// 互換性: 旧形式（`<entryId>.<署名>`・期限つき・素の UUID）は受け付けない。形が違うだけで、受付側が弾く（fail-closed）。
//   運営専用の「受付番号で受付」を、運用のフォールバックとして用意している。

import { hmacHex, signingSecret } from './signing.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^[A-Z2-7]{20}$/;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CODE_LENGTH = 20;
const CODE_HEX_LENGTH = 25;   // 25 桁の 16 進 = 100 bit = base32 の 20 文字

// 署名対象。用途タグ + バージョンを含めることで、
//  (a) 他用途の署名（参加者トークン / 受付二次元コード画像のURL / 認証コード）と衝突しない
//  (b) 将来フォーマットを変える際に旧コードを一括失効できる
const TOKEN_VERSION = 'qr4';
const HASH_PREFIX = 'ciq-checkin:';

const encoder = new TextEncoder();

type CheckinCodeStore = {
  from: (table: string) => any;
};

/** エントリーIDと rotation から、受付コード（20 文字・大文字）を作る。 */
export async function deriveCheckinCode(entryId: string, rotation = 0): Promise<string> {
  const id = String(entryId || '').trim().toLowerCase();
  if (!UUID_RE.test(id)) throw new Error('deriveCheckinCode: entryId must be a UUID');
  if (!Number.isInteger(rotation) || rotation < 0) throw new Error('deriveCheckinCode: rotation must be a non-negative integer');
  const hex = (await hmacHex(signingSecret(), `${TOKEN_VERSION}:${id}:${rotation}`)).slice(0, CODE_HEX_LENGTH);
  let bits = BigInt(`0x${hex}`);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out = BASE32[Number(bits & 31n)] + out;
    bits >>= 5n;
  }
  return out;
}

/**
 * 読み取った値を受付コードの形に整える。形が違えば null（旧形式・素の UUID・長さ違いなど）。
 * 署名鍵は要らない（形だけを見る）。
 */
export function normalizeCheckinCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

/** 受付コードの sha256（16 進 64 桁）。DB の checkin_token_hash と突き合わせる。 */
export async function hashCheckinCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${HASH_PREFIX}${code}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 受付コードを返し、DB のハッシュを今のコードに合わせる（違うときだけ書き込む）。
 * 二次元コードを表示する経路（my-entry / admin-entry-qr / checkin-qr）は、必ずこれを通す。
 * エントリーが無ければ null。
 */
export async function ensureCheckinCode(supabase: CheckinCodeStore, entryId: string): Promise<string | null> {
  const { data: entry, error } = await supabase
    .from('entries')
    .select('id, checkin_token_hash, checkin_token_rotation')
    .eq('id', entryId)
    .single();
  if (error || !entry) return null;

  const code = await deriveCheckinCode(String(entry.id), Number(entry.checkin_token_rotation) || 0);
  const hash = await hashCheckinCode(code);
  if (entry.checkin_token_hash !== hash) {
    const { error: updateError } = await supabase
      .from('entries')
      .update({ checkin_token_hash: hash })
      .eq('id', entry.id);
    if (updateError) throw updateError;
  }
  return code;
}
