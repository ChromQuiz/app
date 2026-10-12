// 1回に最大1000件という、サーバーの上限をこえる表を、全部そろえて取る。
// pageQuery(from, to) は、from〜to 行目(両端を含む)を返す問い合わせ。1000件に満たないページが来たら終わり。
export const SELECT_PAGE_SIZE = 1000;
export async function selectAllRows<T>(
  pageQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += SELECT_PAGE_SIZE) {
    const { data, error } = await pageQuery(from, from + SELECT_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < SELECT_PAGE_SIZE) return rows;
  }
}
