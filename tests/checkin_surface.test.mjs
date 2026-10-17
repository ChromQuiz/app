// 当日受付の攻撃面に関する回帰テスト(オフライン / ソースレベル)。
//
// 背景: checkin.html は「参加者が画面にQRをかざす」前提のレイアウトで、受付卓の端末は
// 参加者の目の前に置かれる。一方 entry_number は public_entry_list 経由で anon に公開されている
// (checked_in も含む)ため、「受付番号を知っていること」は認証材料にならない。
// したがって番号だけで受付状態を書き換えられる操作を参加者向け画面に置いてはならない。
//
// 実行時の強制は tests/security_live.test.mjs 側(CIQ_LIVE=1)の担当。ここは静的な契約のみ。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

const edge = read('supabase/functions/check-in/index.ts');

describe('参加者に向いた受付画面には番号入力を置かない', () => {
  const html = read('checkin.html');
  const js = read('js/checkin.js');

  it('checkin.html に受付番号の入力欄がない', () => {
    expect(html).not.toMatch(/id="manual-number"/);
    expect(html).not.toMatch(/id="manual-form"/);
    expect(html).not.toMatch(/<input[^>]*name="entry-number"/);
  });

  it('checkin.js が受付番号での受付を呼ばない', () => {
    expect(js).not.toMatch(/checkInEntryByNumber/);
    expect(js).not.toMatch(/checkInEntryManually/);
    expect(js).not.toMatch(/lookupEntryByNumber/);
  });

  it('checkin.js は署名付きQR経路だけを使う', () => {
    expect(js).toMatch(/CIQSupabaseAPI\.checkInEntry\(projectId, qrValue\)/);
  });
});

describe('check アクションは受付コードのみ受け付ける (V8)', () => {
  it('entryNumber では受付できない', () => {
    // check 分岐の中で entryNumber を使っていないこと(番号フォールバックの復活を防ぐ)。
    const checkBranch = edge.slice(
      edge.indexOf("if (action === 'check')"),
      edge.indexOf("if (action === 'lookup')"),
    );
    expect(checkBranch.length).toBeGreaterThan(0);
    expect(checkBranch).not.toMatch(/entryNumber/);
    expect(checkBranch).toMatch(/normalizeCheckinCode\(scanned\)/);
    expect(checkBranch).toMatch(/const \[tokenHash, actorIpHash\] = await Promise\.all\(\[hashCheckinCode\(code\)/);
    // 権限・照会・更新・監査は SQL 関数 1 回で行い、Auth の確認(ユーザー ID)を必ず先に取る
    expect(checkBranch).toMatch(/authenticatedUserId\(supabase, req\)/);
    expect(checkBranch).toMatch(/rpc\('check_in_by_code', \{[^}]*p_user_id: userId[^}]*p_token_hash: tokenHash/);
    expect(checkBranch).toMatch(/result === 'forbidden'\) throw new Error\('Forbidden'\)/);
  });

  it('形が違うコードは受け付けない(DB を引かない)', () => {
    expect(edge).toMatch(/if \(!code\)/);
    // 受付コードの照会は、entries.id ではなくハッシュで行う
    expect(edge).toMatch(/query\.eq\('checkin_token_hash', by\.tokenHash\)/);
  });
});

describe('番号起点の操作は運営(owner/admin)限定', () => {
  it('STAFF_ONLY_ROLES に scorer を含めない', () => {
    expect(edge).toMatch(/const STAFF_ONLY_ROLES: Role\[\] = \['owner', 'admin'\]/);
  });

  it('lookup / check_manual / undo が STAFF_ONLY_ROLES で認可される', () => {
    const staffBranches = edge.slice(edge.indexOf("if (action === 'lookup')"));
    const guards = staffBranches.match(/requireProjectMember\([^)]*STAFF_ONLY_ROLES\)/g) || [];
    expect(guards.length).toBe(2); // lookup と (check_manual | undo) の2箇所
    expect(staffBranches).not.toMatch(/DESK_ROLES/);
  });

  it('ロール判定は allowlist であり、否定形ではない', () => {
    expect(edge).toMatch(/if \(!allowedRoles\.includes\(member\.role as Role\)\) throw new Error\('Forbidden'\)/);
    expect(edge).toMatch(/member\.status !== 'active'/);
  });
});

describe('手入力は照会を経ないと確定できない', () => {
  it('confirmedEntryId が無ければ拒否する', () => {
    expect(edge).toMatch(/if \(!confirmedEntryId\)/);
  });

  it('照会結果の id と一致しなければ確定させない', () => {
    expect(edge).toMatch(/String\(entry\.id\) !== String\(confirmedEntryId\)/);
  });

  it('lookup は状態を書き換えない', () => {
    const lookupBranch = edge.slice(
      edge.indexOf("if (action === 'lookup')"),
      edge.indexOf("if (action === 'check_manual' || action === 'undo')"),
    );
    expect(lookupBranch.length).toBeGreaterThan(0);
    expect(lookupBranch).not.toMatch(/\.update\(/);
  });
});

describe('受付の取り消しは運営操作として監査される', () => {
  it('checked_in を戻す唯一の経路が監査ログを残す', () => {
    expect(edge).toMatch(/\.update\(\{ checked_in: false \}\)/);
    expect(edge).toMatch(/action: 'entry\.checkin\.undo'/);
    expect(edge).toMatch(/afterData: \{ checked_in: false \}/);
  });

  it('取り消しは条件付き UPDATE で行う(二重取り消しを防ぐ)', () => {
    expect(edge).toMatch(/\.eq\('checked_in', true\)/);
  });
});

describe('当日の運用を止めないレート制限設計', () => {
  it('制限対象は「見つからない照会」だけで、成功した受付は数えない', () => {
    expect(edge).toMatch(/bucket: 'checkin_miss'/);
    const buckets = edge.match(/bucket: '[^']+'/g) || [];
    expect(new Set(buckets)).toEqual(new Set(["bucket: 'checkin_miss'"]));
  });
});

describe('SQL 関数 check_in_by_code の約束', () => {
  const sql = readFileSync(resolve(import.meta.dirname, '../supabase/migrations/202610170001_check_in_by_code.sql'), 'utf8');

  it('security definer で、service_role だけが実行できる(anon / authenticated は不可)', () => {
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = public/);
    expect(sql).toMatch(/revoke all on function public\.check_in_by_code\(text, uuid, text, text\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.check_in_by_code\(text, uuid, text, text\) to service_role/);
    expect(sql).not.toMatch(/to (anon|authenticated|public)/);
  });

  it('権限(有効なメンバー・3つの役割)と、大会で絞った照会と、条件つき更新を持つ', () => {
    expect(sql).toMatch(/pm\.status = 'active'/);
    expect(sql).toMatch(/pm\.role in \('owner', 'admin', 'scorer'\)/);
    expect(sql).toMatch(/e\.project_id = p_project_id\s+and e\.checkin_token_hash = p_token_hash/);
    expect(sql).toMatch(/e\.checked_in = false\s+and e\.status in \('registered', 'late'\)/);
  });
});
