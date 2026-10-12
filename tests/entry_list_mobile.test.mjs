// エントリーリスト：参加者が書いた意気込みを、そのまま出す／スマホの1行リスト。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

describe('エントリーリスト', () => {
  const js = read('js/entry_list.js');
  const css = read('css/pages.css');

  it('意気込みは、参加者が書いたまま出す（エラー文に変換しない）', () => {
    // errorDetail は、空欄を「予期しないエラー…」に、英語を汎用のエラー文に変えてしまう
    expect(js).toMatch(/const \{ message: cheer = '' \} = e;\s*messageTd\.textContent = cheer \|\| '';/);
    expect(js).not.toMatch(/messageTd\.textContent = errorDetail/);
  });

  it('スマホでは、所属と学年を1行にまとめた欄を使う（広い画面では出さない）', () => {
    expect(js).toMatch(/metaTd\.textContent = \[e\.affiliation \|\| '', grade\]\.filter\(Boolean\)\.join\(' · '\)/);
    expect(css).toMatch(/\.entry-list-meta-cell \{\s*display: none;/);
    expect(css).toMatch(/"num name time"\s*"\.   meta meta"\s*"\.   msg  msg "/);
  });

  it('区切りの見出しは、意味の単位ごとに折り返す', () => {
    expect(js).toMatch(/appendDivider\(body, 'clock', \[`ここまで出場圏内\$\{capacityNote\}`, `— 以下キャンセル待ち/);
    expect(css).toMatch(/\.entry-list-divider-part \{\s*display: inline-block;/);
  });
});
