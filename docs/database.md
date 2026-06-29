# Database

Supabase migrations in `supabase/migrations/` are the source of truth for schema, grants, policies, and RPC functions.

## Core Areas

- `projects`: project settings, counts, entry/disclosure periods, and public flags.
- `project_members`: owner/admin/scorer membership and status.
- `entries`: participant records. Sensitive fields are restricted and encrypted.
- `public_entry_list`: sanitized public list used by `entry_list.html`.
- `answer_pages`: uploaded scanned pages and answer-cell region metadata.
- Storage buckets `answer-pages` and `answer-cells`: private answer images.
- scoring tables: question scorers, score votes, final results, and conflict resolution.

## Change Rules

- Any schema, grant, RLS, RPC, or Storage policy change must be added as a new migration.
- Keep migrations ordered and descriptive.
- Do not change existing migrations casually after they have been applied.
- Preserve RLS and column restrictions for participant PII and answer images.

## Verification

When changing database access, verify:

- anonymous public pages can only read intended public data
- scorers cannot read sensitive participant fields
- only owner/admin can upload, replace, delete, or reset answer data
- participant flows work through Edge Functions, not direct privileged table access
