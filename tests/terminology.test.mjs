// 用語の回帰テスト。
//
// 「QRコード」はデンソーウェーブの登録商標なので、利用者の目に触れる文言では
// 「二次元コード」を使う。ライブラリ名・関数名・環境変数などの識別子は対象外
// (jsQR / QRCode / processQR / npm:qrcode など)。

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// 識別子の一部でない QR だけを拾う
const BARE_QR = /(?<![A-Za-z0-9_])QR(?![A-Za-z0-9_])/;

const FILES = [
  'admin.html', 'checkin.html', 'entry.html', 'entry_list.html', 'help.html',
  'index.html', 'join.html', 'judge.html', 'my.html', 'question.html',
  'conflict.html', 'terms.html', '404.html',
  'js/admin.js', 'js/admin_settings.js', 'js/checkin.js', 'js/entry.js',
  'js/my.js', 'js/supabase_api.js', 'js/entry_list.js',
  'supabase/functions/check-in/index.ts',
  'supabase/functions/checkin-qr/index.ts',
  'supabase/functions/admin-entry-qr/index.ts',
  'supabase/functions/my-entry/index.ts',
  'supabase/functions/send-email/index.ts',
  'supabase/functions/_shared/qr_token.ts',
  'supabase/functions/_shared/participant_auth.ts',
];

describe('利用者に見える文言では「二次元コード」を使う', () => {
  for (const file of FILES) {
    it(`${file} に生の QR が残っていない`, () => {
      const lines = readFileSync(resolve(ROOT, file), 'utf8').split('\n');
      const offenders = lines
        .map((line, i) => ({ line: line.trim(), no: i + 1 }))
        // 外部ライブラリの読み込み行だけは識別子そのものなので除外
        .filter(({ line }) => !line.includes('jsqr@') && !line.includes('npm:qrcode'))
        .filter(({ line }) => BARE_QR.test(line))
        .map(({ line, no }) => `${no}: ${line.slice(0, 80)}`);
      expect(offenders).toEqual([]);
    });
  }

  it('メール本文が二次元コードと呼んでいる', () => {
    const mail = readFileSync(resolve(ROOT, 'supabase/functions/send-email/index.ts'), 'utf8');
    expect(mail).toContain('当日受付用二次元コード');
    expect(mail).toContain('二次元コードはマイエントリーからも再表示できます。');
  });

  it('識別子は改名していない(デプロイ名・ライブラリ名を壊さない)', () => {
    const checkin = readFileSync(resolve(ROOT, 'js/checkin.js'), 'utf8');
    expect(checkin).toMatch(/typeof jsQR !== 'function'/);
    expect(checkin).toMatch(/function processQR\(/);
    const qr = readFileSync(resolve(ROOT, 'supabase/functions/_shared/qr.ts'), 'utf8');
    expect(qr).toMatch(/import QRCode from 'npm:qrcode@/);
    const token = readFileSync(resolve(ROOT, 'supabase/functions/_shared/qr_token.ts'), 'utf8');
    expect(token).toMatch(/export async function issueQrToken/);
  });
});

describe('言い回しの統一(2026-10-10)', () => {
  const pages = ['admin.html', 'judge.html', 'index.html', 'entry.html', 'my.html', 'join.html', 'checkin.html', 'conflict.html', 'question.html', 'entry_list.html', 'terms.html'];
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

  it('利用者に見える文言では、「プロジェクト」ではなく「大会」を使う(ヘルプ以外のページ)', () => {
    for (const page of pages) {
      const visible = read(page).replace(/<!--[\s\S]*?-->/g, '');
      expect(visible, page).not.toContain('プロジェクト');
    }
  });

  it('「再度」「ご確認ください」ではなく、「もう一度」「確認してください」にそろえる(画面・サーバーの文言)', () => {
    const targets = [
      ...readdirSync(new URL('../js', import.meta.url)).filter(n => n.endsWith('.js') && n !== 'icons.js').map(n => `js/${n}`),
      ...readdirSync(new URL('../supabase/functions', import.meta.url), { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== '_shared').map(d => `supabase/functions/${d.name}/index.ts`),
      'supabase/functions/_shared/email_address.ts',
    ];
    for (const file of targets) {
      let source;
      try { source = read(file); } catch (_) { continue; }
      expect(source, file).not.toContain('再度お試しください');
      expect(source, file).not.toContain('ご確認ください');
    }
  });
});
