-- CIQ Supabase scorer self-join.
-- Scorers can join a project with Google Auth + project id + shared scorer code.

alter table public.projects
  add column if not exists scorer_access_code_hash text;

alter table public.project_members
  add column if not exists status text not null default 'active'
    check (status in ('active', 'removed'));

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

create or replace function public.create_project_with_owner(
  p_project_id text,
  p_name text,
  p_rsa_public_key jsonb,
  p_rsa_private_key_encrypted text,
  p_owner_display_name text default null,
  p_scorer_access_code_hash text default null
)
returns table(project_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := coalesce(nullif(trim(p_owner_display_name), ''), public.auth_display_name());
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_project_id is null or p_project_id !~ '^[a-z0-9][a-z0-9_-]{2,39}$' then
    raise exception 'Invalid project id';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Project name is required';
  end if;

  insert into public.projects (
    id,
    name,
    rsa_public_key,
    rsa_private_key_encrypted,
    scorer_access_code_hash,
    created_by
  )
  values (
    p_project_id,
    trim(p_name),
    p_rsa_public_key,
    p_rsa_private_key_encrypted,
    p_scorer_access_code_hash,
    v_user_id
  );

  insert into public.project_members (
    project_id,
    user_id,
    role,
    display_name
  )
  values (
    p_project_id,
    v_user_id,
    'owner',
    v_display_name
  );

  return query select p_project_id;
end;
$$;

revoke all on function public.create_project_with_owner(text, text, jsonb, text, text, text) from public, anon;
grant execute on function public.create_project_with_owner(text, text, jsonb, text, text, text) to authenticated;

create or replace function public.join_project_with_scorer_code(
  p_project_id text,
  p_access_code_hash text
)
returns table(project_id text, role text, display_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_project public.projects%rowtype;
  v_member public.project_members%rowtype;
  v_display_name text := public.auth_display_name();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into v_project
    from public.projects
    where id = p_project_id;

  if not found then
    raise exception 'Project not found';
  end if;

  select *
    into v_member
    from public.project_members
    where project_members.project_id = p_project_id
      and project_members.user_id = v_user_id
    limit 1;

  if found then
    if v_member.status = 'removed' then
      raise exception 'Member was removed';
    end if;
    return query select p_project_id, v_member.role, v_member.display_name;
    return;
  end if;

  if v_project.scorer_access_code_hash is null or v_project.scorer_access_code_hash <> p_access_code_hash then
    raise exception 'Invalid scorer code';
  end if;

  insert into public.project_members (
    project_id,
    user_id,
    role,
    display_name
  )
  values (
    p_project_id,
    v_user_id,
    'scorer',
    v_display_name
  )
  returning * into v_member;

  return query select p_project_id, v_member.role, v_member.display_name;
end;
$$;

revoke all on function public.join_project_with_scorer_code(text, text) from public, anon;
grant execute on function public.join_project_with_scorer_code(text, text) to authenticated;

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
  if v_member.role = 'owner' and p_role <> 'admin' then
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
