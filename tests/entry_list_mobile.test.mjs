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
    expect(js).toMatch(/setInlineParts\(metaTd, \[e\.affiliation \|\| '', grade\]\)/);
    expect(css).toMatch(/\.entry-list-meta-cell \{\s*display: none;/);
    expect(css).toMatch(/"num name time"\s*"\.   meta meta"\s*"\.   msg  msg "/);
  });

  it('区切りは、見出し・補足・人数を別々の要素に置く（記号でつながない）', () => {
    expect(js).toMatch(/appendDivider\(body, 'map-pin', '中部地方', 'entry-list-divider-rule', '開始24時間以内'\)/);
    expect(js).toMatch(/appendDivider\(body, 'clock', 'キャンセル待ち', 'entry-list-divider-warning', '', `\$\{waitlistCount\}名`\)/);
    expect(css).toMatch(/\.entry-list-divider-note \{\s*display: block;/);
  });
});
