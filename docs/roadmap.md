# Roadmap

## Current Status

Done:

- Supabase migration from Firebase-era flow is underway and mostly active.
- Google login for admins/scorers.
- Public participant entry flow.
- Email verification path integrated with provider-switchable Edge Function flow.
- Admin dashboard, entry management, answer sheet generation, answer upload, judging, conflict resolution, CSV/PDF exports, check-in, and score disclosure.
- CSP hardening for inline script and style removal.
- Answer upload validation and bounded upload concurrency.

## In Progress

- Hardening answer upload reliability and error recovery.
- UI/UX cleanup across admin, public, judging, and conflict pages.
- Performance work for answer image loading, signed URL caching, and repeated Supabase reads.
- Security review of all public and authenticated data flows.

## Planned

- Larger admin dashboard reorganization by event phase.
- More regression tests for RLS-sensitive flows and public Edge Functions.
- Further performance improvements for large participant counts.
- Documentation-driven issue workflow.
- Large refactoring after security, upload, and UI behavior are stable.

## Under Consideration (not scheduled)

Cross-event participant accounts and passkeys. Decision as of 2026-10-14: do not implement yet; keep the option open.

- Today participant auth is per project (`project_id` + `email_hash_v2` + `disclosure_password_hash_v2`). Participants have no identity across events.
- If CIQ grows to serve multiple events per year, a cross-event participant account becomes worthwhile, and passkeys are the first-choice credential for it.
- Adding passkeys on top of the current per-event auth, while keeping the password, adds no security (attackers use the weaker path). Passkeys only help once the password is retired and recovery goes through an email link.
- Decide the account unit first (custom token vs Supabase Auth), then the credential. Do not add passkeys before that.
- Keep the option open: do not rotate the participant hash pepper, because `email_hash_v2` is expected to be deterministic and is what lets past entries be linked to an account later (inferred from `supabase/functions/_shared/participant_auth.ts`; verify before relying on it).
- Admin/scorer MFA has a better cost-to-benefit ratio than participant passkeys and should be considered first.

## Do Not Treat As Complete Yet

The project still needs broad verification across UI/UX, performance, security, and refactoring goals before the long-running objective can be considered complete.
