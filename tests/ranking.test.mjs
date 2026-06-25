import { describe, it, expect } from 'vitest';

function streaksFromAnswers(answers) {
  const streaks = [];
  let cur = 0;
  answers.forEach(a => {
    if (a === 1) {
      cur++;
    } else {
      streaks.push(cur);
      cur = 0;
    }
  });
  streaks.push(cur);
  return streaks;
}

function compareResult(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  const maxLen = Math.max(a.streaks.length, b.streaks.length);
  for (let i = 0; i < maxLen; i++) {
    const sa = a.streaks[i] || 0;
    const sb = b.streaks[i] || 0;
    if (sa !== sb) return sb - sa;
  }
  return 0;
}

describe('ranking tie breakers', () => {
  it('includes a trailing correct streak', () => {
    expect(streaksFromAnswers([0, 1, 1])).toEqual([0, 2]);
    expect(streaksFromAnswers([1, 1, 1])).toEqual([3]);
  });

  it('treats identical score and streaks as the same rank key', () => {
    const a = { score: 3, streaks: [1, 2] };
    const b = { score: 3, streaks: [1, 2] };
    expect(compareResult(a, b)).toBe(0);
  });

  it('does not treat equal scores with different streaks as the same rank', () => {
    const stronger = { score: 3, streaks: [2, 1] };
    const weaker = { score: 3, streaks: [1, 2] };
    expect(compareResult(stronger, weaker)).toBeLessThan(0);
  });
});
