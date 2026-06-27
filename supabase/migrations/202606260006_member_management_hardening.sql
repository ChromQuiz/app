-- Tighten project member visibility and role changes.

drop policy if exists project_members_select_member on public.project_members;
create policy project_members_select_member
on public.project_members for select
using (
  user_id = auth.uid()
  or public.has_project_role(project_id, array['owner', 'admin'])
);

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
