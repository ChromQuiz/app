// ranking.ts — 成績の順位の付け方（成績照会 disclose-result が使う）。
//
// 順位: 点数が高い順。同点なら、「連続して正解した数」を、問題の順に現れる区切りごとに並べて、
// 先に違いが出たところで、長いほうを上にする。点数も連答もすべて同じなら同順位。
// 管理画面の結果（js/admin_stats.js）にも同じ規則があり、tests/ranking.test.mjs が両方を突き合わせる。

export type RankKey = { score: number; streaks: number[] };

/** 答え（1=正解 / 0=それ以外）の並びを、「正解が続いた数」の並びにする。最後の連続も数える。 */
export function streaksFromAnswers(answers: number[]): number[] {
  const streaks: number[] = [];
  let current = 0;
  for (const answer of answers) {
    if (answer === 1) {
      current += 1;
    } else {
      streaks.push(current);
      current = 0;
    }
  }
  streaks.push(current);
  return streaks;
}

/** 並べ替え用。負なら a が上位。 */
export function compareRank(a: RankKey, b: RankKey): number {
  if (b.score !== a.score) return b.score - a.score;
  const maxLen = Math.max(a.streaks.length, b.streaks.length);
  for (let i = 0; i < maxLen; i += 1) {
    const av = a.streaks[i] || 0;
    const bv = b.streaks[i] || 0;
    if (bv !== av) return bv - av;
  }
  return 0;
}

export function sameRankKey(a: RankKey, b: RankKey): boolean {
  return a.score === b.score && JSON.stringify(a.streaks) === JSON.stringify(b.streaks);
}

/** 並べ替え済みの配列に、同順位を考慮した順位（1, 2, 2, 4 …）を付ける。 */
export function assignRanks<T extends RankKey>(sorted: T[]): Array<T & { rank: number }> {
  let currentRank = 1;
  return sorted.map((row, i) => {
    if (i > 0 && !sameRankKey(sorted[i - 1], row)) currentRank = i + 1;
    return { ...row, rank: currentRank };
  });
}

/** 1st / 2nd / 3rd / 4th …（11〜13 は th） */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
