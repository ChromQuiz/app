# Architecture

CIQ is a static browser application backed by Supabase. There is no application server, bundler, or build pipeline.

## Frontend

- Static HTML pages at the repository root.
- Vanilla JavaScript in `js/`.
- Shared CSS in `css/design_system.css` and page-specific CSS in `css/pages.css`.
- PDF generation, answer scan parsing, and judging UI run in the browser.

## Backend

Supabase provides:

- Auth for administrators and scorers.
- Postgres for projects, entries, members, scoring, and results.
- RLS and column grants for access control.
- Storage for answer pages and cropped answer cells.
- Realtime for public entry lists and live workflow updates.
- Edge Functions for public participant flows and SES email.

## Data Flow Summary

Participants use public pages without accounts. Admins and scorers authenticate with Google, join projects, and operate through RLS-protected APIs. Sensitive participant data is encrypted before storage and should only be decrypted client-side by authorized admins with the project private key.

## Non-Goals

Do not add React, TypeScript, Express, Next.js, Vercel functions, or a bundling layer unless the project owner explicitly changes the architecture.
