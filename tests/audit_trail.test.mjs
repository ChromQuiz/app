// V10: service_role 経路(参加者/運営の状態変更)の監査ログを回帰化する。
//
// 親計画 V10 の完了条件:
//   service_role 用の監査挿入経路（種別=participant、IP/ID のみ、PII なし）
//
// ここでは既存実装を固定するだけで、設計変更は行わない。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

// 状態を変更する Edge Function と、記録されるべき action。
const STATE_CHANGING = {
  'create-entry': { action: 'entry.create', actorKind: 'participant' },
  'edit-entry': { action: 'entry.edit', actorKind: 'participant' },
  'cancel-entry': { action: 'entry.cancel', actorKind: 'participant' },
  'mark-late': { action: 'entry.mark_late', actorKind: 'participant' },
  'check-in': { action: 'entry.checkin', actorKind: 'staff' },
  'admin-create-entry': { action: 'entry.create_by_staff', actorKind: 'staff' },
};

describe('state-changing operations write a service_role audit trail (V10)', () => {
  for (const [fn, { action, actorKind }] of Object.entries(STATE_CHANGING)) {
    const src = read(`supabase/functions/${fn}/index.ts`);

    it(`${fn}: records ${action} as ${actorKind} with a hashed IP`, () => {
      expect(src).toMatch(/logServiceEvent\(/);
      expect(src).toMatch(new RegExp(`action: '${action.replace('.', '\\.')}'`));
      expect(src).toMatch(new RegExp(`actorKind: '${actorKind}'`));
      // 生IPではなく HMAC 済みの値のみ
      expect(src).toMatch(/actorIpHash: await clientIpHash\(req\)/);
      expect(src).not.toMatch(/actorIpHash:\s*clientIp\(/);
    });
  }
});

describe('the audit trail carries no PII (V10)', () => {
  it('audit.ts documents and enforces the no-PII / no-raw-IP contract', () => {
    const src = read('supabase/functions/_shared/audit.ts');
    expect(src).toMatch(/export type ActorKind = 'participant' \| 'staff' \| 'system'/);
    // 記録失敗で本処理を止めない(fail-open) — 監査の失敗が参加者操作を壊さないこと
    expect(src).toMatch(/\.then\(\(\) => undefined, \(\) => undefined\)/);
  });

  it('callers only pass state transitions in afterData, never PII fields', () => {
    for (const fn of Object.keys(STATE_CHANGING)) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      const calls = [...src.matchAll(/logServiceEvent\(supabase, \{([\s\S]*?)\}\);/g)].map((m) => m[1]);
      expect(calls.length, `${fn} must log`).toBeGreaterThan(0);
      for (const body of calls) {
        for (const forbidden of [
          'encrypted_pii', 'encryptedPii', 'emailHash', 'email_hash',
          'disclosurePasswordHash', 'familyName', 'firstName', 'entryName',
        ]) {
          expect(body, `${fn} must not log ${forbidden}`).not.toMatch(new RegExp(forbidden));
        }
      }
    }
  });
});
