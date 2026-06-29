(function attachUploadValidation(root) {
    const PDF_MAX_BYTES = 512 * 1024 * 1024;
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

    function padEntryNumber(n) {
        return String(n).padStart(3, '0');
    }

    function summarizeEntryNumbers(numbers, maxItems = 8) {
        const unique = Array.from(new Set((numbers || [])
            .map(Number)
            .filter(n => Number.isInteger(n) && n > 0)))
            .sort((a, b) => a - b);
        if (!unique.length) return 'なし';
        const head = unique.slice(0, maxItems).map(padEntryNumber).join(', ');
        const suffix = unique.length > maxItems ? ` ほか${unique.length - maxItems}件` : '';
        return `${head}${suffix}`;
    }

    function summarizeEntryRange(numbers) {
        const unique = Array.from(new Set((numbers || [])
            .map(Number)
            .filter(n => Number.isInteger(n) && n > 0)))
            .sort((a, b) => a - b);
        if (!unique.length) return 'なし';
        const first = unique[0];
        const last = unique[unique.length - 1];
        const range = first === last ? padEntryNumber(first) : `${padEntryNumber(first)}〜${padEntryNumber(last)}`;
        return `${range}（${unique.length}件）`;
    }

    function validateDetectedEntryNumbers(detectedNumbers, knownEntryNumbers) {
        const known = new Set((knownEntryNumbers || [])
            .map(Number)
            .filter(n => Number.isInteger(n) && n > 0));
        if (!known.size) {
            return {
                ok: false,
                message: '参加者一覧が空です。先にエントリーを登録してから答案を読み込んでください。',
            };
        }

        const detected = (detectedNumbers || []).map(Number);
        const unreadablePages = [];
        const seen = new Set();
        const duplicates = new Set();
        const missing = new Set();

        detected.forEach((num, index) => {
            if (!Number.isInteger(num) || num <= 0) {
                unreadablePages.push(index + 1);
                return;
            }
            if (seen.has(num)) duplicates.add(num);
            seen.add(num);
            if (!known.has(num)) missing.add(num);
        });

        if (unreadablePages.length) {
            return {
                ok: false,
                message: `受付番号を読み取れないページがあります: p${unreadablePages.slice(0, 8).join(', p')}${unreadablePages.length > 8 ? ` ほか${unreadablePages.length - 8}件` : ''}。受付番号マークを確認してください。`,
            };
        }
        if (duplicates.size) {
            return {
                ok: false,
                message: `PDF内で受付番号が重複しています: ${summarizeEntryNumbers(Array.from(duplicates))}。同じ答案を重複して読み込んでいないか確認してください。`,
            };
        }
        if (missing.size) {
            return {
                ok: false,
                message: `PDFから読んだ受付番号が参加者一覧にありません: ${summarizeEntryNumbers(Array.from(missing))}。参加者一覧の番号は ${summarizeEntryRange(Array.from(known))} です。正しいプロジェクト/PDFか、答案の受付番号マークを確認してください。`,
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
        validateDetectedEntryNumbers,
    };

    root.CIQUploadValidation = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
