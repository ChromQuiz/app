-- 共有時の画像(X などのリンクカードに出す画像)
--
-- 公開ページ(index / entry / entry_list / terms / my / help)の og:image は、
-- 次の固定 URL を指す。
--   <SUPABASE_URL>/storage/v1/object/public/site-card/card.jpg
-- X などのクローラーは JavaScript を実行しないため、大会ごとに画像を切り替えられない。
-- 全大会で共通の1枚とし、いずれかの大会の所有者・管理者が管理画面から差し替える。
--
-- バケットは公開(public = true)。置けるのは card.jpg の1ファイルだけで、
-- 中身はブラウザで JPEG に再エンコードした画像(メタデータは残らない)。
-- 答案画像のバケット(answer-pages / answer-cells)は非公開のまま変えない。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-card', 'site-card', true, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- いずれかの大会で、有効な所有者・管理者であるか
create or replace function public.is_any_project_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.user_id = auth.uid()
      and pm.status = 'active'
      and pm.role = any(array['owner', 'admin'])
  );
$$;

revoke all on function public.is_any_project_admin() from public;
grant execute on function public.is_any_project_admin() to authenticated;

-- 上書き(upsert)には select / insert / update が要る。削除は許可しない。
drop policy if exists site_card_storage_select_admin on storage.objects;
create policy site_card_storage_select_admin
on storage.objects for select
to authenticated
using (
  bucket_id = 'site-card'
  and name = 'card.jpg'
  and public.is_any_project_admin()
);

drop policy if exists site_card_storage_insert_admin on storage.objects;
create policy site_card_storage_insert_admin
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'site-card'
  and name = 'card.jpg'
  and public.is_any_project_admin()
);

drop policy if exists site_card_storage_update_admin on storage.objects;
create policy site_card_storage_update_admin
on storage.objects for update
to authenticated
using (
  bucket_id = 'site-card'
  and name = 'card.jpg'
  and public.is_any_project_admin()
)
with check (
  bucket_id = 'site-card'
  and name = 'card.jpg'
  and public.is_any_project_admin()
);
