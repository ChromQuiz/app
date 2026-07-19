// Security contract regression tests (offline / source-level).
//
// Locks in the participant-hash v1->v2 migration invariants (docs/security-migration-status.md,
// P2-e5) plus the sensitive-column restriction, so that a future code/migration edit that
// reintroduces a legacy dependency or drops a validation fails CI here.
//
// These are static source assertions (no network). Runtime enforcement is covered by
// tests/security_live.test.mjs (opt-in, CIQ_LIVE=1).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

describe('participant auth uses only peppered v2 hashes (P2-e5)', () => {
  const src = read('supabase/functions/_shared/participant_auth.ts');

  it('matches credentials against the v2 columns', () => {
    expect(src).toMatch(/\.eq\('email_hash_v2', emailHashV2\)/);
    expect(src).toMatch(/\.eq\('disclosure_password_hash_v2', passwordHashV2\)/);
  });

  it('derives v2 hashes server-side via pepperHash (never trusts client v2)', () => {
    expect(src).toMatch(/const emailHashV2 = await pepperHash\(emailHash\)/);
    expect(src).toMatch(/const passwordHashV2 = await pepperHash\(passwordHash\)/);
  });

  it('resolves the token path by entry id + project_id, not by a legacy hash', () => {
    expect(src).toMatch(/\.eq\('id', payload\.e\)/);
    expect(src).toMatch(/\.eq\('project_id', projectId\)/);
    expect(src).not.toMatch(/\.eq\('email_hash',\s*payload\.h\)/);
  });

  it('has no legacy v1 fallback lookup', () => {
    expect(src).not.toMatch(/legacyRows/);
    // v1 fallback was implemented as an `.or(...is.null)` query; it must stay removed.
    expect(src).not.toMatch(/\.or\([^)]*is\.null/);
  });
});

describe('entry creation writes only v2 hashes (P2-e5)', () => {
  for (const fn of ['create-entry', 'admin-create-entry']) {
    const src = read(`supabase/functions/${fn}/index.ts`);

    it(`${fn}: validates client hash format before use`, () => {
      expect(src).toMatch(/isClientHash\(emailHash\)/);
      expect(src).toMatch(/isClientHash\(disclosurePasswordHash\)/);
    });

    it(`${fn}: sends the v2 hashes to create_entry_atomic`, () => {
      expect(src).toMatch(/p_email_hash_v2:\s*emailHashV2/);
      expect(src).toMatch(/p_disclosure_password_hash_v2:\s*disclosurePasswordHashV2/);
    });

    it(`${fn}: does NOT send the legacy hash args to the RPC`, () => {
      expect(src).not.toMatch(/p_email_hash:\s/);
      expect(src).not.toMatch(/p_disclosure_password_hash:\s/);
    });
  }

  it('create-entry requires a verified-email token (public registration)', () => {
    const src = read('supabase/functions/create-entry/index.ts');
    expect(src).toMatch(/emailVerificationRequired\(\)/);
    expect(src).toMatch(/verifyEmailVerifiedToken\(/);
  });
});

describe('send-email verifies the recipient by server-derived v2 hash (P2-e5)', () => {
  const src = read('supabase/functions/send-email/index.ts');

  it('peppers the recipient address server-side and compares email_hash_v2', () => {
    expect(src).toMatch(/pepperHash\(recipientHash\)/);
    expect(src).toMatch(/email_hash_v2/);
  });

  it('does not depend on a caller-supplied expected hash', () => {
    expect(src).not.toMatch(/expectedEmailHash/);
    expect(src).not.toMatch(/data\.emailHash\b/);
  });
});

describe('legacy participant-hash columns are dropped in a migration (P2-e5)', () => {
  const drop = read('supabase/migrations/202607140005_drop_legacy_participant_hash_columns.sql');

  it('drops entries.email_hash and entries.disclosure_password_hash', () => {
    expect(drop).toMatch(/drop column email_hash/);
    expect(drop).toMatch(/drop column disclosure_password_hash/);
  });

  it('enforces NOT NULL on the v2 columns', () => {
    expect(drop).toMatch(/alter column email_hash_v2 set not null/);
    expect(drop).toMatch(/alter column disclosure_password_hash_v2 set not null/);
  });

  it('creates the v2 active-email unique index (uniqueness carried over to v2)', () => {
    const writes = read('supabase/migrations/202607140004_create_entry_atomic_v2_only_writes.sql');
    expect(writes).toMatch(/create unique index[^;]*entries_active_email_unique_v2_idx/);
  });
});

describe('Edge Function authorization gates stay in place', () => {
  const ADMIN_FNS = ['admin-create-entry', 'admin-entry-qr', 'project-key'];
  for (const fn of ADMIN_FNS) {
    const src = read(`supabase/functions/${fn}/index.ts`);
    it(`${fn}: requires an active owner/admin member`, () => {
      expect(src).toMatch(/requireAdminMember\(/);
      // owner/admin restriction — JS comparison or SQL `.in('role', [...])` form
      expect(src).toMatch(/role !== 'owner'|\.in\('role', \['owner', 'admin'\]\)/);
      // active-status restriction — either form
      expect(src).toMatch(/status !== 'active'|\.eq\('status', 'active'\)/);
    });
  }

  const PARTICIPANT_FNS = ['cancel-entry', 'disclose-result', 'edit-entry', 'mark-late', 'my-entry'];
  for (const fn of PARTICIPANT_FNS) {
    const src = read(`supabase/functions/${fn}/index.ts`);
    it(`${fn}: authenticates the participant via resolveParticipantAuth`, () => {
      expect(src).toMatch(/resolveParticipantAuth\(/);
    });
  }

  it('checkin-qr verifies the HMAC signature before serving', () => {
    const src = read('supabase/functions/checkin-qr/index.ts');
    expect(src).toMatch(/safeEqual\(expected, signature\)/);
  });

  it('check-in requires an authenticated, non-removed project member', () => {
    const src = read('supabase/functions/check-in/index.ts');
    expect(src).toMatch(/auth\.getUser\(/);
    expect(src).toMatch(/from\('project_members'\)/);
    expect(src).toMatch(/status === 'removed'/);
  });
});

describe('IP rate limiting is concurrency-safe (V4)', () => {
  it('enforceIpRateLimit uses the atomic rate_limit_hit RPC, not a raw count+insert', () => {
    const src = read('supabase/functions/_shared/rate_limit.ts');
    expect(src).toMatch(/\.rpc\('rate_limit_hit'/);
    // the racy "select count then insert" pattern must be gone
    expect(src).not.toMatch(/count:\s*'exact'/);
    expect(src).toMatch(/priorCount >= limit/);
  });

  it('rate_limit_hit serializes with an advisory lock and is service_role-only', () => {
    const mig = read('supabase/migrations/202607190001_rate_limit_atomic.sql');
    expect(mig).toMatch(/pg_advisory_xact_lock/);
    expect(mig).toMatch(/grant execute on function public\.rate_limit_hit[^;]*to service_role/);
    expect(mig).toMatch(/revoke all on function public\.rate_limit_hit[^;]*from public, anon, authenticated/);
  });

  it('send-email enforces a per-project daily email cap (V2 backstop)', () => {
    const rl = read('supabase/functions/_shared/rate_limit.ts');
    expect(rl).toMatch(/export async function enforceProjectDailyEmailCap/);
    expect(rl).toMatch(/p_bucket: 'email_daily'/);
    const se = read('supabase/functions/send-email/index.ts');
    expect(se).toMatch(/enforceProjectDailyEmailCap\(supabase, args\.projectId\)/);
  });
});

describe('Content-Security-Policy stays hardened on production pages', () => {
  const PAGES = [
    '404.html', 'admin.html', 'checkin.html', 'conflict.html', 'entry.html', 'entry_list.html',
    'help.html', 'index.html', 'judge.html', 'my.html', 'question.html', 'terms.html',
  ];
  for (const page of PAGES) {
    const html = read(page);
    it(`${page}: declares a CSP with no unsafe-inline / unsafe-eval`, () => {
      const csp = html.match(/http-equiv=["']Content-Security-Policy["'][^>]*content="([^"]+)"/i);
      expect(csp).toBeTruthy();
      expect(csp[1]).not.toMatch(/unsafe-inline/);
      expect(csp[1]).not.toMatch(/unsafe-eval/);
      expect(csp[1]).toMatch(/default-src 'self'/);
    });
  }
});

describe('RLS policy invariants', () => {
  it('project_private_keys is fully locked to direct access (using/check false)', () => {
    const src = read('supabase/migrations/202606290002_project_private_key_store.sql');
    expect(src).toMatch(/create policy project_private_keys_no_direct_access\s+on public\.project_private_keys for all\s+using \(false\)\s+with check \(false\)/);
  });

  it('entries has no direct INSERT policy (rows created only via the service-role RPC)', () => {
    // The RLS policy migration must not grant a direct INSERT path on entries; participant
    // creation goes through create_entry_atomic (service_role). A permissive insert policy
    // would let authenticated clients bypass the atomic waitlist/number logic.
    const rls = read('supabase/migrations/202606260002_rls_policies.sql');
    expect(rls).not.toMatch(/on public\.entries for insert/i);
  });
});

describe('public_entry_list exposes no PII or credential columns', () => {
  const src = read('supabase/migrations/202606260003_public_flow_hardening.sql');
  const block = src.match(/create table if not exists public\.public_entry_list \(([\s\S]*?)\);/);

  it('defines the public entry list table', () => {
    expect(block).toBeTruthy();
    // sanity: the intended public profile fields are present
    expect(block[1]).toMatch(/entry_name/);
    expect(block[1]).toMatch(/entry_number/);
  });

  it('never includes encrypted PII or credential hash columns', () => {
    const cols = block[1];
    expect(cols).not.toMatch(/encrypted_pii/);
    expect(cols).not.toMatch(/email_hash/);
    expect(cols).not.toMatch(/disclosure_password_hash/);
    // no raw email column either
    expect(cols).not.toMatch(/\bemail\b/);
  });
});

describe('sensitive entry columns are not granted to non-admin roles', () => {
  const restrict = read('supabase/migrations/202606270015_restrict_entry_sensitive_columns.sql');

  it('revokes blanket SELECT on entries from authenticated', () => {
    expect(restrict).toMatch(/revoke select on public\.entries from authenticated/);
  });

  it('re-grants only non-sensitive columns (no encrypted_pii / hash columns)', () => {
    // The column grant block must not expose PII or credential material.
    const grantBlock = restrict.match(/grant select \(([\s\S]*?)\) on public\.entries to authenticated/);
    expect(grantBlock).toBeTruthy();
    const cols = grantBlock[1];
    expect(cols).not.toMatch(/encrypted_pii/);
    expect(cols).not.toMatch(/email_hash/);
    expect(cols).not.toMatch(/disclosure_password_hash/);
  });
});
