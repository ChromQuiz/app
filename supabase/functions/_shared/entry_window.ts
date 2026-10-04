// entry_window.ts — エントリーの受付の窓(受付中かどうか)の判定。
//
// 「受付中」= 受付スイッチがオンで、かつ開始・終了の期間の中にいる。
// 編集(受付中だけ)と遅刻の連絡(受付中でないときだけ)の切り替えに使うので、
// 判定を1か所にまとめ、画面の表示(my-entry の capabilities)と各操作の再検証で食い違わないようにする。

export type EntryWindowProject = {
  entry_open: boolean;
  period_start: string | null;
  period_end: string | null;
};

export function isWithinPeriod(start: string | null, end: string | null, now = Date.now()): boolean {
  if (start && new Date(start).getTime() > now) return false;
  if (end && new Date(end).getTime() < now) return false;
  return true;
}

export function isEntryWindowOpen(project: EntryWindowProject, now = Date.now()): boolean {
  return project.entry_open === true && isWithinPeriod(project.period_start, project.period_end, now);
}
