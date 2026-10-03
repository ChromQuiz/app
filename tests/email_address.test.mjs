// メールアドレスの形式チェック。サーバー側(_shared/email_address.ts)とブラウザ側(js/shared.js)が
// 同じ規則であること、メール会社に拒否される形を事前に弾けることを確認する。
//
// 背景: 「@ と . がある」だけの緩いチェックでは、全角文字などが通り抜けて Brevo に
// "email is not valid in to" (400) で拒否され、画面には汎用の 500 が出ていた。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isValidEmailAddress as serverCheck } from '../supabase/functions/_shared/email_address.ts';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced ${name}`);
}
const clientCheck = new Function(`return (${extractFunction(read('js/shared.js'), 'isValidEmailAddress')})`)();

const VALID = [
  'a@b.co',
  'reon.s.717+1@gmail.com',
  'first.last@sub.example.co.jp',
  "o'brien@example.com",
  'USER@EXAMPLE.COM',
  'a_b-c@my-domain.jp',
  `${'a'.repeat(64)}@example.com`,
];

const INVALID = [
  '', ' ', 'a', 'a@b', 'a@b.', '@b.com', 'a@.com',
  'a b@c.com', ' a@b.com', 'a@b.com ', 'a@@b.com', 'a@b@c.com',
  'a@b..com', '.a@b.com', 'a.@b.com', 'a..b@c.com',
  'a@b.c',                     // TLD が 1 文字
  'a@-bad.com', 'a@bad-.com',
  'ａ@gmail.com',              // 全角の英数字
  'name＠gmail.com',           // 全角の @
  'name@gmail.com。',          // 末尾の句点
  'name@gmail.com、',
  'name@gmail,com',
  'name@gmail.co m',
  '日本語@example.com',
  'name@日本語.jp',
  `${'a'.repeat(65)}@example.com`,                  // ローカル部が 64 文字超
  `a@${'b'.repeat(250)}.com`,                       // 全体が 254 文字超
];

describe('email address check', () => {
  for (const email of VALID) {
    it(`accepts ${JSON.stringify(email.length > 40 ? `${email.slice(0, 20)}…(${email.length}文字)` : email)}`, () => {
      expect(serverCheck(email)).toBe(true);
      expect(clientCheck(email)).toBe(true);
    });
  }

  for (const email of INVALID) {
    it(`rejects ${JSON.stringify(email.length > 40 ? `${email.slice(0, 20)}…(${email.length}文字)` : email)}`, () => {
      expect(serverCheck(email)).toBe(false);
      expect(clientCheck(email)).toBe(false);
    });
  }

  it('rejects values that are not strings', () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      expect(serverCheck(bad)).toBe(false);
      expect(clientCheck(bad)).toBe(false);
    }
  });

  it('server and browser implementations agree on every case above', () => {
    for (const email of [...VALID, ...INVALID]) expect(clientCheck(email)).toBe(serverCheck(email));
  });
});

describe('the check is used where an address is entered or mailed', () => {
  it('entry form, admin proxy entry and send-email use the shared check, not the loose regex', () => {
    for (const file of ['js/entry.js', 'js/admin_settings.js', 'supabase/functions/send-email/index.ts']) {
      const src = read(file);
      expect(src).toMatch(/isValidEmailAddress\(/);
      expect(src).not.toMatch(/\[\^\\s@\]\+@\[\^\\s@\]\+/);
    }
  });

  it('send-email turns a provider rejection into a specific response instead of a generic 500', () => {
    const src = read('supabase/functions/send-email/index.ts');
    expect(src).toMatch(/message\.startsWith\('Brevo send failed'\)/);
    expect(src).toMatch(/このメールアドレスには送信できません/);
    expect(src).toMatch(/\}, 502\)/);
  });
});
