import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ui.js から csvCell だけを取り出して調べる(ブラウザ用の読み込みなのでそのまま import できない)。
const source = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const match = source.match(/function csvCell\(value\) \{[\s\S]*?\n\}/);
const csvCell = new Function(`${match[0]}; return csvCell;`)();

describe('csvCell', () => {
  it('ふつうの文字はそのまま', () => {
    expect(csvCell('山田')).toBe('山田');
    expect(csvCell(12)).toBe('12');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('カンマ・引用符・改行を含むときは引用符で囲み、引用符は二重にする', () => {
    expect(csvCell('A高,B中')).toBe('"A高,B中"');
    expect(csvCell('彼は"本気"')).toBe('"彼は""本気"""');
    expect(csvCell('1行目\n2行目')).toBe('"1行目\n2行目"');
  });

  it('式として実行されうる先頭の文字を無効にする', () => {
    expect(csvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('=1,2')).toBe('"\'=1,2"');
  });

  it('管理画面のCSV出力はすべてこの関数を通す', () => {
    const stats = readFileSync(new URL('../js/admin_stats.js', import.meta.url), 'utf8');
    const settings = readFileSync(new URL('../js/admin_settings.js', import.meta.url), 'utf8');
    expect(stats).toContain('csvCell(r.affiliation)');
    expect(stats).toContain('csvCell(s.names)');
    expect(settings).toContain('csvCell(pii.inquiry)');
    expect(settings).not.toMatch(/replace\(\/"\/g, '""'\)/);
    expect(stats).not.toMatch(/replace\(\/"\/g, '""'\)/);
  });
});
