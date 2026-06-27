# CIQ Supabase Implementation

This directory contains the Supabase database, RLS, Storage, and Edge Function setup for CIQ.

## Apply Order

1. Create a Supabase project.
2. Run migrations in order:
   - `migrations/202606260001_initial_schema.sql`
   - `migrations/202606260002_rls_policies.sql`
   - `migrations/202606260003_public_flow_hardening.sql`
   - `migrations/202606260004_auth_project_creation.sql`
   - `migrations/202606260005_scorer_join_code.sql`
   - `migrations/202606260006_member_management_hardening.sql`
   - `migrations/202606270007_scoring_flow.sql`
   - `migrations/202606270008_conflict_resolution.sql`
   - `migrations/202606270009_project_reset.sql`
3. Enable Google OAuth in Supabase Auth for admin/scorer login.
   - Site URL: `https://chromquiz.github.io/app/`
   - Redirect URLs:
     - `https://chromquiz.github.io/app/`
     - `https://chromquiz.github.io/app/index.html`
4. Set `js/supabase_config.js` locally:

```js
window.CIQ_SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  publishableKey: 'YOUR_SUPABASE_PUBLISHABLE_KEY',
};
```

5. Edge Functions use the default Supabase secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEYS`

   The functions also fall back to the legacy `SUPABASE_SERVICE_ROLE_KEY` if needed.

6. Deploy browser-callable Edge Functions. `send-email` must be deployed without JWT verification because public entry forms call it before login:

```bash
pnpm dlx supabase functions deploy send-email --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

7. Set SES Edge Function secrets when SES is ready:

```bash
pnpm dlx supabase secrets set \
  AWS_REGION=ap-northeast-1 \
  AWS_ACCESS_KEY_ID=... \
  AWS_SECRET_ACCESS_KEY=... \
  SES_FROM_EMAIL=... \
  CIQ_EMAIL_SIGNING_SECRET=...
```

Use a long random value for `CIQ_EMAIL_SIGNING_SECRET`. It signs verification codes inside the Edge Function and must not be exposed in browser JavaScript.

## Security Notes

- Public participant flows must use Edge Functions. Do not grant anon direct write access to `entries`.
- Public forms should read only `public_project_settings`; do not expose `projects` to anon.
- Public entry list realtime should subscribe to `public_entry_list`, not `entries`; it contains only non-PII display fields.
- Answer images should be stored in private Storage buckets:
  - `answer-pages/{projectId}/{entryNumber}/page.webp`
  - `answer-cells/{projectId}/{entryNumber}/q{questionNumber}.webp`
- Admin/scorer pages should use Supabase Auth + RLS.
- `score_events` is append-only from the client perspective and should be used as the audit trail for scoring changes.
- `email_events` stores delivery metadata only. Never store raw recipient addresses there; use `recipient_hash`.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and AWS secrets only in Supabase Edge Function secrets.
- `send-email` is browser-callable with the publishable key, but SES credentials and verification-code signing stay inside Edge Function secrets.
- `send-email` rejects verification mail unless the project exists and entry reception is currently open.
- Entry confirmation, cancellation, and waitlist promotion mails require a matching `projectId`, `entryId`, recipient address, and `emailHash`.
- The browser never sends SES credentials or a service role key.

## Current Status

Implemented:
- Initial Postgres schema.
- RLS policies.
- Atomic entry-number allocation via `create_entry_atomic`.
- SES-backed `send-email` Edge Function.
- Public-flow Edge Functions for create, cancel, edit, late report, check-in, and result disclosure.
- Sanitized realtime `public_entry_list`.
- Atomic cancel + waitlist promotion via `cancel_entry_atomic`.
- Private Storage buckets and RLS policies for answer images.
- Disclosure period columns and Edge Function checks.
- Authenticated audit-log RPC.
- Authenticated project creation RPC.
- Static Supabase client bootstrap files.
- Entry, edit, cancel, late report, terms, disclosure, check-in, and public entry-list pages can use Supabase when `js/supabase_config.js` is configured.
- Index page can use Google Auth, create Supabase projects, and let scorers join with a project code.
- Admin settings can update Supabase project settings and manage project members.
- Admin prep can store question count, model answers, answer pages, and answer cells in Supabase.
- Answer scan/list/preview can read and delete Supabase Storage images.
- Judge/question pages can use Supabase question slots, score votes, and automatic unanimous finalization.
- Conflict-resolution page can use Supabase votes/final results and the admin-only `resolve_score_conflict` RPC.
- Admin stats, CSV export, graded PDF export, and project reset have Supabase-mode wiring.

Not wired yet:
- Email delivery still needs SES secrets and final provider verification.
