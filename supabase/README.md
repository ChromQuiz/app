# CIQ Supabase Implementation

This directory contains the migration foundation for moving CIQ from Firebase to Supabase.

## Apply Order

1. Create a Supabase project.
2. Run migrations in order:
   - `migrations/202606260001_initial_schema.sql`
   - `migrations/202606260002_rls_policies.sql`
3. Enable Google OAuth in Supabase Auth for admin/scorer login.
4. Set Edge Function secrets:

```bash
supabase secrets set SUPABASE_URL=...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
supabase secrets set AWS_REGION=ap-northeast-1
supabase secrets set AWS_ACCESS_KEY_ID=...
supabase secrets set AWS_SECRET_ACCESS_KEY=...
supabase secrets set SES_FROM_EMAIL=...
supabase secrets set CIQ_EDGE_INTERNAL_SECRET=...
```

## Security Notes

- Public participant flows must use Edge Functions. Do not grant anon direct write access to `entries`.
- Admin/scorer pages should use Supabase Auth + RLS.
- `score_events` is append-only from the client perspective and should be used as the audit trail for scoring changes.
- `email_events` stores delivery metadata only. Never store raw recipient addresses there; use `recipient_hash`.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and AWS secrets only in Supabase Edge Function secrets.
- `send-email` requires `x-ciq-internal-secret`; do not expose that value in the browser.

## Current Status

Implemented:
- Initial Postgres schema.
- RLS policies.
- Atomic entry-number allocation via `create_entry_atomic`.
- SES-backed `send-email` Edge Function.
- Public-flow Edge Function stubs for create, cancel, and result disclosure.
- Static Supabase client bootstrap files.

Not wired yet:
- Existing Firebase app pages still use `js/db.js`.
- Google OAuth UI is not connected yet.
- Storage bucket policies for answer images are not added yet.
