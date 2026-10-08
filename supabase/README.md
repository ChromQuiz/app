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

   The functions no longer fall back to the legacy `SUPABASE_SERVICE_ROLE_KEY`. If `SUPABASE_SECRET_KEYS` is missing, they fail with `Supabase secret key is not available`.

6. Deploy every Edge Function with `--no-verify-jwt`. Production runs all of them with `verify_jwt: false`, so deploy the same way to keep that state. The gateway does not check the JWT; each function authenticates inside:
   - Public participant functions (`send-email`, `create-entry`, `my-entry`, `edit-entry`, `cancel-entry`, `mark-late`, `disclose-result`, `checkin-qr`) are called before Google login. They validate Turnstile, participant identity, or project state themselves.
   - Staff functions (`check-in`, `project-key`, `admin-create-entry`, `admin-entry-qr`, `create-scorer-invite`) call `supabase.auth.getUser(token)` and then check an active `owner` / `admin` membership (`check-in` also allows `scorer` for desk operations). A request without a valid Google login gets 401.
   - `redeem-scorer-invite` only requires a valid Google login, because the caller is not a member yet; the invite token decides whether they may join.

```bash
for fn in send-email create-entry my-entry edit-entry cancel-entry mark-late disclose-result checkin-qr \
          check-in project-key admin-create-entry admin-entry-qr create-scorer-invite redeem-scorer-invite; do
  pnpm dlx supabase functions deploy "$fn" --project-ref YOUR_PROJECT_REF --no-verify-jwt
done
```

If you add a function, put the `getUser` and role check in the function. Without it, `--no-verify-jwt` leaves the function open.

7. Set email Edge Function secrets. Brevo is the current default provider; SES remains available as a fallback by changing `CIQ_EMAIL_PROVIDER`.

Brevo:

```bash
pnpm dlx supabase secrets set \
  CIQ_EMAIL_PROVIDER=brevo \
  BREVO_API_KEY=... \
  BREVO_FROM_EMAIL=... \
  BREVO_FROM_NAME=CIQ \
  CIQ_EMAIL_SIGNING_SECRET=...
```

SES:

```bash
pnpm dlx supabase secrets set \
  CIQ_EMAIL_PROVIDER=ses \
  AWS_REGION=ap-northeast-1 \
  AWS_ACCESS_KEY_ID=... \
  AWS_SECRET_ACCESS_KEY=... \
  SES_FROM_EMAIL=... \
  CIQ_EMAIL_SIGNING_SECRET=...
```

Use a long random value for `CIQ_EMAIL_SIGNING_SECRET`. It signs verification codes inside the Edge Function and must not be exposed in browser JavaScript.

Automatic waitlist-promotion notices (the server decrypts only the promoted entrant's address in memory, sends, and discards it) need two more secrets. Without them the notices are still sent when an admin opens the entry list, but not automatically:

```bash
pnpm dlx supabase secrets set \
  CIQ_CRON_SECRET=... \
  CIQ_SITE_URL=https://YOUR_USER.github.io/YOUR_REPO/
```

`CIQ_CRON_SECRET` is a long random value shared with the Cloudflare Worker in `cloudflare/keepalive` (`npx wrangler secret put CIQ_CRON_SECRET`). `CIQ_SITE_URL` is the public address of the site; it is used for the "マイエントリー" link in the notice mail.

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
- Keep `SUPABASE_SERVICE_ROLE_KEY`, Brevo API keys, and AWS secrets only in Supabase Edge Function secrets.
- Public participant functions are browser-callable with the publishable key, but provider credentials, 2D code signing, and participant-token signing stay inside Edge Function secrets.
- `send-email` rejects verification mail unless the project exists and entry reception is currently open.
- Entry confirmation, edit, cancellation, late notice, and waitlist promotion mails require a matching `projectId`, `entryId`, recipient address, and `emailHash`.
- The browser never sends email provider credentials or a service role key.

## Current Status

Implemented:
- Initial Postgres schema.
- RLS policies.
- Atomic entry-number allocation via `create_entry_atomic`.
- Provider-switchable `send-email` Edge Function with Brevo as the default and SES as fallback.
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
- Email delivery still needs Brevo or SES secrets and final provider verification.

## Database behavior check

`supabase/tests/db_behavior.sql` runs the real functions and permissions of the linked database inside one transaction that always ends with `rollback`, impersonating owner / admin / scorer / removed / outsider users through `request.jwt.claims`. Nothing is left behind. Run it after any migration that touches functions, RLS or grants:

```bash
npx supabase db query --linked --project-ref YOUR_PROJECT_REF -f supabase/tests/db_behavior.sql
```

The last result set lists every check as `ok` true/false; any `false` row carries a `detail`.
