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

async function loadImageBitmap(url) {
    const cached = imageCache.get(url);
    if (cached) return cached;

    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) throw new Error('Image fetch failed');
    const blob = await response.blob();
    return cacheImage(url, await createImageBitmap(blob));
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
    return canvas.convertToBlob({ type: 'image/webp', quality });
}

self.addEventListener('message', async (event) => {
    const { id, payload } = event.data || {};
    try {
        const blob = await cropImage(payload);
        self.postMessage({ id, ok: true, blob });
    } catch (error) {
        self.postMessage({ id, ok: false, error: error?.message || String(error) });
    }
});
