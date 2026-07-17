// Live RLS / grant regression tests (opt-in, read-only).
//
// Exercises the anon (publishable) key against the live PostgREST endpoint to confirm that
// unauthenticated callers cannot read private tables or sensitive participant columns, and
// that the public entry list stays PII-free. Read-only: only issues GET requests, never writes.
//
// Skipped by default so `vitest run` stays offline/deterministic. Enable with:
//   CIQ_LIVE=1 npm test
// Uses the publishable key from js/supabase_config.js (public by design).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const cfg = readFileSync(resolve(ROOT, 'js/supabase_config.js'), 'utf8');
const URL = cfg.match(/url:\s*'([^']+)'/)?.[1];
const KEY = cfg.match(/publishableKey:\s*'([^']+)'/)?.[1];

const LIVE = process.env.CIQ_LIVE === '1';

async function anonGet(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  let body;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

describe.skipIf(!LIVE)('live RLS / grant enforcement (anon, read-only)', () => {
  it('has config (url + publishable key)', () => {
    expect(URL).toMatch(/^https:\/\//);
    expect(KEY).toMatch(/^sb_publishable_/);
  });

  it('anon cannot read entries.encrypted_pii', async () => {
    const { status, body } = await anonGet('entries?select=encrypted_pii&limit=1');
    // No column grant for anon on entries -> permission denied (not a 200 with data).
    expect(status).not.toBe(200);
    if (Array.isArray(body)) expect(body).toHaveLength(0);
  });

  it('anon cannot read participant credential columns (v2 hashes)', async () => {
    const { status } = await anonGet('entries?select=email_hash_v2,disclosure_password_hash_v2&limit=1');
    expect(status).not.toBe(200);
  });

  it('the legacy v1 hash columns no longer exist (P2-e5 drop)', async () => {
    const { status, body } = await anonGet('entries?select=email_hash&limit=1');
    // Either permission-denied (42501) or undefined-column (42703); never a 200 exposing them.
    expect(status).not.toBe(200);
    if (body?.code) expect(['42501', '42703', '42P01']).toContain(body.code);
  });

  it('anon cannot read the private key store', async () => {
    const { status, body } = await anonGet('project_private_keys?select=*&limit=1');
    expect(status).not.toBe(200);
    if (Array.isArray(body)) expect(body).toHaveLength(0);
  });

  it('anon cannot read participant auth events (rate-limit ledger)', async () => {
    const { status, body } = await anonGet('participant_auth_events?select=*&limit=1');
    expect(status).not.toBe(200);
    if (Array.isArray(body)) expect(body).toHaveLength(0);
  });

  it('anon reads of membership tables are row-hidden by RLS (0 rows, not an error)', async () => {
    const { status, body } = await anonGet('project_members?select=id&limit=1');
    // anon has SELECT grant but RLS (auth.uid() is null) must return no rows.
    expect(status).toBe(200);
    expect(Array.isArray(body) ? body.length : 0).toBe(0);
  });

  it('public_entry_list is readable but PII-free', async () => {
    const { status, body } = await anonGet('public_entry_list?select=*&limit=5');
    expect(status).toBe(200);
    if (Array.isArray(body)) {
      for (const row of body) {
        for (const k of ['encrypted_pii', 'email_hash', 'email_hash_v2', 'disclosure_password_hash', 'disclosure_password_hash_v2']) {
          expect(row).not.toHaveProperty(k);
        }
      }
    }
  });
});
