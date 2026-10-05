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

  it('定型文のコピーも同じ処理で、ボタンが「コピーしました」に変わる。ほかの操作には引数を渡さない', () => {
    const admin = read('js/admin.js');
    const settings = read('js/admin_settings.js');
    expect(settings).toMatch(/window\.copyText\(text, button\)/);
    expect(settings).not.toMatch(/定型文をコピーしました。/);
    expect(admin).toMatch(/takesButton \? fn\(el\) : fn\(\)/);
  });
});

describe('IDX-08 採点者向けの案内', () => {
  it('採点者への案内は「運営」から共有された招待リンク（「管理者」はロール名なので使わない）', () => {
    const html = read('index.html');
    expect(html).toMatch(/採点者として参加するには、運営から共有された招待リンクを開いてください。/);
    expect(html).not.toMatch(/管理者から共有された招待リンク/);
  });
});
