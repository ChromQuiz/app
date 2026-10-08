// entry_profile.ts — エントリーの入力の長さの検証（登録・編集・代理登録で共通）。
//
// 公開される項目（エントリーネーム・所属・学年・意気込み）が際限なく長いと、エントリーリストが崩れたり、
// 悪意のある送信で保存領域を使い切られたりする。個人情報（暗号化済み）は中身を見られないので、全体の大きさで制限する。
// 数え方は文字（コードポイント）。画面の maxlength と同じ値にする（js は entry.html / my.html の属性）。

export const ENTRY_LIMITS = {
  entryName: 20,
  affiliation: 20,
  grade: 10,
  message: 100,
  inquiry: 100,
  // 暗号化前の最大: メール254 + 姓名計60 + カナ計80 + 所属20 + エントリーネーム20 + 意気込み100 + 運営への連絡100 ほか。
  // 日本語は1文字3バイト、暗号化と base64 で約 1.4 倍になっても 8000 文字には届かない。
  encryptedPii: 8000,
} as const;

const LABELS: Record<string, string> = {
  entryName: 'エントリーネーム',
  affiliation: '所属教育機関',
  grade: '学年',
  message: '意気込み',
  inquiry: '運営への連絡',
};

function length(value: unknown): number {
  return typeof value === 'string' ? [...value].length : 0;
}

/** 問題があれば利用者向けの日本語の文を返す。なければ null。 */
export function validateEntryInput(
  publicProfile: Record<string, unknown> | null | undefined,
  encryptedPii: unknown,
): string | null {
  if (typeof encryptedPii === 'string' && encryptedPii.length > ENTRY_LIMITS.encryptedPii) {
    return '入力内容が大きすぎます。文字数を減らして、もう一度お試しください。';
  }
  const profile = publicProfile || {};
  for (const key of ['entryName', 'affiliation', 'grade', 'message', 'inquiry'] as const) {
    const value = profile[key];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return '入力内容の形式が正しくありません。ページを読み込み直して、もう一度お試しください。';
    }
    if (length(value) > ENTRY_LIMITS[key]) {
      return `${LABELS[key]}は${ENTRY_LIMITS[key]}文字以内で入力してください。`;
    }
  }
  return null;
}
