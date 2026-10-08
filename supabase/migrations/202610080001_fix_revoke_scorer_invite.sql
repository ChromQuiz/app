-- 招待リンクの失効（revoke_scorer_invite）が、常に失敗していた不具合の修正。
--
-- 原因: 関数の戻り値の列名（revoked_at）と、表 project_invites の列名（revoked_at）が同じで、
--   UPDATE の `coalesce(revoked_at, now())` が「どちらの revoked_at か曖昧」というエラーになっていた。
--   管理画面の「失効」ボタンが、公開（2026-07-27）以来、動いていなかった。
-- 修正: 表の列を、表名つきで書く。挙動（すでに失効していれば、失効の日時を変えない）は変えない。
--
-- ロールバック: 前の定義（202607270001_scorer_invite_links.sql）に戻す。ただし戻すと、また失敗する。

create or replace function public.revoke_scorer_invite(p_invite_id uuid)
returns table (id uuid, revoked_at timestamptz)
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
     set revoked_at = coalesce(project_invites.revoked_at, now())
   where project_invites.id = p_invite_id
  returning project_invites.id, project_invites.revoked_at into v_invite.id, v_invite.revoked_at;

  return query select v_invite.id, v_invite.revoked_at;
end;
$$;

revoke all on function public.revoke_scorer_invite(uuid) from public, anon;
grant execute on function public.revoke_scorer_invite(uuid) to authenticated;
