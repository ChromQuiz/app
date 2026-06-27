-- Supabase scoring flow: question scorer slots, vote RPCs, and automatic unanimous finalization.

create table if not exists public.question_scorers (
  project_id text not null references public.projects(id) on delete cascade,
  question_number integer not null check (question_number > 0),
  scorer_member_id uuid not null references public.project_members(id) on delete cascade,
  completed_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (project_id, question_number, scorer_member_id)
);

alter table public.question_scorers enable row level security;

drop policy if exists question_scorers_select_member on public.question_scorers;
create policy question_scorers_select_member
on public.question_scorers for select
using (public.is_project_member(project_id));

drop policy if exists question_scorers_insert_self on public.question_scorers;
create policy question_scorers_insert_self
on public.question_scorers for insert
with check (
  public.has_project_role(project_id, array['owner', 'admin', 'scorer'])
  and scorer_member_id = public.current_member_id(project_id)
);

drop policy if exists question_scorers_update_self_or_admin on public.question_scorers;
create policy question_scorers_update_self_or_admin
on public.question_scorers for update
using (
  scorer_member_id = public.current_member_id(project_id)
  or public.has_project_role(project_id, array['owner', 'admin'])
)
with check (
  scorer_member_id = public.current_member_id(project_id)
  or public.has_project_role(project_id, array['owner', 'admin'])
);

create index if not exists question_scorers_project_question_idx
  on public.question_scorers(project_id, question_number);

do $$
begin
  alter publication supabase_realtime add table public.question_scorers;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.score_votes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.final_results;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

create or replace function public.join_question_scorer(
  p_project_id text,
  p_question_number integer
)
returns table(project_id text, question_number integer, scorer_member_id uuid, completed_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := public.current_member_id(p_project_id);
  v_required integer;
  v_joined_count integer;
  v_row public.question_scorers%rowtype;
begin
  if v_member_id is null or not public.has_project_role(p_project_id, array['owner', 'admin', 'scorer']) then
    raise exception 'Forbidden';
  end if;

  select required_scorers into v_required
  from public.projects
  where id = p_project_id;
  if not found then
    raise exception 'Project not found';
  end if;

  select *
    into v_row
    from public.question_scorers qs
    where qs.project_id = p_project_id
      and qs.question_number = p_question_number
      and qs.scorer_member_id = v_member_id;
  if found then
    return query select v_row.project_id, v_row.question_number, v_row.scorer_member_id, v_row.completed_at;
    return;
  end if;

  select count(*)
    into v_joined_count
    from public.question_scorers qs
    where qs.project_id = p_project_id
      and qs.question_number = p_question_number;

  if v_joined_count >= v_required then
    raise exception 'Question is full';
  end if;

  insert into public.question_scorers(project_id, question_number, scorer_member_id)
  values (p_project_id, p_question_number, v_member_id)
  returning * into v_row;

  return query select v_row.project_id, v_row.question_number, v_row.scorer_member_id, v_row.completed_at;
end;
$$;

revoke all on function public.join_question_scorer(text, integer) from public, anon;
grant execute on function public.join_question_scorer(text, integer) to authenticated;

create or replace function public.set_score_vote(
  p_project_id text,
  p_question_number integer,
  p_entry_id uuid,
  p_result text
)
returns table(id uuid, project_id text, question_number integer, entry_id uuid, scorer_member_id uuid, result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := public.current_member_id(p_project_id);
  v_vote public.score_votes%rowtype;
begin
  if p_result not in ('correct', 'wrong', 'hold') then
    raise exception 'Invalid result';
  end if;
  if v_member_id is null or not public.has_project_role(p_project_id, array['owner', 'admin', 'scorer']) then
    raise exception 'Forbidden';
  end if;
  if not exists (
    select 1 from public.question_scorers qs
    where qs.project_id = p_project_id
      and qs.question_number = p_question_number
      and qs.scorer_member_id = v_member_id
  ) then
    perform public.join_question_scorer(p_project_id, p_question_number);
  end if;
  if not exists (
    select 1 from public.entries e
    where e.id = p_entry_id
      and e.project_id = p_project_id
  ) then
    raise exception 'Entry not found';
  end if;

  insert into public.score_votes(project_id, question_number, entry_id, scorer_member_id, result)
  values (p_project_id, p_question_number, p_entry_id, v_member_id, p_result)
  on conflict (project_id, question_number, entry_id, scorer_member_id) do update
    set result = excluded.result,
        updated_at = now()
  returning * into v_vote;

  insert into public.score_events(project_id, question_number, entry_id, actor_member_id, event_type, new_result)
  values (p_project_id, p_question_number, p_entry_id, v_member_id, 'vote_changed', p_result);

  return query select v_vote.id, v_vote.project_id, v_vote.question_number, v_vote.entry_id, v_vote.scorer_member_id, v_vote.result;
end;
$$;

revoke all on function public.set_score_vote(text, integer, uuid, text) from public, anon;
grant execute on function public.set_score_vote(text, integer, uuid, text) to authenticated;

create or replace function public.complete_question_scoring(
  p_project_id text,
  p_question_number integer
)
returns table(completed boolean, finalized_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := public.current_member_id(p_project_id);
  v_required integer;
  v_completed_count integer;
  v_finalized integer := 0;
  v_entry record;
  v_correct_count integer;
  v_wrong_count integer;
  v_result text;
begin
  if v_member_id is null or not public.has_project_role(p_project_id, array['owner', 'admin', 'scorer']) then
    raise exception 'Forbidden';
  end if;

  update public.question_scorers
    set completed_at = now()
    where project_id = p_project_id
      and question_number = p_question_number
      and scorer_member_id = v_member_id;

  select required_scorers into v_required
  from public.projects
  where id = p_project_id;

  select count(*) into v_completed_count
  from public.question_scorers qs
  where qs.project_id = p_project_id
    and qs.question_number = p_question_number
    and qs.completed_at is not null;

  if v_completed_count < v_required then
    return query select true, 0;
    return;
  end if;

  for v_entry in
    select e.id
    from public.entries e
    where e.project_id = p_project_id
      and e.status in ('registered', 'late')
  loop
    select
      count(*) filter (where sv.result = 'correct'),
      count(*) filter (where sv.result = 'wrong')
    into v_correct_count, v_wrong_count
    from public.score_votes sv
    where sv.project_id = p_project_id
      and sv.question_number = p_question_number
      and sv.entry_id = v_entry.id;

    v_result := null;
    if v_correct_count >= v_required then
      v_result := 'correct';
    elsif v_wrong_count >= v_required then
      v_result := 'wrong';
    end if;

    if v_result is not null then
      insert into public.final_results(project_id, question_number, entry_id, result, decided_by)
      values (p_project_id, p_question_number, v_entry.id, v_result, v_member_id)
      on conflict (project_id, question_number, entry_id) do nothing;
      if found then
        v_finalized := v_finalized + 1;
        insert into public.score_events(project_id, question_number, entry_id, actor_member_id, event_type, new_result)
        values (p_project_id, p_question_number, v_entry.id, v_member_id, 'finalized', v_result);
      end if;
    end if;
  end loop;

  return query select true, v_finalized;
end;
$$;

revoke all on function public.complete_question_scoring(text, integer) from public, anon;
grant execute on function public.complete_question_scoring(text, integer) to authenticated;
