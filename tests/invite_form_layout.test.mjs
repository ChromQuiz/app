// 採点者招待：並びをそろえ、使えない招待には無効化ボタンを出さず、行の高さを一定にする。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

describe('採点者招待', () => {
  const js = read('js/admin_settings.js');
  const css = read('css/pages.css');

  it('無効化ボタンは、まだ使える招待にだけ出す（期限切れ・上限到達・無効化済みには出さない）', () => {
    expect(js).toMatch(/if \(state\.className === 'is-active'\) \{/);
  });

  it('発行時の通知に、括弧書きを使わない', () => {
    expect(js).toContain("'招待リンクを発行しました。この場でコピーしてください。再表示できません。'");
  });

  it('固定の値は、入力欄と同じ高さで中央にそろえ、見出しの余白を消して、横一列にそろえる', () => {
    expect(css).toMatch(/\.invite-fixed-value \{\s*display: flex;\s*align-items: center;\s*min-height: var\(--control-h\);/);
    expect(css).toMatch(/\.invite-field input \{\s*max-width: 120px;\s*height: var\(--control-h\);/);
    expect(css).toMatch(/\.invite-fixed-label \{\s*margin: 0;/);
  });

  it('一覧の行は、ボタンの有無で高さが変わらない', () => {
    expect(css).toMatch(/#invite-tbody td \{[\s\S]*?height: calc\(var\(--control-h-sm\) \+ 22px\);[\s\S]*?white-space: nowrap;/);
    expect(css).toMatch(/\.invite-action-cell \.btn \{\s*height: var\(--control-h-sm\);/);
  });
});

describe('メンバー管理', () => {
  const js = read('js/admin_settings.js');
  const css = read('css/pages.css');

  it('押せない操作は出さない（所有者・自分の行には、ボタンを置かない）', () => {
    expect(js).toMatch(/\} else if \(canChange\) \{/);
    expect(js).not.toMatch(/disabled: !canChange/);
  });

  it('行の高さは、ボタンの有無で変わらない。外したメンバーには取り消し線を引かない', () => {
    expect(css).toMatch(/#project-members-tbody td \{[\s\S]*?height: calc\(var\(--control-h-sm\) \+ 22px\);/);
    expect(css).toMatch(/#project-members-tbody \.member-row-removed td \{\s*text-decoration: none;/);
  });
});
