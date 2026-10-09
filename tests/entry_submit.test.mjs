// 送信と完了（ENT-32〜40）で、コードの形として守りたいこと。画面の動きは機能一覧に記録した確認で見ている。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const entry = read('js/entry.js');

describe('送信（js/entry.js）', () => {
  it('送信中は、ボタン以外から来た送信も受け付けない（二重登録の防止）', () => {
    expect(entry).toMatch(/if \(btn\.disabled\) return;\s*if \(!emailVerified/);
  });

  it('メール認証をサーバーに認められなかったときは、本人確認からやり直させる', () => {
    expect(entry).toMatch(/err\.status === 401 \|\| \(err\.status === 400 && \/メール認証\/\.test\(err\.message/);
    expect(entry).toMatch(/returnToEmailVerification\(err\.message\)/);
  });

  it('29分のリセットも、同じ「本人確認に戻る」処理を使う', () => {
    expect(entry).toMatch(/returnToEmailVerification\('セッションの有効期限が切れました。再度メール認証を行ってください。'\)/);
  });

  it('確認メールを送れなかったことを、完了画面で伝える（パスワードはこのメールにしか載らない）', () => {
    expect(entry).toMatch(/showConfirmationMailFailure\(\)/);
    expect(entry).toMatch(/確認メールを送信できませんでした。/);
    expect(entry).toMatch(/「パスワードを忘れた場合」から、再発行してください。/);
  });

  it('失敗したら Turnstile をリセットし、ボタンを戻す。内部の例外は汎用の文言にする', () => {
    expect(entry).toMatch(/CIQTurnstile\.reset\('turnstile-entry'\);\s*btn\.disabled = false;/);
    expect(entry).toMatch(/エントリーを送信できませんでした。時間をおいて再度お試しください。/);
  });
});

describe('登録のサーバー側（ENT-38〜40）', () => {
  const fn = read('supabase/functions/create-entry/index.ts');

  it('受付の状態と、同じメールの二重登録を、日本語で断る', () => {
    expect(fn).toMatch(/このメールアドレスは既にエントリー済みです。/);
    expect(fn).toMatch(/Entry is closed/);
    expect(fn).toMatch(/Entry period has not started/);
    expect(fn).toMatch(/Entry period has ended/);
  });

  it('Turnstile とメール認証を、登録より前に確認する', () => {
    expect(fn.indexOf('verifyTurnstile(')).toBeLessThan(fn.indexOf('verifyEmailVerifiedToken('));
    expect(fn.indexOf('verifyEmailVerifiedToken(')).toBeLessThan(fn.indexOf("rpc('create_entry_atomic'"));
  });
});

describe('マイエントリーのセッション（MY-05）', () => {
  it('サーバーが認めなかったトークン（401・404）は消し、通信の失敗では残す', () => {
    const my = read('js/my.js');
    expect(my).toMatch(/if \(err\?\.status === 401 \|\| err\?\.status === 404\) storeSession\(null\)/);
  });
});

describe('404 ページ（404-01、404-02）', () => {
  const html = read('404.html');

  it('どんな深さの住所でも開かれるので、参照は /app/ からの絶対パス', () => {
    for (const m of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
      const url = m[1];
      if (/^https?:/.test(url)) continue;
      expect(url, url).toMatch(/^\/app\//);
    }
  });

  it('履歴がなければ index.html へ。絶対パスで移動する', () => {
    const js = read('js/not_found.js');
    expect(js).toMatch(/window\.history\.length > 1/);
    expect(js).toMatch(/window\.location\.href = '\/app\/index\.html'/);
  });
});

describe('エントリーリスト（LST-09）', () => {
  const src = read('js/entry_list.js');

  it('キャンセル待ちはサーバーが決めた状態を使う（受付済みの人を、順位だけでキャンセル待ちに出さない）', () => {
    expect(src).toMatch(/e\._showWaitlist = e\.status \? e\.status === 'waitlist' : e\._isWaitlist/);
    expect(src).toMatch(/const firstWaitlistIndex = ordered\.findIndex\(e => e\._showWaitlist\)/);
    expect(src).toMatch(/renderRow\(entry, entry\._showWaitlist\)/);
  });

  it('日時は日本時間で出す', () => {
    expect(src).toMatch(/formatShortDateTimeJa\(e\.timestamp/);
  });
});

describe('運営の参加者追加: メールの全角', () => {
  it('ブラウザの検証より前に、全角を半角へ直す', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../js/admin_settings.js', import.meta.url), 'utf8');
    const normalizeAt = src.indexOf('emailInput.value = normalizeEmailInput(emailInput.value)');
    const reportAt = src.indexOf('form.reportValidity()');
    expect(normalizeAt).toBeGreaterThan(-1);
    expect(normalizeAt).toBeLessThan(reportAt);
  });
});
