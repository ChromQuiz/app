// パスワードの再発行（FND-18）。メール認証を済ませた本人だけが、新しいパスワードに差し替えられることを確かめる。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

describe('reset-password（サーバー）', () => {
  const src = read('supabase/functions/reset-password/index.ts');

  it('メール認証済みトークンを、メールのハッシュと大会に結びつけて検証する', () => {
    expect(src).toMatch(/verifyEmailVerifiedToken\(emailVerifiedToken, projectId, emailHash\)/);
    expect(src.indexOf('verifyEmailVerifiedToken')).toBeLessThan(src.indexOf('.update('));
  });

  it('新しいパスワードはハッシュだけを受け取り、pepper を掛けて保存する', () => {
    expect(src).toMatch(/isClientHash\(newPasswordHash\)/);
    expect(src).toMatch(/pepperHash\(newPasswordHash\)/);
    expect(src).not.toMatch(/console\.(log|error)\([^)]*(newPasswordHash|emailHash)\b/);
  });

  it('更新対象は同じ大会・同じメールのエントリーだけで、個人情報は復号しない', () => {
    expect(src).toMatch(/\.eq\('project_id', projectId\)\s*\.eq\('email_hash_v2', emailHashV2\)/);
    expect(src).not.toMatch(/encrypted_pii|decrypt/i);
  });

  it('回数の制限と、記録を残す', () => {
    expect(src).toMatch(/enforceIpRateLimit/);
    expect(src).toMatch(/entry\.password_reset/);
  });

  it('エラーは日本語', () => {
    for (const m of src.matchAll(/error: '([^']*)'/g)) expect(m[1]).toMatch(/[぀-ヿ一-鿿]/);
  });
});

describe('send-email の再発行用コード', () => {
  const src = read('supabase/functions/send-email/index.ts');

  it('エントリー期間外でも再発行用のコードは送れるが、通常用は期間を確認する', () => {
    expect(src).toMatch(/if \(purpose === 'entry'\) assertEntryOpen\(project\)/);
  });

  it('登録のないメールアドレスには送らず、応答の形は同じにする', () => {
    const start = src.indexOf("if (purpose === 'password_reset') {");
    const block = src.slice(start, src.indexOf('recordAndSend', start));
    expect(block).toMatch(/email_hash_v2/);
    expect(block).toMatch(/return jsonResponse\(\{ success: true, signature, expiresAt \}\)/);
  });
});

describe('my.html の画面', () => {
  const html = read('my.html');
  const js = read('js/my.js');

  it('ログイン画面から再発行に進め、Turnstile を読み込む', () => {
    expect(html).toMatch(/id="forgot-btn"/);
    expect(html).toMatch(/id="reset-card"/);
    expect(html).toMatch(/challenges\.cloudflare\.com\/turnstile/);
    expect(html).toMatch(/js\/turnstile\.js/);
  });

  it('CSP が Turnstile を許可している', () => {
    const csp = html.match(/Content-Security-Policy" content="([^"]*)"/)[1];
    expect(csp).toMatch(/script-src[^;]*challenges\.cloudflare\.com/);
    expect(csp).toMatch(/frame-src[^;]*challenges\.cloudflare\.com/);
  });

  it('新しいパスワードは画面を閉じると消える（保存しない）', () => {
    expect(js).not.toMatch(/(local|session)Storage\.setItem\([^)]*[Pp]assword/);
    expect(js).toMatch(/function closeReset\(\)[\s\S]*resetNewPassword = ''/);
  });
});
