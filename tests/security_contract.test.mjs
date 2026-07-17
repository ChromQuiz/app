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
