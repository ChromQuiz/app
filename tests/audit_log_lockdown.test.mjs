// 監査ログの書き込みをサーバー側に限ったこと（202610050004）と、採点者のメニューから「要確認」を外したこと。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

describe('202610050004_lock_down_audit_logs', () => {
  const sql = read('supabase/migrations/202610050004_lock_down_audit_logs.sql');

  it('メンバーの直接 INSERT のポリシーを消す', () => {
    expect(sql).toMatch(/drop policy if exists audit_logs_insert_member on public\.audit_logs/);
  });

  it('anon / authenticated から書き込み系の権限を外す', () => {
    expect(sql).toMatch(/revoke insert, update, delete, truncate, references, trigger on public\.audit_logs from anon, authenticated/);
  });

  it('log_audit_event を service_role だけにする（大会を確認せず他の大会にも書けたため）', () => {
    expect(sql).toMatch(/revoke all on function public\.log_audit_event\([^)]*\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.log_audit_event\([^)]*\) to service_role/);
  });

  it('ブラウザのコードも Edge Function も log_audit_event や audit_logs を直接使っていない', () => {
    const files = ['js/supabase_api.js', 'js/admin.js', 'js/admin_settings.js', 'js/judge.js', 'js/question.js', 'js/conflict.js'];
    for (const f of files) expect(read(f), f).not.toMatch(/log_audit_event|from\('audit_logs'\)/);
  });
});

describe('採点者のメニュー', () => {
  it('「要確認」は管理者にだけ出す（解決できるのは管理者だけ）', () => {
    expect(read('judge.html')).toMatch(/class="u-hidden menu-item warn" id="admin-menu-conflict"/);
    const js = read('js/judge.js');
    expect(js).toMatch(/if \(scorerRole === 'admin'\) \{[\s\S]*admin-menu-conflict[\s\S]*\}/);
  });
});

describe('メニューの区切り線', () => {
  it('見出しの下には引かず、見えている項目の間にだけ引く（非表示の項目が間に挟まっても同じ）', () => {
    const css = read('css/design_system.css');
    expect(css).toMatch(/\.menu-section \.menu-item:not\(\.u-hidden\) ~ \.menu-item:not\(\.u-hidden\)/);
    expect(css).toMatch(/\.menu-section \.menu-item,\s*\.menu-footer \.menu-item \{\s*border-top-color: transparent;/);
  });
});
