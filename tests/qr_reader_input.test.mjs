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

const CODE = 'K7QF2MZ3BTWYX4NAD5HC';

describe('二次元コードリーダーの入力', () => {
  const { normalizeReaderCode, looksLikeCheckInCode } = loadReaderInput();

  it('受付コード(大文字の英字と 2〜7 の数字の 20 文字)を受け付ける。小文字でもよい', () => {
    expect(looksLikeCheckInCode(CODE)).toBe(true);
    expect(looksLikeCheckInCode(CODE.toLowerCase())).toBe(true);
  });

  it('形が違うものは、受け付けない（番号だけ・途中で切れたもの・別の文字列）', () => {
    const oldFormat = '3f2b8c1e-5a47-4d9e-8b21-0c6d9a7e1f34.a1b2c3d4e5f60718293a4b5c6d7e8f90';
    for (const bad of ['', '12', oldFormat, oldFormat.slice(0, 36), CODE.slice(1), `${CODE}A`, `${CODE.slice(1)}1`, `${CODE.slice(1)}0`, 'https://example.com']) {
      expect(looksLikeCheckInCode(bad)).toBe(false);
    }
  });

  it('リーダーが付ける改行や空白を取る', () => {
    expect(normalizeReaderCode(`${CODE}\r\n`)).toBe(CODE);
    expect(normalizeReaderCode(` ${CODE} `)).toBe(CODE);
  });

  it('日本語入力のまま打ち込まれた、全角の英数字を、半角に戻す', () => {
    const wide = CODE.replace(/[0-9A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
    expect(normalizeReaderCode(wide)).toBe(CODE);
    expect(looksLikeCheckInCode(normalizeReaderCode(wide))).toBe(true);
  });
});

function loadSerialReader() {
  const src = read('js/qr_serial_reader.js');
  const module = { exports: {} };
  return new Function('module', 'exports', 'globalThis', src + '; return module.exports;')(module, module.exports, globalThis);
}

describe('USBシリアル: 行の分け方', () => {
  const { splitReaderChunks } = loadSerialReader();

  it('改行(CR・LF・CRLF)で、1つの読み取りに分ける。改行の来ていない残りは、次に持ち越す', () => {
    expect(splitReaderChunks('', `${CODE}\r\n`)).toEqual({ lines: [CODE], rest: '' });
    expect(splitReaderChunks('', `${CODE}\r`)).toEqual({ lines: [CODE], rest: '' });
    expect(splitReaderChunks('', `${CODE}\n${CODE}`)).toEqual({ lines: [CODE], rest: CODE });
  });

  it('途中で切れて届いても、つなげて1つにする', () => {
    const first = splitReaderChunks('', CODE.slice(0, 20));
    expect(first).toEqual({ lines: [], rest: CODE.slice(0, 20) });
    expect(splitReaderChunks(first.rest, `${CODE.slice(20)}\r\n`)).toEqual({ lines: [CODE], rest: '' });
  });

  it('空の行は、読み取りにしない', () => {
    expect(splitReaderChunks('', '\r\n\r\n').lines).toEqual([]);
  });
});

describe('リーダー専用の受付画面（checkin_reader.html。カメラの画面とは別）', () => {
  const html = read('checkin_reader.html');
  const js = read('js/checkin_reader.js');

  it('カメラの部品を持たない（video・canvas・読み取りライブラリ・カメラ用のスクリプト）', () => {
    expect(html).not.toMatch(/<video|<canvas|id="camera-container"/);
    expect(html).not.toMatch(/jsqr/i);
    expect(html).not.toContain('js/checkin.js');
    expect(js).not.toMatch(/getUserMedia|jsQR/);
  });

  it('カメラの受付画面（checkin.html）には、リーダー用の部品を混ぜない', () => {
    expect(read('checkin.html')).not.toMatch(/reader/);
    expect(read('js/checkin.js')).not.toMatch(/reader/i);
  });

  it('署名付きの二次元コードだけを、同じ受付の経路（checkInEntry）へ送る。受付番号で受付する経路はない', () => {
    expect(js).toContain('CIQSupabaseAPI.checkInEntry(projectId, code)');
    expect(js).not.toMatch(/checkInEntryByNumber|checkInEntryManually|lookupEntryByNumber/);
    expect(html).not.toMatch(/name="entry-number"/);
  });

  it('形が違う読み取りは、サーバーに送らない。同じコードは、続けて受け付けない', () => {
    expect(js).toMatch(/if \(!reader\.looksLikeCheckInCode\(code\)\) \{[\s\S]*?return;\s*\}/);
    expect(js).toContain('REPEAT_BLOCK_MS');
  });

  it('キーボード入力とUSBシリアルの2つの入口が、同じ処理（handleCode）へ入る', () => {
    expect(js).toMatch(/submit = \(\) => \{[\s\S]*?handleCode\(value\);/);
    expect(js).toContain('onCode: handleCode');
  });

  it('参加者に見せるのは、読み取りの結果だけ。接続・通信速度・受付状況・直近の受付は、運営だけが開く設定の中に入れる（本体に出さない）', () => {
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    expect(main).not.toMatch(/reader-conn|reader-baud|reader-serial|reader-recent|checkin-tally|stat-checked|通信速度|直近の受付|USBシリアル/);
    const dialog = html.slice(html.indexOf('<dialog'), html.indexOf('</dialog>'));
    for (const id of ['checkin-tally', 'reader-keyboard-state', 'reader-serial-state', 'reader-baud', 'reader-serial-btn']) expect(dialog).toContain(`id="${id}"`);
    expect(html).not.toContain('id="stats-bar"');
    expect(js).not.toContain('addRecent');
  });

  it('読み取りが届かないときだけ、画面に警告を出す（普段は何も出さない）', () => {
    expect(html).toMatch(/id="reader-idle-warn"[^>]*hidden/);
    expect(js).toContain('setIdleWarning(');
  });

  it('運営画面の当日タブのボタンは、サイドバーと同じ名前・同じアイコン（カメラで当日受付／リーダーで当日受付）', () => {
    const html = read('admin.html');
    expect(html).toMatch(/class="btn" data-nav-target="checkin\.html"><span data-icon="qrcode"[^>]*><\/span> カメラで当日受付<\/button>/);
    expect(html).toMatch(/class="btn" data-nav-target="checkin_reader\.html"><span data-icon="scan-line"[^>]*><\/span> リーダーで当日受付<\/button>/);
  });
});

describe('サイドバー（メニュー）', () => {
  it('採点者を含め、運営の項目に、カメラとリーダーの2つの当日受付がある（運営画面・採点ボード）', () => {
    for (const page of ['admin.html', 'judge.html']) {
      const html = read(page);
      expect(html, page).toMatch(/data-nav-target="checkin\.html">\s*<span data-icon="qrcode"[^>]*><\/span> カメラで当日受付/);
      expect(html, page).toMatch(/data-nav-target="checkin_reader\.html">\s*<span data-icon="scan-line"[^>]*><\/span> リーダーで当日受付/);
    }
    // 管理者だけの項目ではない（u-hidden を付けない）
    expect(read('judge.html')).not.toMatch(/u-hidden menu-item[^>]*data-nav-target="checkin_reader\.html"/);
  });
});
