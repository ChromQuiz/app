// supabase/tests/db_behavior.sql（本番と同じ DB を、巻き戻す取引の中で動かす確認）が、安全な形のままであることを守る。
// SQL そのものの実行は、ネットワークと本番への接続が要るので、手動（README の手順）。

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const sql = readFileSync(resolve(ROOT, 'supabase/tests/db_behavior.sql'), 'utf8');

describe('db_behavior.sql', () => {
  it('取引で始まり、最後に必ず rollback する（本番に何も残さない）。commit はどこにもない', () => {
    expect(sql).toMatch(/^begin;$/m);
    expect(sql.trimEnd().endsWith('rollback;')).toBe(true);
    expect(sql).not.toMatch(/^\s*commit\s*;/im);
    expect((sql.match(/^rollback;$/gm) || []).length).toBe(1);
  });

  it('テスト用のユーザーは @example.invalid、大会は zz- で始まる（本番の大会 ciq* に触れない）', () => {
    for (const m of sql.matchAll(/'([a-z0-9]+@[a-z.]+)'/g)) expect(m[1]).toMatch(/@example\.invalid$/);
    expect(sql).not.toMatch(/'ciq\d+'/);
    expect(sql).not.toMatch(/\bupdate public\.projects set [^;]*where id = 'ciq/);
  });

  it('機能一覧の DB-01〜DB-24 の主な項目を確かめている', () => {
    for (const id of ['DB-01', 'DB-02', 'DB-03', 'DB-04', 'DB-05', 'DB-06', 'DB-07', 'DB-08', 'DB-09', 'DB-10', 'DB-10a', 'DB-11', 'DB-12', 'DB-13', 'DB-14', 'DB-15', 'DB-16', 'DB-17', 'DB-18', 'DB-19', 'DB-20', 'DB-21', 'DB-24']) {
      expect(sql, id).toContain(`'${id} `);
    }
  });

  it('招待の失効が動く確認がある（以前は常に失敗していた）', () => {
    expect(sql).toMatch(/DB-13 管理者は、招待を失効させられる/);
    expect(sql).toMatch(/DB-13 失効した招待は使えない/);
  });
});

describe('202610080001_fix_revoke_scorer_invite', () => {
  const file = readdirSync(resolve(ROOT, 'supabase/migrations')).find((f) => f.startsWith('202610080001_'));
  const migration = readFileSync(resolve(ROOT, 'supabase/migrations', file), 'utf8');

  it('表の列を表名つきで書き、戻り値の列名との曖昧さをなくす', () => {
    expect(migration).toMatch(/coalesce\(project_invites\.revoked_at, now\(\)\)/);
    expect(migration).not.toMatch(/=\s*coalesce\(revoked_at/);
  });

  it('権限は、ログイン済みの利用者だけ（匿名・公開には渡さない）', () => {
    expect(migration).toMatch(/revoke all on function public\.revoke_scorer_invite\(uuid\) from public, anon/);
    expect(migration).toMatch(/grant execute on function public\.revoke_scorer_invite\(uuid\) to authenticated/);
  });
});
