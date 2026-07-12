-- P2-e1: 参加者認証ハッシュ pepper 化(v2)の受け皿。追加のみ・非破壊。
-- entries に v2 列(HMAC(pepper, clientHash) 保存先)と検索用の【非unique】index を追加し、
-- create_entry_atomic を v2 引数を末尾に持つ「単一関数」へ置換する(overload を残さない)。
--
-- 本 migration が行うのは受け皿の用意のみ:
--   - dual-write の Edge 配線・dual-read・バックフィル・unique index 切替・旧列削除は含めない。
--   - 既存の email_hash / disclosure_password_hash / entries_active_email_unique_idx / 既存データには触れない。

alter table public.entries
  add column if not exists email_hash_v2 text,
  add column if not exists disclosure_password_hash_v2 text;

-- 検索用の非unique index のみ(unique 切替は移行完了後の別段階)
create index if not exists entries_email_hash_v2_idx
  on public.entries (project_id, email_hash_v2);

-- overload 曖昧性を避けるため、旧10引数シグネチャを明示的に削除してから単一関数として再作成する。
-- DROP と CREATE は本 migration の同一トランザクション内で実行される。
-- 定義は本番稼働中(202607080003 相当)の最新ロジックをそのまま保持し、
-- 変更点は「v2引数2件の追加」と「entries INSERT への v2列2件の追加」のみ。
drop function if exists public.create_entry_atomic(
  text, text, text, text, text, text, text, text, text, boolean
);

create or replace function public.create_entry_atomic(
  p_project_id text,
  p_encrypted_pii text,
  p_email_hash text,
  p_disclosure_password_hash text,
  p_entry_name text default null,
  p_affiliation text default null,
  p_grade text default null,
  p_message text default null,
  p_inquiry text default null,
  p_is_chubu boolean default false,
  p_email_hash_v2 text default null,
  p_disclosure_password_hash_v2 text default null
)
returns table(id uuid, entry_number integer, status text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_project public.projects%rowtype;
  v_entry_number integer;
  v_entry_id uuid;
  v_status text;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id));

  select *
    into v_project
    from public.projects
    where projects.id = p_project_id
    for update;

  if not found then
    raise exception 'Project not found';
  end if;
  if not v_project.entry_open then
    raise exception 'Entry is closed';
  end if;
  if v_project.period_start is not null and v_project.period_start > now() then
    raise exception 'Entry period has not started';
  end if;
  if v_project.period_end is not null and v_project.period_end < now() then
    raise exception 'Entry period has ended';
  end if;

  v_entry_number := v_project.last_entry_number + 1;

  insert into public.entries (
    project_id,
    entry_number,
    encrypted_pii,
    email_hash,
    disclosure_password_hash,
    email_hash_v2,
    disclosure_password_hash_v2,
    entry_name,
    affiliation,
    grade,
    message,
    inquiry,
    is_chubu,
    status
  )
  values (
    p_project_id,
    v_entry_number,
    p_encrypted_pii,
    p_email_hash,
    p_disclosure_password_hash,
    p_email_hash_v2,
    p_disclosure_password_hash_v2,
    p_entry_name,
    p_affiliation,
    p_grade,
    p_message,
    p_inquiry,
    coalesce(p_is_chubu, false),
    'registered'
  )
  returning entries.id into v_entry_id;

  update public.projects
    set last_entry_number = v_entry_number
    where projects.id = p_project_id;

  perform public.recompute_entry_statuses(p_project_id, true);

  select entries.status
    into v_status
    from public.entries
    where entries.id = v_entry_id;

  return query select v_entry_id, v_entry_number, v_status;
end;
$function$;

revoke all on function public.create_entry_atomic(
  text, text, text, text, text, text, text, text, text, boolean, text, text
) from public, anon, authenticated;

grant execute on function public.create_entry_atomic(
  text, text, text, text, text, text, text, text, text, boolean, text, text
) to service_role;

-- 単一関数へ置換したため、PostgREST のスキーマキャッシュを再読込させる。
notify pgrst, 'reload schema';
