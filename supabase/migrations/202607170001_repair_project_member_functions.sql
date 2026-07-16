-- Repair project member management functions.
-- Background: migration 202606260005_scorer_join_code.sql partially failed on the
-- remote database. The `project_members.status` column exists, but the member
-- management RPCs (remove_project_member / restore_project_member) were never
-- created, so admin "kick member" fails with
-- "Could not find the function public.remove_project_member(p_member_id)".
-- This migration re-declares them idempotently with create or replace.

alter table public.project_members
  add column if not exists status text not null default 'active'
    check (status in ('active', 'removed'));

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

-- Force PostgREST to refresh its schema cache so the RPC becomes callable
-- immediately without waiting for the next periodic reload.
notify pgrst, 'reload schema';
