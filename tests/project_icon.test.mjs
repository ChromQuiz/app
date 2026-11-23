// 大会のアイコン(タブのファビコン): 差し替えの条件、入力チェック、保存先の権限
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, afterEach } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function load(file) {
  const module = { exports: {} };
  const fn = new Function('module', 'exports', 'globalThis', read(file) + '; return module.exports;');
  return fn(module, module.exports, globalThis);
}

const icon = load('js/project_icon.js');
const v = load('js/upload_validation.js');
const BASE = 'https://chxuitjfanbagbzwpjyi.supabase.co';

function fakeDoc() {
  const head = { children: [] };
  head.appendChild = (el) => {
    el.parentNode = head;
    el.remove = () => { head.children = head.children.filter(c => c !== el); };
    el.getAttribute = (name) => el[name];
    head.children.push(el);
  };
  head.appendChild({ rel: 'icon', type: 'image/png', href: 'favicon.png?v=4' });
  const icons = () => head.children.filter(c => c.rel === 'icon');
  return {
    head,
    get links() { return head.children; },
    querySelectorAll: () => icons(),
    querySelector: () => icons()[0] || null,
    createElement: () => ({}),
  };
}

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
const PNG_DATA_URL = 'data:image/png;base64,iVBORw==';

afterEach(() => {
  vi.unstubAllGlobals();
  delete globalThis.CIQ_SUPABASE_CONFIG;
});

describe('アイコンの URL', () => {
  it('大会 ID のフォルダの icon.png を指す', () => {
    expect(icon.projectIconUrl(BASE, 'ciq12')).toBe(`${BASE}/storage/v1/object/public/project-icon/ciq12/icon.png`);
    expect(icon.projectIconUrl(`${BASE}/`, 'ciq12')).toBe(`${BASE}/storage/v1/object/public/project-icon/ciq12/icon.png`);
  });

  it('大会 ID でない値では URL を作らない(パスの書き換えを防ぐ)', () => {
    for (const bad of ['', '../site-card', 'a/b', 'ciq12?x', 'a b', 'x'.repeat(65)]) {
      expect(icon.projectIconUrl(BASE, bad), bad).toBe('');
    }
    expect(icon.projectIconUrl('', 'ciq12')).toBe('');
  });

  it('pid を読む(マイエントリーと同じ別名も)', () => {
    expect(icon.readProjectId('?pid=ciq1&v=2')).toBe('ciq1');
    expect(icon.readProjectId('?projectId=ciq2')).toBe('ciq2');
    expect(icon.readProjectId('')).toBe('');
  });
});

describe('タブのアイコンの差し替え', () => {
  it('PNG があれば、data: URL のアイコンを作り直す(古いものは消す)', async () => {
    globalThis.CIQ_SUPABASE_CONFIG = { url: BASE };
    const png = new Blob([PNG_BYTES], { type: 'image/png' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => png })));
    const doc = fakeDoc();
    expect(await icon.applyProjectIcon(doc, { search: '?pid=ciq1' }, fakeStorage())).toBe(true);
    expect(doc.links).toHaveLength(1);
    expect(doc.links[0].rel).toBe('icon');
    expect(doc.links[0].href.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('Safari で load に間に合うよう、HTTP キャッシュを使い、defer にせず読み込む', () => {
    expect(read('js/project_icon.js')).not.toContain("cache: 'no-cache'");
  });

  it('無いとき・PNG でないときは CIQ のロゴのまま', async () => {
    globalThis.CIQ_SUPABASE_CONFIG = { url: BASE };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    const doc = fakeDoc();
    expect(await icon.applyProjectIcon(doc, { search: '?pid=ciq1' })).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['<svg/>'], { type: 'image/svg+xml' }) })));
    expect(await icon.applyProjectIcon(doc, { search: '?pid=ciq1' })).toBe(false);
    expect(doc.links[0].href).toBe('favicon.png?v=4');
  });

  it('取ったアイコンを控え、次は取り直す前に(同期で)出す', async () => {
    globalThis.CIQ_SUPABASE_CONFIG = { url: BASE };
    const storage = fakeStorage();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob([PNG_BYTES], { type: 'image/png' }) })));
    await icon.applyProjectIcon(fakeDoc(), { search: '?pid=ciq1' }, storage);
    expect(storage.data['ciqProjectIcon:ciq1']).toBe(PNG_DATA_URL);

    let release;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { release = r; })));
    const doc = fakeDoc();
    const pending = icon.applyProjectIcon(doc, { search: '?pid=ciq1' }, storage);
    expect(doc.links[0].href).toBe(PNG_DATA_URL);
    release({ ok: true, blob: async () => new Blob([PNG_BYTES], { type: 'image/png' }) });
    expect(await pending).toBe(true);
    expect(doc.links).toHaveLength(1);
  });

  it('削除されていたら、控えを消して CIQ のロゴに戻す', async () => {
    globalThis.CIQ_SUPABASE_CONFIG = { url: BASE };
    const storage = fakeStorage({ 'ciqProjectIcon:ciq1': PNG_DATA_URL });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    const doc = fakeDoc();
    expect(await icon.applyProjectIcon(doc, { search: '?pid=ciq1' }, storage)).toBe(false);
    expect(storage.data).toEqual({});
    expect(doc.links[0].href).toBe('favicon.png?v=4');
  });

  it('通信できないときは控えのまま。壊れた控えは使わない', async () => {
    globalThis.CIQ_SUPABASE_CONFIG = { url: BASE };
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const doc = fakeDoc();
    expect(await icon.applyProjectIcon(doc, { search: '?pid=ciq1' }, fakeStorage({ 'ciqProjectIcon:ciq1': PNG_DATA_URL }))).toBe(true);
    expect(doc.links[0].href).toBe(PNG_DATA_URL);
    const doc2 = fakeDoc();
    await icon.applyProjectIcon(doc2, { search: '?pid=ciq1' }, fakeStorage({ 'ciqProjectIcon:ciq1': 'javascript:alert(1)' }));
    expect(doc2.links[0].href).toBe('favicon.png?v=4');
  });

  it('pid が無いページでは取りに行かない', async () => {
    globalThis.CIQ_SUPABASE_CONFIG = { url: BASE };
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await icon.applyProjectIcon(fakeDoc(), { search: '' })).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('参加者向けの4ページだけが読み込む', () => {
    for (const page of ['entry.html', 'entry_list.html', 'my.html', 'terms.html']) {
      expect(read(page), page).toContain('<script src="js/supabase_config.js?v=3"></script>\n    <script src="js/project_icon.js?v=3"></script>');
    }
    for (const page of ['index.html', 'admin.html', 'help.html']) {
      expect(read(page), page).not.toContain('project_icon.js');
    }
  });
});

describe('アイコンの入力チェック', () => {
  it('正方形だけを受け付け、断るときは求めるサイズを示す', () => {
    expect(v.validateIconImageDimensions(512, 512).ok).toBe(true);
    expect(v.validateIconImageDimensions(1024, 1020).ok).toBe(true);
    const wide = v.validateIconImageDimensions(1200, 630);
    expect(wide.ok).toBe(false);
    expect(wide.message).toContain('512×512ピクセルの正方形');
    expect(v.validateIconImageDimensions(64, 64).message).toContain('小さすぎます');
  });

  it('512 を超える画像は 512 に縮め、小さい画像は拡大しない', () => {
    expect(v.iconOutputSize(1024, 1024)).toEqual({ width: 512, height: 512 });
    expect(v.iconOutputSize(200, 200)).toEqual({ width: 200, height: 200 });
  });
});

describe('アイコンの保存先', () => {
  const sql = read('supabase/migrations/202611060002_project_icon.sql');

  it('PNG だけ・1 MB までの公開バケット', () => {
    expect(sql).toMatch(/'project-icon', 'project-icon', true, 1048576, array\['image\/png'\]/);
  });

  it('書き込み・削除は、その大会の所有者・管理者だけ。icon.png の1ファイルだけ', () => {
    const policies = sql.match(/create policy[\s\S]*?;/g) || [];
    expect(policies.length).toBe(4);
    for (const p of policies) {
      expect(p).toContain("bucket_id = 'project-icon'");
      expect(p).toContain("storage.filename(name) = 'icon.png'");
      expect(p).toContain('array_length(storage.foldername(name), 1) = 1');
      expect(p).toContain("public.has_project_role((storage.foldername(name))[1], array['owner', 'admin'])");
      expect(p).toContain('to authenticated');
    }
  });
});
