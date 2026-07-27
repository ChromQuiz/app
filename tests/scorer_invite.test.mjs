// AB-1: 採点者の参加方式を「招待リンク」へ置き換えたことを回帰化する。
//
// 監査項目:
//   1 招待リンクなしでは参加できない / 2 期限切れ拒否 / 3 revoked 拒否 / 4 上限で拒否
//   5 並列でも max_uses を超えない / 6 トークン平文を DB 保存しない / 7 token_hash をクライアントへ出さない
//   8 招待URL再利用 / 9 監査ログ / 10 回帰テスト（本ファイル）

import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const MIGRATION = read('supabase/migrations/202607270001_scorer_invite_links.sql');

let generateInviteToken, inviteTokenHash, isPlausibleInviteToken;

beforeAll(async () => {
  globalThis.Deno = { env: { get: (k) => (k === 'CIQ_EMAIL_SIGNING_SECRET' ? 'test-signing-secret-0123456789abcdef' : undefined) } };
  ({ generateInviteToken, inviteTokenHash, isPlausibleInviteToken } =
    await import('../supabase/functions/_shared/invite_token.ts'));
});

describe('invite tokens are CSPRNG and never stored in plaintext (AB-1)', () => {
  it('generates a 256-bit base64url token', () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);   // 32 bytes -> 43 chars
    expect(generateInviteToken()).not.toBe(token);  // 毎回異なる
  });

  it('hashes the token with a purpose tag, and the hash is not the token', async () => {
    const token = generateInviteToken();
    const hash = await inviteTokenHash(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    // 同じトークンは同じハッシュ、違うトークンは違うハッシュ
    expect(await inviteTokenHash(token)).toBe(hash);
    expect(await inviteTokenHash(generateInviteToken())).not.toBe(hash);
    expect(read('supabase/functions/_shared/invite_token.ts')).toMatch(/`invite:\$\{token\}`/);
  });

  it('rejects implausible tokens before hitting the database', () => {
    expect(isPlausibleInviteToken(generateInviteToken())).toBe(true);
    for (const bad of ['', 'short', null, undefined, 42, 'has space', 'a'.repeat(200), "';drop--"]) {
      expect(isPlausibleInviteToken(bad)).toBe(false);
    }
  });

  it('the Edge function only ever returns the plaintext token at creation', () => {
    const src = read('supabase/functions/create-scorer-invite/index.ts');
    expect(src).toMatch(/const token = generateInviteToken\(\)/);
    expect(src).toMatch(/const tokenHash = await inviteTokenHash\(token\)/);
    expect(src).toMatch(/p_token_hash: tokenHash/);
    // 平文が DB へ渡らないこと
    expect(src).not.toMatch(/p_token:\s*token/);
  });
});

describe('the invite schema stores only hashes and hides them from clients (AB-1)', () => {
  it('stores token_hash, never a plaintext token column', () => {
    expect(MIGRATION).toMatch(/token_hash text not null unique/);
    expect(MIGRATION).not.toMatch(/token text/);
  });

  it('grants clients every column except token_hash', () => {
    const grant = MIGRATION.match(/grant select \(([\s\S]*?)\) on public\.project_invites to authenticated/);
    expect(grant).toBeTruthy();
    expect(grant[1]).not.toMatch(/token_hash/);
    expect(MIGRATION).toMatch(/revoke all on public\.project_invites from anon, authenticated/);
  });

  it('restricts invite reads to owner/admin via RLS', () => {
    expect(MIGRATION).toMatch(/create policy project_invites_select_admin[\s\S]*?has_project_role\(project_id, array\['owner', 'admin'\]\)/);
  });

  it('keeps the redeem/create RPCs service_role-only', () => {
    for (const fn of ['create_scorer_invite', 'redeem_scorer_invite']) {
      expect(MIGRATION).toMatch(new RegExp(`grant execute on function public\\.${fn}[^;]*to service_role`));
      expect(MIGRATION).toMatch(new RegExp(`revoke all on function public\\.${fn}[^;]*from public, anon, authenticated`));
    }
  });

  it('the client never selects token_hash', () => {
    const api = read('js/supabase_api.js');
    const listing = api.slice(api.indexOf('async listScorerInvites'), api.indexOf('async revokeScorerInvite'));
    expect(listing).toMatch(/from\('project_invites'\)/);
    expect(listing).not.toMatch(/token_hash/);
  });
});

describe('redeeming enforces expiry, revocation and the use limit atomically (AB-1)', () => {
  it('fixes the 7-day expiry and the scorer role server-side', () => {
    expect(MIGRATION).toMatch(/now\(\) \+ interval '7 days'/);
    expect(MIGRATION).toMatch(/values \(v_invite\.project_id, p_user_id, 'scorer', v_name\)/);
  });

  it('increments use_count with a conditional UPDATE (concurrency safe)', () => {
    const redeem = MIGRATION.slice(MIGRATION.indexOf('function public.redeem_scorer_invite'));
    expect(redeem).toMatch(/set use_count = use_count \+ 1/);
    expect(redeem).toMatch(/revoked_at is null/);
    expect(redeem).toMatch(/expires_at > now\(\)/);
    expect(redeem).toMatch(/use_count < project_invites\.max_uses/);
    expect(redeem).toMatch(/get diagnostics v_updated = row_count/);
  });

  it('distinguishes revoked / expired / exhausted failures', () => {
    for (const reason of ['Invite revoked', 'Invite expired', 'Invite exhausted', 'Invalid invite']) {
      expect(MIGRATION).toContain(reason);
    }
  });

  it('does not consume a use when the caller is already a member (link re-use)', () => {
    const redeem = MIGRATION.slice(MIGRATION.indexOf('function public.redeem_scorer_invite'));
    const beforeUpdate = redeem.slice(0, redeem.indexOf('set use_count = use_count + 1'));
    expect(beforeUpdate).toMatch(/return query select v_invite\.project_id, v_member\.role, v_member\.display_name, true/);
  });

  it('caps max_uses and requires a plausible hash on creation', () => {
    expect(MIGRATION).toMatch(/greatest\(1, least\(coalesce\(p_max_uses, 20\), 500\)\)/);
    expect(MIGRATION).toMatch(/length\(p_token_hash\) < 32/);
  });
});

describe('the legacy scorer access code is fully removed (AB-1)', () => {
  it('drops the column and the join RPC in the migration', () => {
    expect(MIGRATION).toMatch(/drop function if exists public\.join_project_with_scorer_code/);
    expect(MIGRATION).toMatch(/alter table public\.projects drop column if exists scorer_access_code_hash/);
  });

  it('leaves no trace in the client code or markup', () => {
    for (const file of ['js/index.js', 'js/supabase_api.js', 'index.html']) {
      const src = read(file);
      expect(src, `${file}`).not.toMatch(/scorer_access_code_hash|scorerAccessCodeHash/);
      expect(src, `${file}`).not.toMatch(/joinProjectWithScorerCode|join-scorer-code/);
    }
  });
});

describe('the join page and audit trail exist (AB-1)', () => {
  it('ships a join page wired to the redeem endpoint', () => {
    expect(existsSync(resolve(ROOT, 'join.html'))).toBe(true);
    const js = read('js/join.js');
    expect(js).toMatch(/CIQSupabaseAPI\.redeemScorerInvite/);
    // 判定はサーバ側。クライアントで有効期限などを判断しない
    expect(js).not.toMatch(/expires_at|max_uses|use_count/);
  });

  it('records invite creation and redemption in the audit log', () => {
    expect(read('supabase/functions/create-scorer-invite/index.ts')).toMatch(/action: 'scorer_invite\.create'/);
    expect(read('supabase/functions/redeem-scorer-invite/index.ts')).toMatch(/action: 'scorer_invite\.redeem'/);
  });

  it('requires an authenticated admin to create and a signed-in user to redeem', () => {
    expect(read('supabase/functions/create-scorer-invite/index.ts')).toMatch(/requireAdminMember\(/);
    const redeem = read('supabase/functions/redeem-scorer-invite/index.ts');
    expect(redeem).toMatch(/auth\.getUser\(jwt\)/);
    expect(redeem).toMatch(/Googleログインが必要です/);
  });
});
