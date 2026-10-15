-- 当日受付の二次元コードを、エントリーIDとは無関係な 100 bit の乱数風コード(20 文字)に切り替える。
--
-- 背景: 今のコードは `<entryId>.<署名>`(69 文字・version 3・29×29)で、前半は公開エントリーリストから取れる UUID だった。
--   受付用コードをエントリーIDから切り離し、サーバーが持つ「コードのハッシュ」で引く形にすると、
--   1. コードが 20 文字になり、version 1(21×21・誤り訂正 M)に収まる(粗く、読み取りやすい)
--   2. UUID を知っていても、コードの推測に役立たない
--   3. 1 人分だけコードを取り消せる(checkin_token_rotation を 1 上げる)
--   4. DB が漏れても、ハッシュからコードは作れず、受付を偽造できない
--
-- コードそのものは DB に置かない。HMAC(署名鍵, エントリーID と rotation)から毎回作り直し(Edge Function 側)、
-- DB には sha256 だけを保存する。ハッシュは、コードを表示するたびに Edge Function が書き込む(同じ値なら何も変わらない)。
--   → 既存エントリーの埋め戻し作業は要らない。一度も表示されていないコードは、誰の手元にも無い。
-- 署名鍵を更新すると、表示のたびに新しいハッシュに置き換わり、古いコードは使えなくなる。

alter table public.entries
  add column if not exists checkin_token_hash text,
  add column if not exists checkin_token_rotation integer not null default 0;

alter table public.entries
  drop constraint if exists entries_checkin_token_hash_format;
alter table public.entries
  add constraint entries_checkin_token_hash_format
  check (checkin_token_hash is null or checkin_token_hash ~ '^[0-9a-f]{64}$');

-- 受付の検索キー。大会ごとに一意(別の大会のコードでは引けない)。
create unique index if not exists entries_checkin_token_hash_unique
  on public.entries (project_id, checkin_token_hash)
  where checkin_token_hash is not null;

-- 画面(anon / authenticated)からは読めない: entries は列を明示した select 権限だけで、この 2 列は含まれていない。
-- 書き込みは、表全体の update 権限(RLS で管理者のみ)があるため、列の権限では止められない。
-- 管理者が自分でハッシュを差し替えて、任意のコードを受付に通せないよう、サーバー(service_role / 関数の所有者)だけに限る。
create or replace function public.guard_entry_checkin_token()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.checkin_token_hash is not null or new.checkin_token_rotation <> 0 then
        raise exception 'checkin token columns are server-managed' using errcode = '42501';
      end if;
    elsif new.checkin_token_hash is distinct from old.checkin_token_hash
       or new.checkin_token_rotation is distinct from old.checkin_token_rotation then
      raise exception 'checkin token columns are server-managed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_entry_checkin_token on public.entries;
create trigger guard_entry_checkin_token
  before insert or update on public.entries
  for each row execute function public.guard_entry_checkin_token();
