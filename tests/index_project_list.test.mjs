// ログイン画面の大会の一覧（IDX-05）。役割は自分の行から取り、「戻る」で戻ったら読み直す。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

describe('listMyProjects', () => {
  const api = read('js/supabase_api.js');
  const body = api.slice(api.indexOf('async listMyProjects()'), api.indexOf('async listProjectMembers'));

  it('自分のメンバー行だけに絞る（管理者は全員の行を読めるため、絞らないと別の人の役割が先頭に来る）', () => {
    expect(body).toMatch(/\.eq\('project_members\.user_id', userId\)/);
    expect(body).toMatch(/\.eq\('project_members\.status', 'active'\)/);
  });

  it('ログインしていなければ、問い合わせずに空にする', () => {
    expect(body).toMatch(/if \(!userId\) return \[\]/);
  });
});

describe('index.js', () => {
  const js = read('js/index.js');

  it('「戻る」で復元されたときは、ログイン状態と一覧を読み直す', () => {
    expect(js).toMatch(/addEventListener\('pageshow'/);
    expect(js).toMatch(/event\.persisted/);
    expect(js).toMatch(/renderSupabaseAuth\(supabaseSession\)/);
  });
});

describe('管理画面のコピー動作', () => {
  it('参加者に共有するリンクと採点者の招待リンクは、同じコピー処理（アイコンがチェック印に変わる）を使う', () => {
    const admin = read('js/admin.js');
    const settings = read('js/admin_settings.js');
    expect(admin).toMatch(/window\.copyText = function/);
    expect(admin).toMatch(/window\.copyText\(url, btn\)/);
    expect(settings).toMatch(/window\.copyText\(field\.value, event\.currentTarget\)/);
    expect(settings).not.toMatch(/招待リンクをコピーしました。/);
  });
});
