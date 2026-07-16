-- Repair project member management functions and their dependencies.
-- Background: migration 202606260005_scorer_join_code.sql partially failed on the
-- remote database. The `project_members.status` column exists, but the helper
-- RPCs (has_project_role / is_project_member / current_member_id) and the member
-- management RPCs (update_project_member_role / remove_project_member /
-- restore_project_member) were never created, so admin member management fails
-- (e.g. "Could not find the function public.remove_project_member(p_member_id)").
-- This re-declares them idempotently with create or replace, in dependency order.

alter table public.project_members
  add column if not exists status text not null default 'active'
    check (status in ('active', 'removed'));

-- ---- Helpers -----------------------------------------------------------
-- has_project_role is referenced by every member management RPC below and by
-- RLS policies, so it must exist first.

create or replace function public.has_project_role(target_project_id text, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = auth.uid()
      and pm.status = 'active'
      and pm.role = any(allowed_roles)
  );
$$;

create or replace function public.is_project_member(target_project_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project_id
      and pm.user_id = auth.uid()
      and pm.status = 'active'
  );
$$;

create or replace function public.current_member_id(target_project_id text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select pm.id
  from public.project_members pm
  where pm.project_id = target_project_id
    and pm.user_id = auth.uid()
    and pm.status = 'active'
  limit 1;
$$;

create or replace function public.auth_display_name()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    nullif(auth.jwt() ->> 'email', ''),
    'Google User'
  );
$$;

-- ---- Member management RPCs -------------------------------------------

create or replace function public.update_project_member_role(
  p_member_id uuid,
  p_role text
)
returns table(member_id uuid, project_id text, role text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.project_members%rowtype;
  v_active_owner_count integer;
begin
  if p_role not in ('admin', 'scorer') then
    raise exception 'Invalid role';
  end if;

  select * into v_member
  from public.project_members
  where id = p_member_id
  for update;

  if not found then
    raise exception 'Member not found';
  end if;
  if not public.has_project_role(v_member.project_id, array['owner', 'admin']) then
    raise exception 'Forbidden';
  end if;
  if v_member.user_id = auth.uid() then
    raise exception 'Cannot change your own role';
  end if;
  if v_member.role = 'owner' then
    select count(*) into v_active_owner_count
    from public.project_members
    where project_members.project_id = v_member.project_id
      and project_members.role = 'owner'
      and project_members.status = 'active';
    if v_active_owner_count <= 1 then
      raise exception 'Cannot demote last owner';
    end if;
  end if;

  update public.project_members
    set role = p_role,
        status = 'active'
    where id = p_member_id
    returning * into v_member;

  return query select v_member.id, v_member.project_id, v_member.role, v_member.status;
end;
$$;

revoke all on function public.update_project_member_role(uuid, text) from public, anon;
grant execute on function public.update_project_member_role(uuid, text) to authenticated;

create or replace function public.remove_project_member(
  p_member_id uuid
)
returns table(member_id uuid, project_id text, role text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.project_members%rowtype;
  v_active_owner_count integer;
begin
  select * into v_member
  from public.project_members
  where id = p_member_id
  for update;

  if not found then
    raise exception 'Member not found';
  end if;
  if not public.has_project_role(v_member.project_id, array['owner', 'admin']) then
    raise exception 'Forbidden';
  end if;
  if v_member.user_id = auth.uid() then
    raise exception 'Cannot remove yourself';
  end if;
  if v_member.role = 'owner' then
    select count(*) into v_active_owner_count
    from public.project_members
    where project_members.project_id = v_member.project_id
      and project_members.role = 'owner'
      and project_members.status = 'active';
    if v_active_owner_count <= 1 then
      raise exception 'Cannot remove last owner';
    end if;
  end if;

  update public.project_members
    set status = 'removed'
    where id = p_member_id
    returning * into v_member;

  return query select v_member.id, v_member.project_id, v_member.role, v_member.status;
end;
$$;

revoke all on function public.remove_project_member(uuid) from public, anon;
grant execute on function public.remove_project_member(uuid) to authenticated;

create or replace function public.restore_project_member(
  p_member_id uuid
)
returns table(member_id uuid, project_id text, role text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.project_members%rowtype;
begin
  select * into v_member
  from public.project_members
  where id = p_member_id
  for update;

  if not found then
    raise exception 'Member not found';
  end if;
  if not public.has_project_role(v_member.project_id, array['owner', 'admin']) then
    raise exception 'Forbidden';
  end if;

  update public.project_members
    set status = 'active'
    where id = p_member_id
    returning * into v_member;

  return query select v_member.id, v_member.project_id, v_member.role, v_member.status;
end;
$$;

revoke all on function public.restore_project_member(uuid) from public, anon;
grant execute on function public.restore_project_member(uuid) to authenticated;

-- Force PostgREST to refresh its schema cache so the RPCs become callable
-- immediately without waiting for the next periodic reload.
notify pgrst, 'reload schema';
