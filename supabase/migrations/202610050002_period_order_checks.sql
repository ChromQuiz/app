-- 開始と終了の日時の順序を、データベースでも守る。
--
-- これまで、終了を開始より前にしても保存できた(画面にも検査がなかった)。
-- 画面では保存の前に確認するが、画面の検査だけに頼らず、データベースの制約にもする。
-- 片方が未設定のときは検査しない(未設定は「期限なし」の意味)。
-- 適用時点の本番のデータに、順序が逆の行がないことは確認済み。

alter table public.projects
  drop constraint if exists projects_entry_period_order_check,
  drop constraint if exists projects_disclosure_period_order_check;

alter table public.projects
  add constraint projects_entry_period_order_check
    check (period_start is null or period_end is null or period_end > period_start),
  add constraint projects_disclosure_period_order_check
    check (disclosure_period_start is null or disclosure_period_end is null or disclosure_period_end > disclosure_period_start);
