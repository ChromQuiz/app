-- Default new projects to a 120-person entry cap.
-- Existing projects keep their current max_entries value.

alter table public.projects
  alter column max_entries set default 120;

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
    max_entries,
    created_by
  )
  values (
    p_project_id,
    trim(p_name),
    p_rsa_public_key,
    p_rsa_private_key_encrypted,
    p_scorer_access_code_hash,
    120,
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
