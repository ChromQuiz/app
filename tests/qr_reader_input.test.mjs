import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(__dirname, '..', p), 'utf8');

function loadReaderInput() {
  const src = read('js/qr_reader_input.js');
  const module = { exports: {} };
  return new Function('module', 'exports', 'globalThis', src + '; return module.exports;')(module, module.exports, globalThis);
}

const ID = '3f2b8c1e-5a47-4d9e-8b21-0c6d9a7e1f34';
const SIG = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const CODE = `${ID}.${SIG}`;

describe('二次元コードリーダーの入力', () => {
  const { normalizeReaderCode, looksLikeCheckInCode } = loadReaderInput();

  it('受付の二次元コードの形（現行・旧形式）を受け付ける。大文字でもよい', () => {
    expect(looksLikeCheckInCode(CODE)).toBe(true);
    expect(looksLikeCheckInCode(CODE.toUpperCase())).toBe(true);
    expect(looksLikeCheckInCode(`${ID}.1760000000000.${SIG}${SIG}`)).toBe(true);
  });

  it('形が違うものは、受け付けない（番号だけ・途中で切れたもの・別の文字列）', () => {
    for (const bad of ['', '12', ID, `${ID}.`, `${ID}.${SIG.slice(0, 10)}`, `${CODE}x`, 'https://example.com', `${ID}-${SIG}`]) {
      expect(looksLikeCheckInCode(bad)).toBe(false);
    }
  });

  it('リーダーが付ける改行や空白を取る', () => {
    expect(normalizeReaderCode(`${CODE}\r\n`)).toBe(CODE);
    expect(normalizeReaderCode(` ${CODE} `)).toBe(CODE);
  });

  it('日本語入力のまま打ち込まれた、ハイフン・ピリオド・全角の英数字を、半角に戻す', () => {
    const jp = CODE.replace(/-/g, 'ー').replace('.', '。');
    expect(normalizeReaderCode(jp)).toBe(CODE);
    const wide = CODE.toUpperCase().replace(/[0-9A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xFEE0)).replace(/-/g, '－').replace('.', '．');
    expect(looksLikeCheckInCode(normalizeReaderCode(wide))).toBe(true);
  });
});

describe('リーダー用の受付画面（カメラを使わない）', () => {
  const js = read('js/checkin.js');
  const html = read('checkin.html');

  it('?mode=reader のとき、カメラを起動せず、読み取りライブラリも要求しない', () => {
    expect(js).toContain("get('mode') === 'reader'");
    expect(js).toMatch(/if \(!readerMode && typeof jsQR !== 'function'\)/);
    expect(js).toMatch(/if \(readerMode\) startReader\(\);\s*else await startCamera\(\);/);
  });

  it('リーダー用の入力欄は、署名付きの二次元コードだけを、同じ受付の経路（checkInEntry）へ送る', () => {
    expect(js).toContain('looksLikeCheckInCode(code)');
    expect(js).toContain('processQR(code)');
    expect(js).toMatch(/CIQSupabaseAPI\.checkInEntry\(projectId, qrValue\)/);
    expect(html).not.toMatch(/name="entry-number"/);
  });

  it('同じコードは、続けて受け付けない。読み間違いは、サーバーに送らない', () => {
    expect(js).toContain('READER_REPEAT_MS');
    expect(js).toMatch(/if \(!reader\.looksLikeCheckInCode\(code\)\) \{[\s\S]*?return;\s*\}/);
  });

  it('運営画面の当日タブから、リーダー用の受付画面を開ける', () => {
    expect(read('admin.html')).toContain('data-nav-target="checkin.html?mode=reader"');
  });
});
