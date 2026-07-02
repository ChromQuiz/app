# CIQ Improvement Plan

## Done

- Fixed answer upload storage grants for Supabase Storage Data API access.
- Restricted answer page and answer cell writes to owner/admin members.
- Added bounded answer cell upload concurrency and clearer upload failure reporting.
- Stopped the Service Worker from serving stale HTML, CSS, JS, auth, and API traffic.
- Batched answer cell signed URL creation for question and conflict views.
- Hardened participant-facing form status messages to render variable text with `textContent`.
- Hardened project member controls, public entry list rendering, answer management rendering, and scoring flow rendering by moving variable UI content away from raw HTML strings.
- Removed remaining browser-side `innerHTML` rendering and inline script execution surfaces.
- Tightened page CSP by removing `script-src 'unsafe-inline'`.
- Tightened page CSP by removing `style-src 'unsafe-inline'`.
- Restricted sensitive `entries` columns so encrypted PII, email hashes, and disclosure password hashes are only available through admin-only RPC access.
- Removed project-specific reply-to settings; participant emails use the configured provider sender address.
- Added PDF upload validation for file type, magic signature, size, and page count before answer scan processing.
- Added cleanup for retained scan canvases after answer upload errors and completion.

## UI/UX

- Admin dashboard: reorganize tabs by event phase: before event, event day, scoring, publication, maintenance.
- Admin dashboard: make destructive actions visually distinct and require clearer confirmations.
- Entry, cancel, edit, late, disclosure pages: standardize empty, loading, disabled, and error states.
- Judge and conflict pages: improve progress visibility, keyboard flow, and mobile action ergonomics.
- Public links: keep labels participant-facing and avoid implementation terms.
- Toasts, dialogs, and form status messages: use safe text rendering only, never raw HTML for variable messages.

## Performance

- Avoid stale Service Worker responses for HTML, CSS, JS, auth, and API traffic.
- Keep answer upload concurrency bounded and visible.
- Release large canvases after answer upload and scan processing.
- Validate answer PDFs before parsing so oversized or renamed files fail early.
- Reduce repeated full answer-page scans on admin/judge/question/conflict views.
- Add pagination or incremental rendering for large entry lists.
- Cache signed image URLs per short session where safe, then expire.
- Avoid unnecessary full-card rerenders while scoring votes are refreshing.

## Security

- Keep participant PII encrypted at rest and never expose raw PII to public pages.
- Prevent scorer/member clients from directly selecting sensitive participant columns.
- Keep organizer email settings out of anonymous public settings.
- Keep answer image buckets private and readable only by active project members.
- Restrict answer upload, replacement, deletion, and project reset to owner/admin.
- Keep scoring writes limited to active project members with scorer/admin roles.
- Ensure public Edge Functions validate project state, entry identity, and recipient hashes.
- Remove or avoid broad browser-side secrets; publishable keys only in client files.
- Keep CSP free of inline script and style execution surfaces.
- Validate uploaded answer PDFs before parsing or storage writes.
- Add regression checks for unauthenticated access to private tables and storage.
- Add regression checks for column-level restrictions on sensitive participant fields.

## Refactoring

- Split `admin_prep.js` into answer-sheet generation, scan detection, upload orchestration, and model-answer editing modules.
- Split `admin.js` into bootstrap, overview, tab routing, and shared project-state loading.
- Consolidate repeated Supabase error mapping into one helper.
- Move repeated HTML string rendering toward DOM builders or small render helpers.
- Replace inline style mutations with CSS utility/state classes so `style-src 'unsafe-inline'` can be removed later.
- Keep upload validation as shared, tested logic instead of embedding file checks inside page handlers.
- Centralize cache-busting/version strategy for JS and CSS assets.
- Add focused tests for ranking, upload validation, access-control helper behavior, and renderer escaping.
- Extract reusable DOM helpers for icon+text messages, table empty/error rows, and status badges.
