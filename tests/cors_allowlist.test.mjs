// V5: CORS allowlist の決定表を純関数として検証する。
//
// resolveAllowedOrigin は env / Request に依存しないため、実際の Edge 実装をそのまま import して
// 全分岐を実証できる(コード読みの主張ではなく、実行による証拠)。
// 方針は V1(署名鍵)と同じ **fail-closed**: 設定不備のときに '*' へフォールバックしない。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveAllowedOrigin } from '../supabase/functions/_shared/http.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PROD_ORIGIN = 'https://chromquiz.github.io';

describe('resolveAllowedOrigin is fail-closed (V5)', () => {
  it('returns null when the allowlist is unset (no wildcard fallback)', () => {
    expect(resolveAllowedOrigin(undefined, PROD_ORIGIN)).toBeNull();
    expect(resolveAllowedOrigin(null, PROD_ORIGIN)).toBeNull();
    expect(resolveAllowedOrigin('', PROD_ORIGIN)).toBeNull();
  });

  it('returns null when the allowlist is present but empty/whitespace', () => {
    expect(resolveAllowedOrigin('   ', PROD_ORIGIN)).toBeNull();
    expect(resolveAllowedOrigin(',', PROD_ORIGIN)).toBeNull();
    expect(resolveAllowedOrigin(' , , ', PROD_ORIGIN)).toBeNull();
  });

  it('echoes an exactly matching origin', () => {
    expect(resolveAllowedOrigin(PROD_ORIGIN, PROD_ORIGIN)).toBe(PROD_ORIGIN);
    expect(resolveAllowedOrigin(`${PROD_ORIGIN}, http://localhost:8080`, 'http://localhost:8080'))
      .toBe('http://localhost:8080');
    // 前後の空白は許容(設定の書き味)
    expect(resolveAllowedOrigin(`  ${PROD_ORIGIN}  `, PROD_ORIGIN)).toBe(PROD_ORIGIN);
  });

  it('rejects near-miss origins (exact match only)', () => {
    for (const hostile of [
      'https://chromquiz.github.io.evil.com', // サフィックス偽装
      'https://evil.com',
      'http://chromquiz.github.io',           // scheme 違い
      'https://chromquiz.github.io/',         // 末尾スラッシュ
      'https://CHROMQUIZ.github.io',          // 大文字違い
      'null',                                 // sandboxed iframe 等
    ]) {
      expect(resolveAllowedOrigin(PROD_ORIGIN, hostile), hostile).toBeNull();
    }
  });

  it('returns null when the request carries no Origin (non-browser direct call)', () => {
    expect(resolveAllowedOrigin(PROD_ORIGIN, null)).toBeNull();
    expect(resolveAllowedOrigin(PROD_ORIGIN, '')).toBeNull();
  });
});

describe('no wildcard ACAO remains anywhere in the Edge code (V5)', () => {
  it('http.ts never emits a wildcard origin', () => {
    const src = readFileSync(resolve(ROOT, 'supabase/functions/_shared/http.ts'), 'utf8');
    expect(src).not.toMatch(/return '\*'/);
    expect(src).not.toMatch(/'access-control-allow-origin':\s*'\*'/);
  });

  it('jsonResponse does not set an ACAO header itself (withCors owns it)', () => {
    const src = readFileSync(resolve(ROOT, 'supabase/functions/_shared/http.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export function jsonResponse'), src.indexOf('export function handleOptions'));
    expect(fn).not.toMatch(/access-control-allow-origin/);
  });
});
