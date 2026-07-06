-- participant_auth_events: my.html(マイエントリー)の認証試行ログ。
-- Edge Functions(service role)専用。総当たり対策のレート制限に使う。

create table if not exists public.participant_auth_events (
  id uuid primary key default gen_random_uuid(),
  project_id text references public.projects(id) on delete cascade,
  email_hash text not null,
  success boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists participant_auth_events_lookup
  on public.participant_auth_events (project_id, email_hash, success, created_at desc);

-- service role 以外からは読み書き不可(ポリシーを一切作らない)
alter table public.participant_auth_events enable row level security;

revoke all on public.participant_auth_events from anon, authenticated;
