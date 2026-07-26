// access-control-allow-origin はここでは付けない。withCors() が allowlist に基づいて
// 「許可された Origin のみ」を後付けする(既定で '*' を出さない = fail-closed)。
export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });
}

export function handleOptions(req: Request) {
  if (req.method === 'OPTIONS') return jsonResponse({ ok: true });
  return null;
}

/**
 * allowlist の解決(純関数・env と Request に依存しないためテスト可能)。
 *
 * **fail-closed**: V1(署名鍵)と同じ方針で、設定不備のときに弱い既定値へ倒さない。
 * - CIQ_ALLOWED_ORIGINS 未設定/空/空白のみ → null(ACAO を付与しない。'*' へはフォールバックしない)
 * - 設定あり かつ Origin が一覧内(完全一致) → その Origin をエコー
 * - 設定あり かつ Origin が一覧外/無し → null
 *
 * 完全一致のみ(ワイルドカード・サフィックス一致は行わない)。scheme/port/末尾スラッシュの違いは別 Origin。
 */
export function resolveAllowedOrigin(raw: string | undefined | null, origin: string | null): string | null {
  if (!raw) return null;
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return null;
  if (origin && list.includes(origin)) return origin;
  return null;
}

/** リクエストの Origin に対して許可すべき値を返す(env を読んで resolveAllowedOrigin に委譲)。 */
export function allowedOrigin(req: Request): string | null {
  const raw = Deno.env.get('CIQ_ALLOWED_ORIGINS');
  if (!raw) {
    // 設定漏れは静かに全許可へ倒さず、運用が気づけるようサーバログにのみ残す。
    console.error('[cors] CIQ_ALLOWED_ORIGINS is not configured; refusing to emit a wildcard ACAO');
  }
  return resolveAllowedOrigin(raw, req.headers.get('Origin'));
}

/**
 * Deno.serve のハンドラをラップし、応答の access-control-allow-origin を
 * allowlist に基づいて一括で上書きする。preflight・本応答・エラー・画像応答すべてに一貫適用。
 * 認証・RLS・本処理には一切干渉しない(ヘッダ調整のみ)。
 */
export function withCors(handler: (req: Request) => Promise<Response> | Response) {
  return async (req: Request): Promise<Response> => {
    const resp = await handler(req);
    const origin = allowedOrigin(req);
    if (origin) {
      resp.headers.set('access-control-allow-origin', origin);
      if (origin !== '*') resp.headers.append('Vary', 'Origin');
    } else {
      resp.headers.delete('access-control-allow-origin');
    }
    return resp;
  };
}

/**
 * 未分類のサーバエラー(500)向けの汎用レスポンス。
 * 内部の詳細(スタック/内部メッセージ/SQL/制約名)はサーバログにのみ残し、
 * クライアントには汎用文言 + 追跡用 ref(ランダム値・非秘密)のみを返す。
 */
export function serverErrorResponse(error: unknown, context: string) {
  const ref = crypto.randomUUID().slice(0, 8);
  console.error(`[${context}] ref=${ref}`, error instanceof Error ? (error.stack || error.message) : String(error));
  return jsonResponse({ error: 'サーバーで問題が発生しました。時間をおいて再度お試しください。', ref }, 500);
}
