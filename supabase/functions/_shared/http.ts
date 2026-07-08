export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
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
 * リクエストの Origin に対して許可すべき値を返す。
 * - CIQ_ALLOWED_ORIGINS 未設定/空 → '*'(後方互換で全許可)
 * - 設定あり かつ Origin が一覧内 → その Origin をエコー
 * - 設定あり かつ Origin が一覧外/無し → null(ACAO を付与しない=ブラウザがブロック)
 * 完全一致判定(ワイルドカードなし)。
 */
export function allowedOrigin(req: Request): string | null {
  const raw = Deno.env.get('CIQ_ALLOWED_ORIGINS');
  if (!raw) return '*';
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return '*';
  const origin = req.headers.get('Origin');
  if (origin && list.includes(origin)) return origin;
  return null;
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
