-- P2-e5 ①-b: list_entries_for_admin の戻り値から email_hash を除去。
--
-- 背景: メール送信の宛先所有確認は send-email がサーバ側で
--       pepperHash(sha256(送信先)) == entries.email_hash_v2 を直接照合する方式へ移行した。
--       よって管理画面フロントへハッシュ(email_hash も email_hash_v2 も)を返す必要がない。
--       旧列 email_hash 撤去(P2-e5)の読み手依存を無くすため、戻り値から email_hash を削除する。
--
-- 変更点は「戻り値 TABLE から email_hash 列を除く」ことだけ。
--   - email_hash_v2 を代替で返さない(フロントへハッシュを渡さない)。
--   - 権限(authenticated への EXECUTE)・SECURITY DEFINER・search_path・has_project_role 認可・
--     並び順・その他の返却列・本体ロジックは現行のまま維持する。
--
-- 戻り値(RETURNS TABLE)の列変更は CREATE OR REPLACE では不可のため drop + create。
-- overload は残さない(同名の別シグネチャは作らない)。
-- ロールバック: 本migrationを revert し、email_hash を含む従前定義を再作成する。

drop function if exists public.list_entries_for_admin(text);

create function public.list_entries_for_admin(p_project_id text)
returns table(
  id uuid,
  entry_number integer,
  encrypted_pii text,
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

notify pgrst, 'reload schema';
