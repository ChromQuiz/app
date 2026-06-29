-- Store project private keys wrapped by an Edge Function secret.
-- Browser clients never read this table directly.

create table if not exists public.project_private_keys (
  project_id text primary key references public.projects(id) on delete cascade,
  encrypted_private_key text not null,
  updated_by uuid references public.project_members(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.project_private_keys enable row level security;

drop policy if exists project_private_keys_no_direct_access on public.project_private_keys;
create policy project_private_keys_no_direct_access
on public.project_private_keys for all
using (false)
with check (false);

revoke all on public.project_private_keys from public, anon, authenticated;
grant all on public.project_private_keys to service_role;
