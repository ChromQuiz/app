/**
 * CIQ Service Worker
 * 最小限のオフラインフォールバックだけを提供。
 * HTML/CSS/JS/Auth/API は常にライブデータを使用する。
 */

const CACHE_NAME = 'ciq-v11';
const STATIC_ASSETS = [
    'favicon.png',
    '404.html',
];

// インストール時に静的アセットをプリキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// 古いキャッシュをクリーンアップ
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => {
            return Promise.all(
                names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
            );
        })
    );
    self.clients.claim();
});

// フェッチ戦略: 実行コードは常時ライブ、非実行アセットだけNetwork First
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (event.request.method !== 'GET') return;

    // App shell and executable assets must never be served stale.
    if (
        event.request.mode === 'navigate' ||
        url.pathname.endsWith('.html') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css') ||
        url.hostname.includes('supabase.co') ||
        url.hostname.includes('googleapis') ||
        url.hostname.includes('google.com')
    ) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 外部CDN（fonts, FA等）もネットワーク優先
    if (url.origin !== self.location.origin) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    // 画像など非実行アセットだけ: Network first, cache fallback
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // レスポンスをキャッシュに保存
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});
