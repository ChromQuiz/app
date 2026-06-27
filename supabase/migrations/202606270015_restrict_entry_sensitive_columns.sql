-- Restrict sensitive entry columns to admin-only RPC access.
-- RLS controls rows; column grants prevent non-admin project members from
-- fetching encrypted PII, email hashes, or disclosure password hashes directly.

revoke select on public.entries from authenticated;

grant select (
  id,
  project_id,
  entry_number,
  entry_name,
  affiliation,
  grade,
  message,
  is_chubu,
  status,
  checked_in,
  created_at,
  updated_at,
  waitlist_promoted_at,
  waitlist_promotion_notice
) on public.entries to authenticated;

create or replace function public.list_entries_for_admin(
  p_project_id text
)
returns table(
  id uuid,
  entry_number integer,
  encrypted_pii text,
  email_hash text,
  entry_name text,
  affiliation text,
  grade text,
  message text,
  is_chubu boolean,
  status text,
  checked_in boolean,
  created_at timestamptz,
  waitlist_promoted_at timestamptz,
  waitlist_promotion_notice text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_project_role(p_project_id, array['owner', 'admin']) then
    raise exception 'Forbidden';
  end if;

  return query
    select
      e.id,
      e.entry_number,
      e.encrypted_pii,
      e.email_hash,
      e.entry_name,
      e.affiliation,
      e.grade,
      e.message,
      e.is_chubu,
      e.status,
      e.checked_in,
      e.created_at,
      e.waitlist_promoted_at,
      e.waitlist_promotion_notice
    from public.entries e
    where e.project_id = p_project_id
    order by e.entry_number asc;
end;
$$;

revoke all on function public.list_entries_for_admin(text) from public, anon;
grant execute on function public.list_entries_for_admin(text) to authenticated;
