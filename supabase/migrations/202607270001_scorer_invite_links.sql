-- AB-1: 採点者の参加方式を「参加コード」から「招待リンク」へ置き換える（破壊的変更・本番運用前のため互換不要）。
--
-- 旧方式の問題（監査で判明）:
--   join_project_with_scorer_code は **クライアントが計算したハッシュをそのまま比較** していたため、
--   保存値（projects.scorer_access_code_hash）を入手すれば原文を知らなくても参加できた（pass-the-hash）。
--   さらに projects の RLS は is_project_member で、列権限にも当該列が含まれていたため、
--   一度参加した採点者がその値を読み出して第三者へ配布できた。無効化・再発行の手段も無かった。
--
-- 新方式:
--   - 管理者が招待リンクを発行（トークンは Edge Function 内で CSPRNG 生成）
--   - **トークン平文は保存しない**。保存するのは HMAC 化した token_hash のみ
--   - 有効期限は 7 日固定（サーバ側で付与。クライアントからは指定できない）
--   - role は scorer 固定。管理者が指定できるのは使用上限人数のみ
--   - 使用回数は原子的に増やし、上限超過は不可能にする
--   - 無効化（revoke）が可能

-- ---------------------------------------------------------------- 招待テーブル

create table if not exists public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  token_hash text not null unique,          -- HMAC(secret, 'invite:' || token)。平文は保存しない
  max_uses integer not null check (max_uses between 1 and 500),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_invites_project_idx
  on public.project_invites (project_id, created_at desc);

alter table public.project_invites enable row level security;

-- 管理者（owner/admin）は自プロジェクトの招待一覧を閲覧できる。
-- 書き込みは RPC(service_role / SECURITY DEFINER)経由のみ。
drop policy if exists project_invites_select_admin on public.project_invites;
create policy project_invites_select_admin
on public.project_invites for select
using (has_project_role(project_id, array['owner', 'admin']));

-- 列単位の権限: token_hash はクライアントへ一切出さない（entries 機密列と同じ手法）。
revoke all on public.project_invites from anon, authenticated;
grant select (
  id,
  project_id,
  max_uses,
  use_count,
  expires_at,
  revoked_at,
  created_at
) on public.project_invites to authenticated;
grant select, insert, update on public.project_invites to service_role;

-- ---------------------------------------------------------------- 発行

-- 招待を作成する。token_hash は Edge Function が CSPRNG トークンから生成して渡す。
-- 有効期限(7日)と role(scorer 固定)はサーバ側で決める＝クライアントは操作できない。
create or replace function public.create_scorer_invite(
  p_project_id text,
  p_token_hash text,
  p_max_uses integer,
  p_created_by uuid
)
returns table(id uuid, expires_at timestamptz, max_uses integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_expires timestamptz := now() + interval '7 days';
  v_max integer := greatest(1, least(coalesce(p_max_uses, 20), 500));
begin
  if p_project_id is null or p_token_hash is null or length(p_token_hash) < 32 then
    raise exception 'Invalid invite request';
  end if;

  insert into public.project_invites (project_id, token_hash, max_uses, expires_at, created_by)
  values (p_project_id, p_token_hash, v_max, v_expires, p_created_by)
  returning project_invites.id into v_id;

  return query select v_id, v_expires, v_max;
end;
$$;

revoke all on function public.create_scorer_invite(text, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.create_scorer_invite(text, text, integer, uuid) to service_role;

-- ---------------------------------------------------------------- 引き換え

-- 招待を引き換えて採点者として参加する。
-- 使用回数の加算は条件付き UPDATE で原子的に行うため、並列でも max_uses を超えない。
create or replace function public.redeem_scorer_invite(
  p_token_hash text,
  p_user_id uuid,
  p_display_name text
)
returns table(project_id text, role text, display_name text, already_member boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.project_invites%rowtype;
  v_member public.project_members%rowtype;
  v_name text := coalesce(nullif(trim(p_display_name), ''), 'Scorer');
  v_updated integer;
begin
  if p_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_invite
    from public.project_invites
    where token_hash = p_token_hash;
  if not found then
    raise exception 'Invalid invite';
  end if;

  -- 既にメンバーなら使用回数を消費しない（再訪・二重クリック対策）。
  select * into v_member
    from public.project_members
    where project_members.project_id = v_invite.project_id
      and project_members.user_id = p_user_id
    limit 1;
  if found then
    if v_member.status = 'removed' then
      raise exception 'Member was removed';
    end if;
    return query select v_invite.project_id, v_member.role, v_member.display_name, true;
    return;
  end if;

  -- 原子的に使用回数を加算。条件を満たさない場合は 0 行更新となり、理由を判定して例外にする。
  update public.project_invites
     set use_count = use_count + 1
   where project_invites.id = v_invite.id
     and project_invites.revoked_at is null
     and project_invites.expires_at > now()
     and project_invites.use_count < project_invites.max_uses;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    if v_invite.revoked_at is not null then
      raise exception 'Invite revoked';
    elsif v_invite.expires_at <= now() then
      raise exception 'Invite expired';
    else
      raise exception 'Invite exhausted';
    end if;
  end if;

  insert into public.project_members (project_id, user_id, role, display_name)
  values (v_invite.project_id, p_user_id, 'scorer', v_name)
  returning * into v_member;

  return query select v_invite.project_id, v_member.role, v_member.display_name, false;
end;
$$;

revoke all on function public.redeem_scorer_invite(text, uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_scorer_invite(text, uuid, text) to service_role;

-- ---------------------------------------------------------------- 無効化

-- 管理者が招待を無効化する。owner/admin のみ。
create or replace function public.revoke_scorer_invite(p_invite_id uuid)
returns table(id uuid, revoked_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.project_invites%rowtype;
begin
  select * into v_invite from public.project_invites where project_invites.id = p_invite_id;
  if not found then
    raise exception 'Invite not found';
  end if;
  if not public.has_project_role(v_invite.project_id, array['owner', 'admin']) then
    raise exception 'Forbidden';
  end if;

  update public.project_invites
     set revoked_at = coalesce(revoked_at, now())
   where project_invites.id = p_invite_id
  returning project_invites.id, project_invites.revoked_at into v_invite.id, v_invite.revoked_at;

  return query select v_invite.id, v_invite.revoked_at;
end;
$$;

revoke all on function public.revoke_scorer_invite(uuid) from public, anon;
grant execute on function public.revoke_scorer_invite(uuid) to authenticated;

-- ---------------------------------------------------------------- 旧方式の撤去（不可逆）

-- 参加コードによる参加 RPC を削除。
drop function if exists public.join_project_with_scorer_code(text, text);

-- 参加コードを受け取る create_project オーバーロードを削除（引数無し版のみ残す）。
drop function if exists public.create_project_with_owner(text, text, jsonb, text, text, text);

-- 参加コードのハッシュ列を削除。
alter table public.projects drop column if exists scorer_access_code_hash;

notify pgrst, 'reload schema';
