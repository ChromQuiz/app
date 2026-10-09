-- 大会を作れるアカウントを、許可した Google アカウントだけにする。
--
-- これまで: Google にログインした人なら誰でも、create_project_with_owner で大会を作れた(許可の確認がなかった)。
--   作成ページを見つけた人が、運営の Brevo の送信枠・Supabase の無料枠を使えてしまう。
-- これから: public.project_creators に載っているメールアドレスの人だけが作れる。
--   ・一覧は SQL で足す(画面・API からは、読むことも書くこともできない)。
--   ・メールアドレスは、Google でログインし、メールが確認済みのものだけを認める。
--     (別の方法でアカウントを作って、同じメールアドレスを名乗る、ということができないようにする。)
--   ・直接 projects に行を足す道(RLS の insert ポリシーと INSERT の権限)も閉じる。作成は、この関数だけを通る。

create table if not exists public.project_creators (
  email text primary key check (email = lower(btrim(email))),
  note text,
  added_at timestamptz not null default now()
);

alter table public.project_creators enable row level security;
revoke all on public.project_creators from public, anon, authenticated;

create or replace function public.can_create_project()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'google'
    and coalesce(auth.jwt() -> 'user_metadata' ->> 'email_verified', '') = 'true'
    and exists (
      select 1 from public.project_creators c
      where c.email = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
    );
$$;

revoke all on function public.can_create_project() from public, anon;
grant execute on function public.can_create_project() to authenticated;

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
  if not public.can_create_project() then
    raise exception 'このアカウントでは大会を作成できません。';
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

-- 作成は上の関数(security definer)だけを通す。画面から projects に直接行を足す道を閉じる。
drop policy if exists projects_insert_owner_candidate on public.projects;
revoke insert on public.projects from authenticated;

notify pgrst, 'reload schema';
