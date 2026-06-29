# Roadmap

## Current Status

Done:

- Supabase migration from Firebase-era flow is underway and mostly active.
- Google login for admins/scorers.
- Public participant entry flow.
- Email verification path integrated with SES-oriented Edge Function flow.
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

## Do Not Treat As Complete Yet

The project still needs broad verification across UI/UX, performance, security, and refactoring goals before the long-running objective can be considered complete.
