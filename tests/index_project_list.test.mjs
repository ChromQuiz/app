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

describe('Google ログイン', () => {
  it('毎回アカウントの選択を出す（ログアウト後に前のアカウントへ自動で入らない）', () => {
    const api = read('js/supabase_api.js');
    const body = api.slice(api.indexOf('async signInWithGoogle()'), api.indexOf('async signOut()'));
    expect(body).toMatch(/queryParams: \{ prompt: 'select_account' \}/);
    expect(body).toMatch(/provider: 'google'/);
  });
});

describe('IDX-09 大会の作成（入力と名前）', () => {
  // index.js はブラウザ用のスクリプトなので、必要な関数だけを取り出して動かす
  const js = read('js/index.js');
  const pick = (name) => {
    const start = js.indexOf(`function ${name}(`);
    const end = js.indexOf('\n}\n', start) + 2;
    return js.slice(start, end);
  };
  const { getOrdinalSuffix, parseEdition } = new Function(`${pick('getOrdinalSuffix')}\n${pick('parseEdition')}\nreturn { getOrdinalSuffix, parseEdition };`)();

  it('大会の名前の序数: 1st 2nd 3rd 4th、11〜13 は th、21st 22nd 23rd、111〜113 も th', () => {
    const name = (n) => `CIQ the ${n}${getOrdinalSuffix(n)}`;
    expect([1, 2, 3, 4, 10, 11, 12, 13, 14, 21, 22, 23, 101, 111, 112, 113, 121].map(name)).toEqual([
      'CIQ the 1st', 'CIQ the 2nd', 'CIQ the 3rd', 'CIQ the 4th', 'CIQ the 10th',
      'CIQ the 11th', 'CIQ the 12th', 'CIQ the 13th', 'CIQ the 14th',
      'CIQ the 21st', 'CIQ the 22nd', 'CIQ the 23rd',
      'CIQ the 101st', 'CIQ the 111th', 'CIQ the 112th', 'CIQ the 113th', 'CIQ the 121st',
    ]);
  });

  it('回数は数字（全角も可）で 1〜999 のときだけ受け付ける', () => {
    expect(['1', '13', '999', ' 7 ', '１３'].map(parseEdition)).toEqual([1, 13, 999, 7, 13]);
    expect(['', '0', '-1', '1000', '1.5', '12abc', 'abc', '1e3', null, undefined].map(parseEdition)).toEqual(Array(10).fill(0));
  });

  it('プロジェクト ID は ciq + 回数で、サーバーの形式（英数字3〜40文字）に収まる', () => {
    for (const n of [1, 13, 999]) expect(/^[a-z0-9][a-z0-9_-]{2,39}$/.test(`ciq${n}`)).toBe(true);
  });

  it('未ログインなら先にログインを促す。作成中はボタンを無効にする', () => {
    expect(js).toMatch(/先にGoogleアカウントでログインしてください。/);
    expect(js).toMatch(/btn\.disabled = true;\s*setButtonContent\(btn, '作成中…'/);
  });
});
