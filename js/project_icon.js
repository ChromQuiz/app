// project_icon.js — 大会のアイコン(タブのファビコン)を差し替える
//
// URL の pid の大会に、管理画面でアップロードしたアイコン(公開バケット project-icon の <pid>/icon.png)が
// あれば、タブのアイコンをそれに替える。無いときは CIQ のロゴのまま。
// CSP を弱めないため、画像は fetch(connect-src で許可済み)で取り、data: URL(img-src で許可済み)にして使う。
//
// Safari は、ページの読み込みが終わった(load)あとのアイコンの差し替えを反映しないことがある。
// 軽いページ(エントリーリストなど)では、アイコンが届く前に load が終わってしまう。そのため:
//   - このファイルと supabase_config.js は defer にせず、HTML を読む途中で動かす
//   - 一度取ったアイコンを localStorage に控え、次からは HTML を読む途中で(同期で)すぐ出す。
//     そのあと取り直し、変わっていれば差し替え、削除されていれば CIQ のロゴに戻す
//   - href を書き換えるのではなく、<link rel="icon"> を作り直す(Safari はこちらのほうが反映しやすい)
// 控えるのは公開画像だけ(個人の情報は入らない)。localStorage が使えないときは控えずに動く。

(function attachProjectIcon(root) {
    const PROJECT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
    const MAX_BYTES = 1024 * 1024;
    const DATA_URL_PREFIX = 'data:image/png;base64,';
    const STORAGE_PREFIX = 'ciqProjectIcon:';

    function projectIconUrl(supabaseUrl, projectId) {
        if (!supabaseUrl || !PROJECT_ID_RE.test(String(projectId || ''))) return '';
        return `${String(supabaseUrl).replace(/\/+$/, '')}/storage/v1/object/public/project-icon/${projectId}/icon.png`;
    }

    function readProjectId(search) {
        const params = new URLSearchParams(search || '');
        return params.get('pid') || params.get('projectId') || params.get('project') || '';
    }

    async function blobToDataUrl(blob) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return `${DATA_URL_PREFIX}${btoa(binary)}`;
    }

    function isIconDataUrl(value) {
        return typeof value === 'string' && value.startsWith(DATA_URL_PREFIX) && value.length < MAX_BYTES * 1.4;
    }

    function readSaved(storage, projectId) {
        try {
            const value = storage?.getItem(STORAGE_PREFIX + projectId);
            return isIconDataUrl(value) ? value : '';
        } catch (_) {
            return '';
        }
    }

    function writeSaved(storage, projectId, dataUrl) {
        try {
            if (dataUrl) storage?.setItem(STORAGE_PREFIX + projectId, dataUrl);
            else storage?.removeItem(STORAGE_PREFIX + projectId);
        } catch (_) {
            // 控えられなくても、アイコンの表示には困らない
        }
    }

    function setIcon(doc, href) {
        const oldLinks = Array.from(doc.querySelectorAll('link[rel="icon"]'));
        const head = doc.head || oldLinks[0]?.parentNode;
        if (!head) return false;
        const link = doc.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        link.href = href;
        oldLinks.forEach((el) => el.remove());
        head.appendChild(link);
        return true;
    }

    // 控えがあれば同期で出し、取り直した結果で更新する。戻り値は Promise<boolean>(大会のアイコンを出したか)
    function applyProjectIcon(doc = root.document, loc = root.location, storage = safeLocalStorage()) {
        const projectId = readProjectId(loc?.search);
        const url = projectIconUrl(root.CIQ_SUPABASE_CONFIG?.url, projectId);
        if (!url || !doc) return Promise.resolve(false);
        const defaultHref = doc.querySelector?.('link[rel="icon"]')?.getAttribute?.('href') || '';
        const saved = readSaved(storage, projectId);
        if (saved) setIcon(doc, saved);
        return refresh(doc, url, projectId, storage, saved, defaultHref);
    }

    async function refresh(doc, url, projectId, storage, saved, defaultHref) {
        try {
            const res = await fetch(url);
            if (!res.ok) {
                // 削除された: 控えを消し、CIQ のロゴに戻す
                if (saved) {
                    writeSaved(storage, projectId, '');
                    if (defaultHref) setIcon(doc, defaultHref);
                }
                return false;
            }
            const blob = await res.blob();
            if (blob.type !== 'image/png' || blob.size <= 0 || blob.size > MAX_BYTES) return Boolean(saved);
            const dataUrl = await blobToDataUrl(blob);
            if (!isIconDataUrl(dataUrl)) return Boolean(saved);
            if (dataUrl !== saved) {
                setIcon(doc, dataUrl);
                writeSaved(storage, projectId, dataUrl);
            }
            return true;
        } catch (_) {
            // 通信できないときは、控えのまま
            return Boolean(saved);
        }
    }

    function safeLocalStorage() {
        try {
            return root.localStorage || null;
        } catch (_) {
            return null;
        }
    }

    const api = { projectIconUrl, readProjectId, applyProjectIcon };
    root.CIQProjectIcon = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else if (root.document) {
        applyProjectIcon();
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
