-- 解答欄の画像のサーバー生成：「作成中」を取り直すまでの時間を、3分から1分に縮める。
--
-- サーバーは、作りながら途中経過を保存する（そのたびに「作成中」の開始時刻も更新する）。
-- 止められた関数が残した「作成中」は、1分で取り直せればよい。
--
-- （元の説明）解答欄の画像を、サーバー(Edge Function)が作るための「作業の受け取り」。
--
-- 解答欄の画像は、これまで運営画面を開いているブラウザだけが作れた。画面を閉じると止まるため、
-- 取り込み直後に採点が始まると、用紙全体のダウンロードと切り出しで1問目が約10秒かかった。
-- サーバーが作れば、誰も画面を開いていなくても進む。
--
-- この関数は、まだ作り終わっていない用紙を最大 p_limit 件、「作成中」にして返す。
--   - 同じ用紙を、並行して動く複数の呼び出しが取り合わない(for update skip locked)。
--   - 「作成中」のまま1分以上たったものは、途中で止まったとみなして取り直す。
--   - 「失敗」になったものは、30分たつまで取り直さない(壊れた画像を、毎分やり直し続けない)。
--   - 呼べるのは service_role(Edge Function)だけ。画面(anon / authenticated)からは呼べない。

create or replace function public.claim_answer_cell_pages(p_project_id text default null, p_limit integer default 2)
returns table (
  id uuid,
  project_id text,
  entry_id uuid,
  entry_number integer,
  storage_path text,
  cells jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select a.id
    from public.answer_pages a
    where (p_project_id is null or a.project_id = p_project_id)
      and coalesce(a.cells->'cellGeneration'->>'status', 'not_started') <> 'complete'
      and not (
        a.cells->'cellGeneration'->>'status' = 'processing'
        and nullif(a.cells->'cellGeneration'->>'startedAt', '')::timestamptz > now() - interval '1 minute'
      )
      and not (
        a.cells->'cellGeneration'->>'status' = 'failed'
        and nullif(a.cells->'cellGeneration'->>'failedAt', '')::timestamptz > now() - interval '30 minutes'
      )
    order by a.uploaded_at, a.id
    limit greatest(1, least(coalesce(p_limit, 2), 10))
    for update skip locked
  ),
  claimed as (
    update public.answer_pages a
    set cells = jsonb_set(
      a.cells,
      '{cellGeneration}',
      coalesce(a.cells->'cellGeneration', '{}'::jsonb)
        || jsonb_build_object('status', 'processing', 'startedAt', to_jsonb(to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    )
    from picked
    where a.id = picked.id
    returning a.id, a.project_id, a.entry_id, a.storage_path, a.cells
  )
  select c.id, c.project_id, c.entry_id, e.entry_number, c.storage_path, c.cells
  from claimed c
  join public.entries e on e.id = c.entry_id;
end;
$$;

revoke all on function public.claim_answer_cell_pages(text, integer) from public, anon, authenticated;
grant execute on function public.claim_answer_cell_pages(text, integer) to service_role;

notify pgrst, 'reload schema';
