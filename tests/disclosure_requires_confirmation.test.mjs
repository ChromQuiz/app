import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(import.meta.dirname, '..', p), 'utf8');

describe('成績照会は、全問が確定したあとだけ', () => {
  const fn = read('supabase/functions/disclose-result/index.ts');

  it('点数と順位を計算する前に、確定しているかをサーバーで確かめる', () => {
    const check = fn.indexOf("rpc('scoring_confirmation'");
    const calc = fn.indexOf("from('final_results')");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(calc);
    expect(fn).toContain('成績はまだ出ていません');
  });

  it('確定していないときは、成績を返さない（409）', () => {
    expect(fn).toMatch(/confirmed\?\.?[^\n]*\n?[\s\S]{0,200}409/);
  });

  it('確認の関数は、service_role だけが呼べる', () => {
    const sql = read('supabase/migrations/202610120005_scoring_confirmation.sql');
    expect(sql).toContain('revoke all on function public.scoring_confirmation(text) from public, anon, authenticated;');
    expect(sql).toContain('grant execute on function public.scoring_confirmation(text) to service_role;');
  });
});
