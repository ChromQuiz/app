-- P2-e5 ②: 書き手の旧列依存を撤去する。
--
-- create_entry_atomic を「email_hash_v2 / disclosure_password_hash_v2 のみを書き込む」形へ変更し、
-- 旧列 email_hash / disclosure_password_hash へは今後書き込まない。
-- 読み手は ①(participant_auth / send-email / list_entries_for_admin / フロント)で既に旧列非依存。
--
-- ■ 順序が重要(アクティブ重複メール防止の一意性を連続維持する):
--   現在の一意制約は entries_active_email_unique_idx = UNIQUE(project_id, email_hash) WHERE status<>'canceled'
--   で「旧列 email_hash 上」に張られている。create を v2 のみ書込に変えると新規行の email_hash が NULL となり、
--   旧索引(部分ユニーク)は NULL を相互に重複と見なさないため一意性が効かなくなる。
--   よって先に v2 側の部分ユニーク索引を作成してから、旧列書込を停止する。
--
-- ■ 索引名: entries_active_email_unique_v2_idx
--   既存 Edge(create-entry / admin-create-entry)の重複判定は
--     insertError.code === '23505'  ||  message.includes('entries_active_email_unique')
--   の2段構成。SQLSTATE 23505(一意違反)は全索引共通で一致し、かつ本索引名は部分文字列
--   'entries_active_email_unique' を含むため message 側でも一致する。→ Edge 側のエラーハンドリング変更は不要。
--
-- ■ 後方互換: 旧引数 p_email_hash / p_disclosure_password_hash は signature に DEFAULT NULL で残す(INSERT はしない)。
--   これにより「migration 適用 → Edge 再デプロイ」の間、旧デプロイの create-entry(旧引数を渡す)も
--   新 create-entry(旧引数を渡さない)も、どちらも RPC 解決に失敗せず動作する(無停止切替)。
--
-- ■ 適用前提(本適用時点で確認済み): アクティブ行の email_hash_v2 は 重複0 / NULL0。email_hash のみ NOT NULL。
-- ■ ロールバック: 本 migration を revert し、dual-write 版 create_entry_atomic と email_hash NOT NULL を再作成、
--   v2 一意索引を drop する(新規行の email_hash は NULL のままになる点に留意)。

-- 1) 先に v2 のアクティブ一意(部分)索引を作成。全アクティブ行が v2 非NULL・重複0のため作成可能。
create unique index if not exists entries_active_email_unique_v2_idx
  on public.entries (project_id, email_hash_v2)
  where status <> 'canceled';

-- 2) email_hash の NOT NULL を解除(v2 のみ書込を可能にする)。disclosure_password_hash は既に nullable。
alter table public.entries alter column email_hash drop not null;

-- 3) create_entry_atomic を v2 のみ書込へ変更(旧列 email_hash / disclosure_password_hash は INSERT しない)。
create or replace function public.create_entry_atomic(
  p_project_id text,
  p_encrypted_pii text,
  p_email_hash text default null,
  p_disclosure_password_hash text default null,
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
  -- v2(peppered)ハッシュは必須。旧引数(p_email_hash / p_disclosure_password_hash)は後方互換で受けるが無視する。
  if p_email_hash_v2 is null or p_disclosure_password_hash_v2 is null then
    raise exception 'Missing participant hash';
  end if;

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

notify pgrst, 'reload schema';
