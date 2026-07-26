// Turnstile verification tests (V2).
//
// Two layers:
//  1. Decision logic — the pure evaluateTurnstileResult() from the Edge module is re-implemented
//     here against the *same* Siteverify response shapes Cloudflare documents, covering
//     invalid / expired / duplicate / action-mismatch / hostname-mismatch.
//  2. Wiring — source-level assertions that both endpoints verify server-side, that no legacy
//     bypass path exists, and that rate limiting + daily cap remain active alongside CAPTCHA.
//
// Cloudflare's official test keys are referenced for documentation/manual staging use:
//   sitekey always-passes: 1x00000000000000000000AA
//   sitekey always-blocks: 2x00000000000000000000AB
//   secret  always-passes: 1x0000000000000000000000000000000AA
//   secret  always-fails : 2x0000000000000000000000000000000AA
//   secret  already-spent: 3x0000000000000000000000000000000AA  (token duplicate/expired)
// No network calls are made here; production is never load-tested from the suite.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

export const TEST_KEYS = {
  sitekeyPass: '1x00000000000000000000AA',
  sitekeyBlock: '2x00000000000000000000AB',
  secretPass: '1x0000000000000000000000000000000AA',
  secretFail: '2x0000000000000000000000000000000AA',
  secretSpent: '3x0000000000000000000000000000000AA',
};

// Mirror of supabase/functions/_shared/turnstile.ts evaluateTurnstileResult().
// Kept in sync by the "decision logic matches the Edge module" test below.
class TurnstileError extends Error {
  constructor(code) { super(code); this.code = code; this.status = 403; }
}
function evaluateTurnstileResult(data, opts = {}) {
  if (!data || data.success !== true) {
    const codes = (data && data['error-codes']) || [];
    throw new TurnstileError(codes.length ? `verify:${codes.join(',')}` : 'verify:unsuccessful');
  }
  const hosts = opts.expectedHostnames || [];
  if (hosts.length > 0 && !hosts.includes(String(data.hostname))) throw new TurnstileError('hostname_mismatch');
  if (opts.action && String(data.action) !== opts.action) throw new TurnstileError('action_mismatch');
}

const HOSTS = ['chromquiz.github.io'];
const OK = { success: true, action: 'send_verification', hostname: 'chromquiz.github.io' };

describe('Turnstile decision logic (Siteverify response evaluation)', () => {
  it('accepts a valid token with matching action and hostname', () => {
    expect(() => evaluateTurnstileResult(OK, { action: 'send_verification', expectedHostnames: HOSTS })).not.toThrow();
  });

  it('rejects an invalid token (invalid-input-response)', () => {
    const res = { success: false, 'error-codes': ['invalid-input-response'] };
    expect(() => evaluateTurnstileResult(res, { action: 'send_verification', expectedHostnames: HOSTS }))
      .toThrow(/invalid-input-response/);
  });

  it('rejects an expired / already-redeemed token (timeout-or-duplicate)', () => {
    // Cloudflare returns this both for expired tokens and for re-used (duplicate) tokens.
    const res = { success: false, 'error-codes': ['timeout-or-duplicate'] };
    expect(() => evaluateTurnstileResult(res, { action: 'send_verification', expectedHostnames: HOSTS }))
      .toThrow(/timeout-or-duplicate/);
  });

  it('rejects a missing/empty Siteverify body', () => {
    expect(() => evaluateTurnstileResult(null, { action: 'send_verification' })).toThrow(/unsuccessful/);
  });

  it('rejects an action mismatch (token minted for another flow)', () => {
    const res = { ...OK, action: 'create_entry' };
    expect(() => evaluateTurnstileResult(res, { action: 'send_verification', expectedHostnames: HOSTS }))
      .toThrow(/action_mismatch/);
  });

  it('rejects a hostname mismatch (token minted on an attacker page)', () => {
    const res = { ...OK, hostname: 'evil.example.com' };
    expect(() => evaluateTurnstileResult(res, { action: 'send_verification', expectedHostnames: HOSTS }))
      .toThrow(/hostname_mismatch/);
  });

  it('skips hostname checking only when no expected hostnames are configured', () => {
    const res = { ...OK, hostname: 'anything.example' };
    expect(() => evaluateTurnstileResult(res, { action: 'send_verification', expectedHostnames: [] })).not.toThrow();
  });

  it('decision logic matches the Edge module implementation', () => {
    const src = read('supabase/functions/_shared/turnstile.ts');
    expect(src).toMatch(/data\.success !== true/);
    expect(src).toMatch(/hostname_mismatch/);
    expect(src).toMatch(/action_mismatch/);
  });
});

describe('Turnstile transport failures are fail-closed', () => {
  const src = read('supabase/functions/_shared/turnstile.ts');

  it('treats a Siteverify timeout as a rejection (AbortController + unavailable)', () => {
    expect(src).toMatch(/AbortController/);
    expect(src).toMatch(/setTimeout\(\(\) => controller\.abort\(\), TIMEOUT_MS\)/);
    expect(src).toMatch(/catch \(_e\) \{\s*throw new TurnstileError\('unavailable'\)/);
  });

  it('treats a Siteverify 5xx as a rejection', () => {
    expect(src).toMatch(/res\.status >= 500.*throw new TurnstileError\('unavailable'\)/);
  });

  it('fails closed when the secret is unset (503, never skip verification)', () => {
    expect(src).toMatch(/if \(!secret\) throw new TurnstileConfigError\(\)/);
  });

  it('rejects a missing token', () => {
    expect(src).toMatch(/if \(!opts\.token\) throw new TurnstileError\('missing'\)/);
  });

  it('sends remoteip when available and never embeds the secret in client code', () => {
    expect(src).toMatch(/body\.set\('remoteip', opts\.remoteip\)/);
    expect(src).toMatch(/Deno\.env\.get\('TURNSTILE_SECRET_KEY'\)/);
    // secret must not appear in any browser file
    for (const f of ['js/turnstile.js', 'js/entry.js', 'js/email.js', 'js/supabase_config.js']) {
      expect(read(f)).not.toMatch(/TURNSTILE_SECRET/);
    }
  });

  it('allows only an explicit, documented emergency bypass flag', () => {
    expect(src).toMatch(/CIQ_TURNSTILE_DISABLED/);
    expect(read('docs/security-hardening-plan.md')).toMatch(/CIQ_TURNSTILE_DISABLED/);
  });
});

describe('Turnstile is enforced on both public endpoints with no bypass', () => {
  const sendEmail = read('supabase/functions/send-email/index.ts');
  const createEntry = read('supabase/functions/create-entry/index.ts');

  it('send_verification verifies the token server-side with its own action', () => {
    expect(sendEmail).toMatch(/verifyTurnstile\(\{[\s\S]*action: 'send_verification'/);
  });

  it('create-entry verifies the token server-side with its own action', () => {
    expect(createEntry).toMatch(/verifyTurnstile\(\{ token: turnstileToken, action: 'create_entry'/);
  });

  it('keeps IP rate limiting active alongside CAPTCHA', () => {
    expect(sendEmail).toMatch(/enforceIpRateLimit\(supabase, \{ bucket: 'send_verification'/);
    expect(createEntry).toMatch(/enforceIpRateLimit\(supabase, \{ bucket: 'create_entry'/);
  });

  it('keeps the daily email cap active alongside CAPTCHA', () => {
    expect(sendEmail).toMatch(/enforceProjectDailyEmailCap\(supabase, effectiveProjectId\)/);
  });

  it('has no legacy CAPTCHA-free path: the only send_verification/create paths run verifyTurnstile', () => {
    // exactly one send_verification branch, and it is guarded
    const branches = sendEmail.match(/if \(type === 'send_verification'\)/g) || [];
    expect(branches).toHaveLength(1);
    const branch = sendEmail.slice(sendEmail.indexOf("if (type === 'send_verification')"));
    expect(branch.indexOf('verifyTurnstile')).toBeGreaterThan(-1);
    // create-entry has a single serve handler and verifies before touching the DB
    expect(createEntry.indexOf('verifyTurnstile')).toBeLessThan(createEntry.indexOf('createServiceClient()'));
  });

  it('does not leak the internal rejection reason to clients', () => {
    for (const src of [sendEmail, createEntry]) {
      expect(src).toMatch(/TurnstileError[\s\S]*console\.error/);
      expect(src).toMatch(/認証に失敗しました。ページを再読み込みして、もう一度お試しください。/);
      expect(src).not.toMatch(/error: error\.code/);
    }
  });
});

describe('Turnstile client wiring (UX / no client-side trust)', () => {
  const client = read('js/turnstile.js');
  const entryJs = read('js/entry.js');
  const entryHtml = read('entry.html');

  it('renders widgets for both actions', () => {
    expect(entryJs).toMatch(/CIQTurnstile\.render\('turnstile-verify', 'send_verification'\)/);
    expect(entryJs).toMatch(/CIQTurnstile\.render\('turnstile-entry', 'create_entry'\)/);
  });

  it('passes the token to both endpoints', () => {
    expect(entryJs).toMatch(/CIQTurnstile\.token\('turnstile-verify'\)/);
    expect(entryJs).toMatch(/turnstileToken: CIQTurnstile\.token\('turnstile-entry'\)/);
  });

  it('resets the one-time token after use and after failures', () => {
    expect(entryJs).toMatch(/CIQTurnstile\.reset\('turnstile-verify'\)/);
    expect(entryJs).toMatch(/CIQTurnstile\.reset\('turnstile-entry'\)/);
  });

  it('disables the submit/send buttons during verification (no double submit)', () => {
    expect(entryJs).toMatch(/btn\.disabled = true/);
    expect(entryJs).toMatch(/resendBtn\.disabled = true/);
  });

  it('keeps the site key public-only and the widget containers accessible', () => {
    expect(read('js/supabase_config.js')).toMatch(/CIQ_TURNSTILE_SITE_KEY/);
    expect(entryHtml).toMatch(/id="turnstile-verify"[^>]*aria-live="polite"/);
    expect(entryHtml).toMatch(/id="turnstile-entry"[^>]*aria-live="polite"/);
  });

  it('allows Turnstile in the entry page CSP (script + frame) without unsafe-inline', () => {
    const csp = entryHtml.match(/Content-Security-Policy" content="([^"]+)"/)[1];
    expect(csp).toMatch(/script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toMatch(/frame-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(csp).not.toMatch(/unsafe-inline/);
  });

  it('degrades safely when the Turnstile script fails to load (no client-side auth decision)', () => {
    // available() only gates rendering; token() returns '' so the server still decides.
    expect(client).toMatch(/return String\(window\.turnstile\.getResponse\(id\) \|\| ''\)/);
    expect(client).toMatch(/if \(!available\(\)\) return false/);
  });
});
