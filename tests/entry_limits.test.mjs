// 入力の長さの制限（登録・編集・代理登録）と、カナの入力の整え。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ENTRY_LIMITS, validateEntryInput } from '../supabase/functions/_shared/entry_profile.ts';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

describe('validateEntryInput', () => {
  const ok = { entryName: 'やま', affiliation: '開成高', grade: '２年', message: 'がんばります', inquiry: '' };

  it('ふつうの入力と、空・未指定は通す', () => {
    expect(validateEntryInput(ok, 'x'.repeat(900))).toBeNull();
    expect(validateEntryInput({}, 'x')).toBeNull();
    expect(validateEntryInput(null, 'x')).toBeNull();
    expect(validateEntryInput({ message: null, inquiry: undefined }, 'x')).toBeNull();
  });

  it('上限ちょうどは通り、超えると項目名つきの日本語で断る', () => {
    expect(validateEntryInput({ entryName: 'あ'.repeat(ENTRY_LIMITS.entryName) }, 'x')).toBeNull();
    expect(validateEntryInput({ entryName: 'あ'.repeat(ENTRY_LIMITS.entryName + 1) }, 'x')).toBe('エントリーネームは40文字以内で入力してください。');
    expect(validateEntryInput({ affiliation: 'あ'.repeat(61) }, 'x')).toBe('所属教育機関は60文字以内で入力してください。');
    expect(validateEntryInput({ message: 'あ'.repeat(201) }, 'x')).toBe('意気込みは200文字以内で入力してください。');
    expect(validateEntryInput({ inquiry: 'あ'.repeat(1001) }, 'x')).toBe('運営への連絡は1000文字以内で入力してください。');
    expect(validateEntryInput({ grade: 'あ'.repeat(11) }, 'x')).toBe('学年は10文字以内で入力してください。');
  });

  it('文字数は、絵文字などの2単位の文字も1文字として数える', () => {
    expect(validateEntryInput({ entryName: '😀'.repeat(40) }, 'x')).toBeNull();
    expect(validateEntryInput({ entryName: '😀'.repeat(41) }, 'x')).not.toBeNull();
  });

  it('文字列でない値と、大きすぎる暗号化データは断る', () => {
    expect(validateEntryInput({ message: { a: 1 } }, 'x')).toMatch(/形式が正しくありません/);
    expect(validateEntryInput({ message: 123 }, 'x')).toMatch(/形式が正しくありません/);
    expect(validateEntryInput({}, 'x'.repeat(ENTRY_LIMITS.encryptedPii + 1))).toMatch(/大きすぎます/);
  });

  it('いまのデータの最大（エントリーネーム8・所属6・意気込み14・連絡14）に余裕がある', () => {
    expect(ENTRY_LIMITS.entryName).toBeGreaterThan(8 * 3);
    expect(ENTRY_LIMITS.affiliation).toBeGreaterThan(6 * 3);
    expect(ENTRY_LIMITS.message).toBeGreaterThan(14 * 3);
    expect(ENTRY_LIMITS.inquiry).toBeGreaterThan(14 * 3);
  });
});

describe('呼び出し元と入力欄', () => {
  it('登録・編集・代理登録が、同じ検証を使う', () => {
    for (const fn of ['create-entry', 'edit-entry', 'admin-create-entry']) {
      expect(read(`supabase/functions/${fn}/index.ts`), fn).toMatch(/validateEntryInput\(publicProfile, encryptedPii\)/);
    }
  });

  it('代理登録は、管理者の確認のあとに検証する', () => {
    const src = read('supabase/functions/admin-create-entry/index.ts');
    expect(src.indexOf('requireAdminMember(supabase, req, projectId)')).toBeLessThan(src.indexOf('validateEntryInput('));
  });

  it('入力欄の maxlength が、サーバーの上限と同じ', () => {
    const expected = { 'entry-name': 40, affiliation: 60, message: 200, inquiry: 1000 };
    for (const [file, prefix] of [['entry.html', 'f-'], ['my.html', 'e-']]) {
      const html = read(file);
      for (const [key, max] of Object.entries(expected)) {
        expect(html, `${file} ${prefix}${key}`).toMatch(new RegExp(`id="${prefix}${key}" maxlength="${max}"`));
      }
    }
    expect(read('admin.html')).toMatch(/id="admin-entry-entry-name" maxlength="40"/);
    expect(read('admin.html')).toMatch(/id="admin-entry-inquiry" maxlength="1000"/);
  });
});

describe('normalizeKanaInput', () => {
  const src = read('js/shared.js');
  const start = src.indexOf('function normalizeKanaInput(');
  const end = src.indexOf('\n}\n', start) + 2;
  const normalizeKanaInput = new Function(`${src.slice(start, end)}\nreturn normalizeKanaInput;`)();

  it('半角カナ・ひらがな・空白を整える', () => {
    expect(normalizeKanaInput('ﾔﾏﾀﾞ')).toBe('ヤマダ');
    expect(normalizeKanaInput('やまだ')).toBe('ヤマダ');
    expect(normalizeKanaInput('ヤマダ ')).toBe('ヤマダ');
    expect(normalizeKanaInput(' ヤ　マ ダ ')).toBe('ヤマダ');
    expect(normalizeKanaInput('ヤマダー')).toBe('ヤマダー');
    expect(normalizeKanaInput('ゔ')).toBe('ヴ');
    expect(normalizeKanaInput(null)).toBe('');
  });

  it('整えた結果は、検証の形（全角カタカナと長音）に通る。漢字や英字は残るので弾かれる', () => {
    const re = /^[ァ-ヴー]+$/;
    for (const v of ['ﾔﾏﾀﾞ', 'やまだ', 'ヤマダ ', 'ﾀﾛｳ']) expect(re.test(normalizeKanaInput(v)), v).toBe(true);
    for (const v of ['山田', 'Yamada', '123']) expect(re.test(normalizeKanaInput(v)), v).toBe(false);
  });

  it('カナの欄は、入力を離れたときに整える（エントリー・マイエントリー・代理登録で共通）', () => {
    expect(src).toMatch(/document\.addEventListener\('change'/);
    expect(src).toMatch(/getAttribute\('pattern'\) === '\^\[ァ-ヴー\]\+\$'/);
  });
});
