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
 * 未分類のサーバエラー(500)向けの汎用レスポンス。
 * 内部の詳細(スタック/内部メッセージ/SQL/制約名)はサーバログにのみ残し、
 * クライアントには汎用文言 + 追跡用 ref(ランダム値・非秘密)のみを返す。
 */
export function serverErrorResponse(error: unknown, context: string) {
  const ref = crypto.randomUUID().slice(0, 8);
  console.error(`[${context}] ref=${ref}`, error instanceof Error ? (error.stack || error.message) : String(error));
  return jsonResponse({ error: 'サーバーで問題が発生しました。時間をおいて再度お試しください。', ref }, 500);
}
