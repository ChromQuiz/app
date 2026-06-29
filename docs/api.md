# API

CIQ does not have a custom Node API server. Browser code talks to Supabase through `js/supabase_api.js` and public/authenticated Edge Functions.

## Browser API Adapter

`js/supabase_api.js` centralizes Supabase calls for:

- project creation and membership
- public settings
- entries and public entry lists
- answer page and answer cell storage
- model answers
- scoring votes and final results
- project reset and check-in flows

Prefer adding new Supabase access there instead of scattering raw client calls across page scripts.

## Edge Functions

Functions in `supabase/functions/` handle public or privileged flows that should not be implemented as direct browser table writes:

- `create-entry`
- `edit-entry`
- `cancel-entry`
- `mark-late`
- `check-in`
- `disclose-result`
- `send-email`

Shared helpers are in `supabase/functions/_shared/`.

## Change Rules

- Keep function payloads explicit.
- Validate project state and identity inside Edge Functions.
- Never use browser-only checks as the sole authorization boundary.
