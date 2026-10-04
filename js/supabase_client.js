/**
 * CIQ Supabase client bootstrap.
 *
 * Load order when enabled:
 *   https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
 *   js/supabase_config.js
 *   js/supabase_client.js
 */

function createCiqSupabaseClient() {
    const cfg = window.CIQ_SUPABASE_CONFIG;
    if (!cfg?.url || !cfg?.publishableKey) {
        throw new Error('サーバーの設定が見つかりません。');
    }
    if (!window.supabase?.createClient) {
        throw new Error('サーバーとの通信に必要なライブラリを読み込めませんでした。ページを再読み込みしてください。');
    }

    return window.supabase.createClient(cfg.url, cfg.publishableKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'ciq.supabase.auth',
        },
        realtime: {
            params: {
                eventsPerSecond: 10,
            },
        },
    });
}

window.CIQSupabase = {
    client: null,
    getClient() {
        if (!this.client) this.client = createCiqSupabaseClient();
        return this.client;
    },
};
