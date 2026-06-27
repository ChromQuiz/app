-- CIQ Supabase auth project creation.
-- Creates the first owner membership atomically with the project.

create or replace function public.create_project_with_owner(
  p_project_id text,
  p_name text,
  p_rsa_public_key jsonb,
  p_rsa_private_key_encrypted text,
  p_owner_display_name text
)
returns table(project_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_display_name text := nullif(trim(p_owner_display_name), '');
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
  if v_display_name is null then
    raise exception 'Owner display name is required';
  end if;

  insert into public.projects (
    id,
    name,
    rsa_public_key,
    rsa_private_key_encrypted,
    created_by
  )
  values (
    p_project_id,
    trim(p_name),
    p_rsa_public_key,
    p_rsa_private_key_encrypted,
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

revoke all on function public.create_project_with_owner(text, text, jsonb, text, text) from public, anon;
grant execute on function public.create_project_with_owner(text, text, jsonb, text, text) to authenticated;
