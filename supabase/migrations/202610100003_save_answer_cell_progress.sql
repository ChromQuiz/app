-- 解答欄画像のサーバー生成：途中経過を保存する関数。
--
-- 原因: サーバー(service_role)は answer_pages に、直接の select / update の権限を持っていない。
-- そのため、サーバーが画像を保存しても、「作成済み」の印が更新されず、全員が先頭10問のまま進まなかった。
--
-- 対策: テーブルに権限を足さず、cellGeneration（作成状況）だけを書き換える関数を用意する。
--   - 書き換えられるのは cells の cellGeneration だけ。regions と pageWidth は触らない。
--   - 呼べるのは service_role（Edge Function）だけ。画面(anon / authenticated)からは呼べない。

create or replace function public.save_answer_cell_progress(p_page_id uuid, p_generation jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.answer_pages
  set cells = jsonb_set(coalesce(cells, '{}'::jsonb), '{cellGeneration}', p_generation)
  where id = p_page_id;
$$;

revoke all on function public.save_answer_cell_progress(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_answer_cell_progress(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
