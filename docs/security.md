# Security

CIQ handles participant PII, private answer images, scoring decisions, and result disclosure. Security changes should be conservative.

## Rules

- Treat all browser input and database content as untrusted.
- Use `textContent` or DOM builders for user-visible dynamic content.
- Avoid `innerHTML`, inline scripts, inline styles, and unsafe CSP relaxations.
- Keep private Supabase buckets private.
- Never expose service-role keys, email provider secrets, or private project keys in committed browser files.
- Keep browser config limited to publishable Supabase keys.
- Validate uploads before parsing or storage writes.
- Preserve RLS, grants, Edge Function checks, and encrypted PII assumptions.

## Participant Data

Participant PII should remain encrypted at rest. Public pages must use sanitized public data or Edge Functions that validate identity and state.

## Answer Images

Answer pages and answer cells are private. Use signed URLs with short lifetimes and avoid caching beyond safe session windows.

The `site-card` and `project-icon` buckets are the only public buckets. It holds a single shared link-card image (`card.jpg`, JPEG only, 5 MB). The admin page re-encodes uploads to JPEG in the browser so image metadata is dropped; Storage policies restrict writes to that one path and to active project owners/admins. Never store participant data or answer images there.

`project-icon` holds one PNG per project (`<project_id>/icon.png`, 1 MB), re-encoded in the browser. Writes and deletes are limited to that project's active owners/admins. Participant pages fetch it (connect-src) and set it as a `data:` favicon (img-src), so CSP is unchanged; `js/project_icon.js` only builds the URL from a project ID matching `^[A-Za-z0-9_-]{1,64}$`.

## Regression Checklist

Before merging security-sensitive changes, check CSP, RLS/grants, Storage policies, public flows, and whether any new data path exposes PII, email hashes, disclosure passwords, or answer images.
