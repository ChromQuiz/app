# CIQ Improvement Plan

## UI/UX

- Admin dashboard: reorganize tabs by event phase: before event, event day, scoring, publication, maintenance.
- Admin dashboard: make destructive actions visually distinct and require clearer confirmations.
- Entry, cancel, edit, late, disclosure pages: standardize empty, loading, disabled, and error states.
- Judge and conflict pages: improve progress visibility, keyboard flow, and mobile action ergonomics.
- Public links: keep labels participant-facing and avoid implementation terms.
- Toasts and dialogs: use safe text rendering only, never raw HTML for variable messages.

## Performance

- Avoid stale Service Worker responses for HTML, CSS, JS, auth, and API traffic.
- Keep answer upload concurrency bounded and visible.
- Release large canvases after answer upload and scan processing.
- Reduce repeated full answer-page scans on judge/question/conflict views.
- Add pagination or incremental rendering for large entry lists.
- Cache signed image URLs per short session where safe, then expire.

## Security

- Keep participant PII encrypted at rest and never expose raw PII to public pages.
- Keep answer image buckets private and readable only by active project members.
- Restrict answer upload, replacement, deletion, and project reset to owner/admin.
- Keep scoring writes limited to active project members with scorer/admin roles.
- Ensure public Edge Functions validate project state, entry identity, and recipient hashes.
- Remove or avoid broad browser-side secrets; publishable keys only in client files.
- Add regression checks for unauthenticated access to private tables and storage.

## Refactoring

- Split `admin_prep.js` into answer-sheet generation, scan detection, upload orchestration, and model-answer editing modules.
- Split `admin.js` into bootstrap, overview, tab routing, and shared project-state loading.
- Consolidate repeated Supabase error mapping into one helper.
- Move repeated HTML string rendering toward DOM builders or small render helpers.
- Centralize cache-busting/version strategy for JS and CSS assets.
- Add focused tests for ranking, upload validation, access-control helper behavior, and renderer escaping.
