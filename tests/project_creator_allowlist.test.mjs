import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/202610090002_project_creator_allowlist.sql');

describe('大会を作れるアカウントの制限', () => {
  it('許可の一覧は、画面・API から読み書きできない(RLS 有効 + 権限を剥奪)', () => {
    expect(migration).toMatch(/alter table public\.project_creators enable row level security;/);
    expect(migration).toMatch(/revoke all on public\.project_creators from public, anon, authenticated;/);
  });

  it('判定は、Google ログイン・メール確認済み・一覧にある、の3つをすべて満たすときだけ', () => {
    const fn = migration.slice(migration.indexOf('create or replace function public.can_create_project'));
    expect(fn).toContain("app_metadata' ->> 'provider'");
    expect(fn).toContain("= 'google'");
    expect(fn).toContain("'email_verified'");
    expect(fn).toContain('from public.project_creators');
  });

  it('作成は、確認を通った後だけ。projects への直接の INSERT の道は閉じる', () => {
    const create = migration.slice(migration.indexOf('create or replace function public.create_project_with_owner'));
    expect(create.indexOf('public.can_create_project()')).toBeGreaterThan(-1);
    expect(create.indexOf('public.can_create_project()')).toBeLessThan(create.indexOf('insert into public.projects'));
    expect(migration).toContain('drop policy if exists projects_insert_owner_candidate on public.projects;');
    expect(migration).toContain('revoke insert on public.projects from authenticated;');
  });

  it('許可したメールアドレスを、リポジトリ(マイグレーション・文書)に書かない', () => {
    const gmail = /[A-Za-z0-9._+-]+@gmail\.com/;
    for (const file of ['supabase/migrations/202610090002_project_creator_allowlist.sql', 'docs/feature_inventory.md', 'docs/security-migration-status.md']) {
      expect(read(file), file).not.toMatch(gmail);
    }
  });

  it('画面は、許可のないアカウントに入力欄を出さず、サーバーが改めて断る', () => {
    const index = read('js/index.js');
    expect(index).toContain('CIQSupabaseAPI.canCreateProject()');
    expect(index).toContain("creatorAllowed = false;   // 確認できないときは、作れない側に倒す");
    expect(read('js/supabase_api.js')).toContain(".rpc('can_create_project')");
  });
});
