# Security

CIQ handles participant PII, private answer images, scoring decisions, and result disclosure. Security changes should be conservative.

## Rules

- Treat all browser input and database content as untrusted.
- Use `textContent` or DOM builders for user-visible dynamic content.
- Avoid `innerHTML`, inline scripts, inline styles, and unsafe CSP relaxations.
- Keep private Supabase buckets private.
- Never expose service-role keys, SES secrets, or private project keys in committed browser files.
- Keep browser config limited to publishable Supabase keys.
- Validate uploads before parsing or storage writes.
- Preserve RLS, grants, Edge Function checks, and encrypted PII assumptions.

## Participant Data

Participant PII should remain encrypted at rest. Public pages must use sanitized public data or Edge Functions that validate identity and state.

## Answer Images

Answer pages and answer cells are private. Use signed URLs with short lifetimes and avoid caching beyond safe session windows.

## Regression Checklist

Before merging security-sensitive changes, check CSP, RLS/grants, Storage policies, public flows, and whether any new data path exposes PII, email hashes, disclosure passwords, or answer images.
