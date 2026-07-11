-- rate_limit_events: IP単位レート制限のイベント記録。Edge Functions(service role)専用。
-- 生IPは保存せず、HMAC化した scope_key のみを保存する。
-- 既存テーブルは変更しない(追加のみ)。

create table if not exists public.rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,                 -- 'send_verification' | 'create_entry' | 'participant_auth'
  scope_key text not null,              -- HMAC(pepper, ip)。生IPは保存しない
  project_id text references public.projects(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_lookup
  on public.rate_limit_events (bucket, scope_key, created_at desc);

-- service role 以外からは読み書き不可(ポリシーを一切作らない)
alter table public.rate_limit_events enable row level security;

revoke all on public.rate_limit_events from anon, authenticated;
