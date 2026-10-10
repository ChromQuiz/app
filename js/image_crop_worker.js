const imageCache = new Map();
const IMAGE_CACHE_LIMIT = 40;

function cacheImage(key, value) {
    imageCache.set(key, value);
    while (imageCache.size > IMAGE_CACHE_LIMIT) {
        const oldestKey = imageCache.keys().next().value;
        const oldest = imageCache.get(oldestKey);
        imageCache.delete(oldestKey);
        oldest?.close?.();
    }
    return value;
}

// 計測用：取得・デコード・書き出しの合計ミリ秒（問題画面の perf ログに出す）
const timings = { fetchMs: 0, decodeMs: 0, encodeMs: 0, pageCacheHits: 0 };

async function loadImageBitmap(url) {
    const cached = imageCache.get(url);
    if (cached) {
        timings.pageCacheHits++;
        return cached;
    }

    const fetchStartedAt = performance.now();
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) throw new Error('Image fetch failed');
    const blob = await response.blob();
    timings.fetchMs += performance.now() - fetchStartedAt;
    const decodeStartedAt = performance.now();
    const bitmap = await createImageBitmap(blob);
    timings.decodeMs += performance.now() - decodeStartedAt;
    return cacheImage(url, bitmap);
}

async function cropImage({ imageUrl, region, sourceWidth, quality }) {
    const image = await loadImageBitmap(imageUrl);
    const imageWidth = image.width;
    const imageHeight = image.height;
    const scale = sourceWidth ? imageWidth / sourceWidth : 1;
    const x = Math.max(0, Math.round(Number(region.x || 0) * scale));
    const y = Math.max(0, Math.round(Number(region.y || 0) * scale));
    const w = Math.max(1, Math.round(Number(region.w || 1) * scale));
    const h = Math.max(1, Math.round(Number(region.h || 1) * scale));
    const width = Math.min(w, Math.max(1, imageWidth - x));
    const height = Math.min(h, Math.max(1, imageHeight - y));

    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d').drawImage(image, x, y, width, height, 0, 0, width, height);
    const encodeStartedAt = performance.now();
    const webp = await canvas.convertToBlob({ type: 'image/webp', quality });
    // Safari は WebP を書き出せず PNG になる。PNG は数倍重いので JPEG で書き直す
    const result = webp.type === 'image/webp'
        ? webp
        : await canvas.convertToBlob({ type: 'image/jpeg', quality: Math.min(0.9, quality + 0.25) });
    timings.encodeMs += performance.now() - encodeStartedAt;
    return result;
}

self.addEventListener('message', async (event) => {
    const { id, payload } = event.data || {};
    try {
        const blob = await cropImage(payload);
        self.postMessage({ id, ok: true, blob, timings: { ...timings } });
    } catch (error) {
        self.postMessage({ id, ok: false, error: error?.message || String(error) });
    }
});
