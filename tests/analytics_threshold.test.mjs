import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/admin_stats.js', import.meta.url), 'utf8');

describe('正答率分析のしきい値', () => {
  it('しきい値が変わったら、再描画の判定(hash)も変わる', () => {
    const render = source.slice(source.indexOf('async function renderAnalytics'), source.indexOf('async function exportAnalyticsCSV'));
    expect(render).toContain('readAnalyticsThreshold()');
    expect(render).toMatch(/const hash = `\$\{readAnalyticsThreshold\(\)\}\|`/);
  });

  it('0 も有効なしきい値として読む(空や不正なときだけ既定の5)', () => {
    const body = source.match(/function readAnalyticsThreshold\(\) \{[\s\S]*?\n        \}/)[0];
    const read = new Function('document', `${body}; return readAnalyticsThreshold;`);
    const withValue = (value) => read({ getElementById: () => ({ value }) })();
    expect(withValue('0')).toBe(0);
    expect(withValue('3')).toBe(3);
    expect(withValue('')).toBe(5);
    expect(withValue('abc')).toBe(5);
    expect(withValue('-2')).toBe(5);
  });
});
