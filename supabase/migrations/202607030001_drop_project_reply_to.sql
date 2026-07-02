-- Reply-To is no longer project-specific. Replies go to the configured sender address.

alter table public.projects
  drop column if exists reply_to;
