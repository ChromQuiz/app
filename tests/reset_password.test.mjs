// パスワードの再発行（FND-18）。メール認証を済ませた本人だけが、新しいパスワードに差し替えられることを確かめる。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

describe('send-email の reset_password（サーバー）', () => {
  const full = read('supabase/functions/send-email/index.ts');
  const src = full.slice(full.indexOf("if (type === 'reset_password')"), full.indexOf('const template = templates[type]'));

  it('メール認証済みトークンを、大会とメールのハッシュに結びつけて、更新の前に検証する', () => {
    expect(src).toMatch(/verifyEmailVerifiedToken\(token, effectiveProjectId, recipientHash\)/);
    expect(src.indexOf('verifyEmailVerifiedToken')).toBeLessThan(src.indexOf('.update('));
  });

  it('新しいパスワードはサーバーが作り、ハッシュに pepper を掛けて保存し、画面には返さない', () => {
    expect(src).toMatch(/generatePassword\(\)/);
    expect(src).toMatch(/pepperHash\(await sha256Hex\(password\)\)/);
    expect(src).toMatch(/return jsonResponse\(\{ success: true \}\)/);
    expect(src).not.toMatch(/jsonResponse\(\{[^)]*password/);
    expect(src).not.toMatch(/console\.(log|error)\([^)]*\$\{password\}/);
  });

  it('更新対象は同じ大会・同じメールのエントリーだけで、個人情報は復号しない', () => {
    expect(src).toMatch(/\.eq\('project_id', effectiveProjectId\)\s*\.eq\('email_hash_v2', recipientLogHash\)/);
    expect(src).not.toMatch(/encrypted_pii|decrypt/i);
  });

  it('回数の制限と、記録を残す', () => {
    expect(src).toMatch(/enforceIpRateLimit/);
    expect(src).toMatch(/entry\.password_reset/);
  });

  it('パスワードのメールは受付番号と新しいパスワードを載せる', () => {
    expect(full).toMatch(/function passwordReissued/);
    expect(full).toMatch(/\['新しいパスワード', password\]/);
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

  it('新しいパスワードは画面に出さず、メールで届ける（エントリー時と同じ）', () => {
    expect(js).toMatch(/CIQEmail\.resetPassword\(/);
    expect(js).not.toMatch(/randomString\(8, RESET/);
    expect(html).not.toMatch(/reset-new-password/);
  });
});
