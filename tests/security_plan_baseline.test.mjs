// 親計画（docs/security-hardening-plan.md）の Baseline 凍結を機械的に守るためのテスト。
//
// 凍結ルール:
//   1. 親計画に V 番号を追加しない（V1〜V13 のみ）
//   2. Phase 4 以降を作らない
//   3. 凍結後の新規事項は「Additional Security Backlog」へ積む
//   4. 体系的な見直しは「Security Plan v2」を新規作成する
//
// これらを人の注意力に頼らず CI で担保する。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PLAN = readFileSync(resolve(ROOT, 'docs/security-hardening-plan.md'), 'utf8');

// 親計画本体（Additional Security Backlog より前）だけを対象にする。
// 冒頭の Baseline ブロックは「V14 以降を作らない」「Phase 4 以降も作らない」という
// ルールそのものを述べているため、走査対象から外す（ルール文と違反を取り違えないように）。
const PLAN_BODY = PLAN.slice(0, PLAN.indexOf('# Additional Security Backlog'));
const RULES_END = PLAN.indexOf('## 1. 脅威モデル');
const PLAN_RULES = PLAN.slice(0, RULES_END);          // 凍結ルールの記述
const PLAN_CONTENT = PLAN_BODY.slice(RULES_END);      // 計画の実体（V項目・Phase定義など）

describe('the parent security plan stays frozen at Baseline v1.0', () => {
  it('declares its baseline status, version and validation date', () => {
    expect(PLAN).toMatch(/\*\*Status\*\*\s*\|\s*\*\*Completed\*\*/);
    expect(PLAN).toMatch(/\*\*Version\*\*\s*\|\s*\*\*1\.0（Baseline \/ 凍結）\*\*/);
    expect(PLAN).toMatch(/\*\*Last validated\*\*\s*\|\s*\*\*\d{4}-\d{2}-\d{2}\*\*/);
  });

  it('contains exactly V1..V13 in the vulnerability table - no new V numbers', () => {
    const rows = [...PLAN_BODY.matchAll(/^\| (V\d+) \|/gm)].map((m) => m[1]);
    expect(rows).toEqual([
      'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12', 'V13',
    ]);
  });

  it('never introduces V14 or beyond in the plan content', () => {
    expect(PLAN_CONTENT).not.toMatch(/\bV1[4-9]\b/);
    expect(PLAN_CONTENT).not.toMatch(/\bV[2-9]\d\b/);
    // ルール側には「V14 以降を作らない」と明記されていること
    expect(PLAN_RULES).toMatch(/V14 以降を作らない/);
  });

  it('never introduces a Phase 4 or later in the plan content', () => {
    expect(PLAN_CONTENT).not.toMatch(/Phase\s*[4-9]/);
    expect(PLAN_RULES).toMatch(/Phase 4 以降も作らない/);
  });

  it('keeps a separate Additional Security Backlog for post-freeze findings', () => {
    expect(PLAN).toMatch(/# Additional Security Backlog（親計画外）/);
    // 凍結後の発見はここに積む（現時点では scorer access code の 1 件）
    expect(PLAN).toMatch(/## AB-1\. Scorer access code hardening/);
  });

  it('states the escalation path: a systematic revision becomes Security Plan v2', () => {
    expect(PLAN).toMatch(/Security Plan v2/);
  });

  it('records every phase as Completed', () => {
    expect(PLAN).toMatch(/Phase 1 判定 = ✅ Completed/);
    expect(PLAN).toMatch(/Phase 2 判定 = ✅ Completed/);
    expect(PLAN).toMatch(/Phase 3 判定 = ✅ Completed/);
  });
});
