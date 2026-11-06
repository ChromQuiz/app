// 共有時の画像(リンクカード): 入力チェック、公開ページのタグ、保存先の権限
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function loadUploadValidation() {
  const src = read('js/upload_validation.js');
  const module = { exports: {} };
  const fn = new Function('module', 'exports', 'globalThis', src + '; return module.exports;');
  return fn(module, module.exports, globalThis);
}

const v = loadUploadValidation();
const PNG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const JPEG = [0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46];
const fileOf = (bytes, size) => {
  const body = new Uint8Array(Math.max(size ?? bytes.length, bytes.length));
  body.set(bytes);
  return new Blob([body]);
};

describe('共有時の画像の入力チェック', () => {
  it('JPEG と PNG を受け付け、それ以外は断る', async () => {
    expect((await v.validateCardImageFile(fileOf(JPEG))).ok).toBe(true);
    expect((await v.validateCardImageFile(fileOf(PNG))).ok).toBe(true);
    expect((await v.validateCardImageFile(fileOf([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0]))).ok).toBe(false);
    expect((await v.validateCardImageFile(new Blob([]))).ok).toBe(false);
    expect((await v.validateCardImageFile(null)).ok).toBe(false);
  });

  it('5 MB を超える画像を断る', async () => {
    const r = await v.validateCardImageFile(fileOf(PNG, v.CARD_IMAGE_MAX_BYTES + 1));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('大きすぎます');
  });

  it('1200×630 前後の比率だけを受け付け、断るときは求めるサイズを示す', () => {
    expect(v.validateCardImageDimensions(1200, 630).ok).toBe(true);
    expect(v.validateCardImageDimensions(2400, 1260).ok).toBe(true);
    expect(v.validateCardImageDimensions(1200, 628).ok).toBe(true);
    const square = v.validateCardImageDimensions(1024, 1024);
    expect(square.ok).toBe(false);
    expect(square.message).toContain('1200×630ピクセル');
    const tiny = v.validateCardImageDimensions(400, 210);
    expect(tiny.ok).toBe(false);
    expect(tiny.message).toContain('小さすぎます');
    expect(v.validateCardImageDimensions(0, 0).ok).toBe(false);
  });

  it('大きい画像は横 1200 に縮め、小さい画像は拡大しない', () => {
    expect(v.cardOutputSize(2400, 1260)).toEqual({ width: 1200, height: 630 });
    expect(v.cardOutputSize(800, 420)).toEqual({ width: 800, height: 420 });
  });
});

describe('公開ページのカード用タグ', () => {
  const IMG = 'https://chxuitjfanbagbzwpjyi.supabase.co/storage/v1/object/public/site-card/card.jpg';
  for (const page of ['index.html', 'entry.html', 'entry_list.html', 'terms.html', 'my.html', 'help.html']) {
    it(`${page} に共通の画像と大きいカードの指定がある`, () => {
      const html = read(page);
      expect(html).toContain(`<meta property="og:image" content="${IMG}">`);
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    });
  }

  it('どのページにも「解答採点プラットフォーム」のカード文言が残っていない', () => {
    for (const page of ['index.html', 'entry.html', 'entry_list.html', 'terms.html', 'my.html', 'conflict.html', 'question.html']) {
      expect(read(page), page).not.toContain('解答採点プラットフォーム');
    }
  });
});

describe('共有時の画像の保存先', () => {
  const sql = read('supabase/migrations/202611060001_site_card_image.sql');

  it('card.jpg の1ファイルだけを、大会の所有者・管理者が書き込める', () => {
    expect(sql).toMatch(/'site-card', 'site-card', true, 5242880, array\['image\/jpeg'\]/);
    const writePolicies = sql.match(/for (insert|update)[\s\S]*?;/g) || [];
    expect(writePolicies.length).toBe(2);
    for (const p of writePolicies) {
      expect(p).toContain("name = 'card.jpg'");
      expect(p).toContain('public.is_any_project_admin()');
    }
    expect(sql).toMatch(/pm\.role = any\(array\['owner', 'admin'\]\)/);
    expect(sql).not.toMatch(/for (delete|all)/);
  });

  it('答案画像のバケットには触れない', () => {
    expect(sql).not.toMatch(/insert into storage\.buckets[^;]*answer-/);
  });
});
