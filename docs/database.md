# Database

Supabase migrations in `supabase/migrations/` are the source of truth for schema, grants, policies, and RPC functions.

## Core Areas

- `projects`: project settings, counts, entry/disclosure periods, and public flags.
- `project_members`: owner/admin/scorer membership and status.
- `entries`: participant records. Sensitive fields are restricted and encrypted.
- `public_entry_list`: sanitized public list used by `entry_list.html`.
- `answer_pages`: uploaded scanned pages and answer-cell region metadata.
- Storage buckets `answer-pages` and `answer-cells`: private answer images.
- Storage bucket `site-card`: the one public image (`card.jpg`) used as `og:image` on public pages. Readable by anyone; only active owners/admins of any project can overwrite it (no delete). Migration `202611060001_site_card_image.sql`.
- Storage bucket `project-icon`: public per-project tab icon (`<project_id>/icon.png`, PNG, 1 MB). Only that project's active owners/admins can write or delete it. Participant pages (`entry`, `entry_list`, `my`, `terms`) swap the favicon via `js/project_icon.js` (loaded without `defer`; the icon is also kept in localStorage so Safari shows it before `load` on later visits). Migration `202611060002_project_icon.sql`.
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
