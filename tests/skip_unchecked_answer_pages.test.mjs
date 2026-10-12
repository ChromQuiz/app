import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(import.meta.dirname, '..', 'js/admin_prep.js'), 'utf8');

describe('答案の取り込み: 当日受付していない人の用紙', () => {
  it('当日受付が済んでいない番号は、保存せずに飛ばして理由を知らせる', () => {
    const check = src.indexOf('.checked_in !== true');
    const skip = src.indexOf('当日受付が済んでいないため、取り込みませんでした');
    const save = src.indexOf('seenEntryNumbers.set(entryNumber, i)');
    expect(check).toBeGreaterThan(-1);
    expect(skip).toBeGreaterThan(check);
    expect(save).toBeGreaterThan(skip);
  });
});
