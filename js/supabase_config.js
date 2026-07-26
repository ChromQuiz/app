window.CIQ_SUPABASE_CONFIG = {
    url: 'https://pyzdlkwumhreepgkrcyb.supabase.co',
    publishableKey: 'sb_publishable_wiuKyYbhmIS8SPkcqxccsw_GdFbv72b',
};

// Cloudflare Turnstile の site key は公開値(クライアントに出て問題ない)。
// 秘密鍵は Supabase の Edge secret としてサーバ側のみで扱い、ここ(クライアント)には置かない。
// 未設定('')の間は widget を描画せず、トークン無しで送信する(サーバ側が fail-closed で拒否する)。
window.CIQ_TURNSTILE_SITE_KEY = '0x4AAAAAAD-L-B6ucPdXY4dI';
