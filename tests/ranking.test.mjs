// 成績の順位。サーバーの実コード（_shared/ranking.ts）を直接試し、管理画面（js/admin_stats.js）の同じ規則と突き合わせる。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assignRanks, compareRank, ordinal, sameRankKey, streaksFromAnswers } from '../supabase/functions/_shared/ranking.ts';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

const row = (answers) => ({ answers, score: answers.reduce((a, b) => a + b, 0), streaks: streaksFromAnswers(answers) });

describe('streaksFromAnswers', () => {
  it('最後の連続も数える', () => {
    expect(streaksFromAnswers([0, 1, 1])).toEqual([0, 2]);
    expect(streaksFromAnswers([1, 1, 1])).toEqual([3]);
    expect(streaksFromAnswers([1, 0, 1, 1, 0, 1])).toEqual([1, 2, 1]);
    expect(streaksFromAnswers([0, 0])).toEqual([0, 0, 0]);
    expect(streaksFromAnswers([])).toEqual([0]);
  });
});

describe('compareRank / assignRanks', () => {
  it('点数が高いほうが上', () => {
    expect(compareRank(row([1, 1, 0]), row([1, 0, 0]))).toBeLessThan(0);
  });

  it('同点は、連続して正解した数を、問題の順に比べ、先に長いほうが上', () => {
    const stronger = { score: 3, streaks: [2, 1] };
    const weaker = { score: 3, streaks: [1, 2] };
    expect(compareRank(stronger, weaker)).toBeLessThan(0);
    expect(compareRank(weaker, stronger)).toBeGreaterThan(0);
  });

  it('点数も連答もすべて同じなら同順位。次の人は、人数分を飛ばした順位になる（1, 2, 2, 4）', () => {
    const rows = [row([1, 1, 1, 1]), row([1, 1, 0, 1]), row([1, 1, 0, 1]), row([0, 0, 1, 0])].sort(compareRank);
    expect(assignRanks(rows).map((r) => r.rank)).toEqual([1, 2, 2, 4]);
    expect(sameRankKey(rows[1], rows[2])).toBe(true);
    expect(sameRankKey(rows[0], rows[1])).toBe(false);
  });

  it('1人だけなら1位。全員が0点なら全員1位', () => {
    expect(assignRanks([row([1])]).map((r) => r.rank)).toEqual([1]);
    expect(assignRanks([row([0, 0]), row([0, 0]), row([0, 0])]).map((r) => r.rank)).toEqual([1, 1, 1]);
  });

  it('同じ点数・同じ連答でも、順番が違えば別の順位（[1,0,1,1] は [1,1,0,1] より下）', () => {
    const a = row([1, 1, 0, 1]);
    const b = row([1, 0, 1, 1]);
    expect(compareRank(a, b)).toBeLessThan(0);
    expect(sameRankKey(a, b)).toBe(false);
  });
});

describe('ordinal', () => {
  it('1st 2nd 3rd 4th、11〜13 は th', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112, 113].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th', '112th', '113th',
    ]);
  });
});

describe('管理画面（js/admin_stats.js）の規則と同じ', () => {
  // 管理画面の並べ替えと順位付けの部分をソースから取り出して、サーバーの実コードと同じ結果になるか試す。
  const src = read('js/admin_stats.js');
  const sortStart = src.indexOf('results.sort((a, b) => {');
  const sortEnd = src.indexOf('});', src.indexOf('return 0;', sortStart)) + 3;
  const sortCode = src.slice(sortStart, sortEnd);
  const rankStart = src.indexOf('let currentRank = 1;');
  const rankEnd = src.indexOf('const streakCols', rankStart);
  const rankLoop = src.slice(rankStart, rankEnd).replace('results.forEach((r, idx) => {', 'results.forEach((r, idx) => { r.__idx = idx;');

  function clientRanks(rows) {
    const results = rows.map((r) => ({ ...r }));
    new Function('results', sortCode)(results);
    // ranks を集める簡易版（取り出した規則と同じ式）
    const fn = new Function('results', `${rankStart >= 0 ? 'let currentRank = 1;' : ''}
      const out = [];
      results.forEach((r, idx) => {
        if (idx > 0) {
          const prev = results[idx - 1];
          const same = prev.score === r.score && JSON.stringify(prev.streaks) === JSON.stringify(r.streaks);
          if (!same) currentRank = idx + 1;
        }
        out.push(currentRank);
      });
      return { results, ranks: out };`);
    return fn(results);
  }

  it('管理画面のコードに、期待する並べ替えと順位付けの式がある（ソースの形が変わったら、この突き合わせを見直す）', () => {
    expect(sortCode).toMatch(/b\.score !== a\.score\) return b\.score - a\.score/);
    expect(sortCode).toMatch(/if \(sa !== sb\) return sb - sa/);
    expect(rankLoop).toMatch(/JSON\.stringify\(prev\.streaks\) === JSON\.stringify\(r\.streaks\)/);
    expect(rankLoop).toMatch(/if \(!same\) currentRank = idx \+ 1/);
  });

  it('ランダムな答えの並びで、サーバーと管理画面の順位が一致する', () => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let trial = 0; trial < 200; trial += 1) {
      const questions = 1 + Math.floor(rnd() * 12);
      const people = 1 + Math.floor(rnd() * 15);
      const rows = Array.from({ length: people }, () => row(Array.from({ length: questions }, () => (rnd() < 0.55 ? 1 : 0))));
      const server = assignRanks([...rows].sort(compareRank));
      const client = clientRanks(rows);
      expect(client.ranks, `trial ${trial}`).toEqual(server.map((r) => r.rank));
      expect(client.results.map((r) => r.answers.join('')), `trial ${trial}`).toEqual(server.map((r) => r.answers.join('')));
    }
  });
});

describe('成績照会（disclose-result）の母集団と順位', () => {
  const fn = read('supabase/functions/disclose-result/index.ts');

  it('順位づけは共通の部品を使い、自前の式を持たない', () => {
    expect(fn).toMatch(/import \{ assignRanks, compareRank, ordinal, streaksFromAnswers \} from '\.\.\/_shared\/ranking\.ts'/);
    expect(fn).not.toMatch(/function (streaksFromAnswers|compareRank|sameRankKey|ordinal)\(/);
  });

  it('母集団は、当日受付を済ませた人だけ。本人が受付前なら対象外', () => {
    expect(fn).toMatch(/\.eq\('checked_in', true\)/);
    expect(fn).toMatch(/authEntry\.checked_in !== true/);
  });
});
