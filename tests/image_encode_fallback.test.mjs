import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

function loadApi() {
  const source = readFileSync(new URL('../js/supabase_api.js', import.meta.url), 'utf8');
  const win = { addEventListener() {}, CIQSupabase: { getClient: () => ({}) } };
  return new Function('window', 'document', 'localStorage', `${source}\nreturn CIQSupabaseAPI;`)(win, {}, {});
}

// WebP を書き出せないブラウザ（Safari）は、頼んでも PNG を返す。
function fakeCanvas(supported) {
  const calls = [];
  return {
    calls,
    toBlob(cb, mime, q) {
      calls.push([mime, q]);
      const type = supported.includes(mime) ? mime : 'image/png';
      cb({ type });
    },
  };
}

describe('画像の書き出し（Safari は PNG になるので JPEG に切り替える）', () => {
  it('WebP を書けるブラウザは、そのまま WebP', async () => {
    const api = loadApi();
    const canvas = fakeCanvas(['image/webp', 'image/jpeg']);
    const blob = await api.canvasToBlob(canvas, 'image/webp', 0.64);
    expect(blob.type).toBe('image/webp');
    expect(canvas.calls.length).toBe(1);
  });

  it('WebP を書けないブラウザは、JPEG で書き直す', async () => {
    const api = loadApi();
    const canvas = fakeCanvas(['image/jpeg']);
    const blob = await api.canvasToBlob(canvas, 'image/webp', 0.64);
    expect(blob.type).toBe('image/jpeg');
    expect(canvas.calls[1][0]).toBe('image/jpeg');
  });

  it('取り込み側・切り出しワーカーにも同じ切り替えがある', () => {
    for (const file of ['../js/admin_prep.js', '../js/image_crop_worker.js']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).toContain("'image/jpeg'");
    }
  });
});
