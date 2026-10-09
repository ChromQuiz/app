import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// 適用済みのマイグレーションは書き換えない(新しい変更は、新しい番号のファイルで足す)。
// tests/fixtures/migration_checksums.json に、各ファイルの SHA-256 を控えてあり、変わったら落ちる。
// 新しいファイルを足したときは、そのファイルを控えに加える(マイグレーションを本番に適用したあとで)。
//   足す行は、控えに無いときのテストの失敗メッセージに出る。
const DIR = resolve(import.meta.dirname, '../supabase/migrations');
const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/migration_checksums.json'), 'utf8'));
const sha = (name) => createHash('sha256').update(readFileSync(resolve(DIR, name))).digest('hex');
const files = readdirSync(DIR).filter(name => name.endsWith('.sql')).sort();

describe('マイグレーションの書き換えを防ぐ', () => {
  it('控えにあるファイルは、中身が変わっていない', () => {
    const changed = files.filter(name => manifest[name] && manifest[name] !== sha(name));
    expect(changed, `適用済みのマイグレーションが書き換えられています。新しい番号のファイルで変更してください: ${changed.join(', ')}`).toEqual([]);
  });

  it('控えにあるファイルが、消えていない', () => {
    const missing = Object.keys(manifest).filter(name => !files.includes(name));
    expect(missing, `マイグレーションが消えています: ${missing.join(', ')}`).toEqual([]);
  });

  it('新しいファイルは、控えに加えてある(適用したあとで、次の行を tests/fixtures/migration_checksums.json に足す)', () => {
    const unlisted = files.filter(name => !manifest[name]);
    expect(unlisted.map(name => `  "${name}": "${sha(name)}",`), '控えに無いマイグレーションがあります').toEqual([]);
  });
});
