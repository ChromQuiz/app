// project_icon.js — 大会のアイコン(タブのファビコン)を差し替える
//
// URL の pid の大会に、管理画面でアップロードしたアイコン(公開バケット project-icon の <pid>/icon.png)が
// あれば、ページを開いたあとにタブのアイコンをそれに替える。無いときは CIQ のロゴのまま。
// CSP を弱めないため、画像は fetch(connect-src で許可済み)で取り、data: URL(img-src で許可済み)にして使う。

(function attachProjectIcon(root) {
    const PROJECT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
    const MAX_BYTES = 1024 * 1024;

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
        return `data:image/png;base64,${btoa(binary)}`;
    }

    async function applyProjectIcon(doc = root.document, loc = root.location) {
        const url = projectIconUrl(root.CIQ_SUPABASE_CONFIG?.url, readProjectId(loc?.search));
        if (!url || !doc) return false;
        try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (!res.ok) return false;
            const blob = await res.blob();
            if (blob.type !== 'image/png' || blob.size <= 0 || blob.size > MAX_BYTES) return false;
            const dataUrl = await blobToDataUrl(blob);
            if (!dataUrl.startsWith('data:image/png;base64,')) return false;
            doc.querySelectorAll('link[rel="icon"]').forEach((link) => {
                link.type = 'image/png';
                link.href = dataUrl;
            });
            return true;
        } catch (_) {
            return false;
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
