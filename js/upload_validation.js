(function attachUploadValidation(root) {
    const PDF_MAX_BYTES = 120 * 1024 * 1024;
    const PDF_MAX_PAGES = 300;
    const PDF_MAGIC = '%PDF-';

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes < 0) return '0 MB';
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function isPdfName(name) {
        return /\.pdf$/i.test(String(name || ''));
    }

    function isPdfType(type) {
        const normalized = String(type || '').toLowerCase();
        return !normalized || normalized === 'application/pdf' || normalized === 'application/x-pdf' || normalized === 'application/octet-stream';
    }

    async function hasPdfSignature(file) {
        if (!file?.slice) return false;
        const header = await file.slice(0, PDF_MAGIC.length).text();
        return header === PDF_MAGIC;
    }

    async function validatePdfFile(file, options = {}) {
        const maxBytes = options.maxBytes || PDF_MAX_BYTES;
        if (!file) return { ok: false, message: 'PDFファイルを選択してください。' };
        if (file.size <= 0) return { ok: false, message: '空のPDFファイルは読み込めません。' };
        if (file.size > maxBytes) {
            return {
                ok: false,
                message: `PDFが大きすぎます（${formatBytes(file.size)}）。${formatBytes(maxBytes)}以下にしてください。`,
            };
        }
        if (!isPdfName(file.name) || !isPdfType(file.type)) {
            return { ok: false, message: 'PDFファイルのみ読み込めます。' };
        }
        if (!await hasPdfSignature(file)) {
            return { ok: false, message: 'PDFとして認識できません。ファイルを確認してください。' };
        }
        return { ok: true };
    }

    function validatePdfPageCount(pageCount, options = {}) {
        const maxPages = options.maxPages || PDF_MAX_PAGES;
        if (!Number.isInteger(pageCount) || pageCount <= 0) {
            return { ok: false, message: 'PDFに読み込めるページがありません。' };
        }
        if (pageCount > maxPages) {
            return {
                ok: false,
                message: `PDFのページ数が多すぎます（${pageCount}ページ）。${maxPages}ページ以下に分けて読み込んでください。`,
            };
        }
        return { ok: true };
    }

    const api = {
        PDF_MAX_BYTES,
        PDF_MAX_PAGES,
        formatBytes,
        validatePdfFile,
        validatePdfPageCount,
    };

    root.CIQUploadValidation = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
