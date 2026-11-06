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
                message: `PDFが ${formatBytes(file.size)} あり、大きすぎます。${formatBytes(maxBytes)}以下にしてください。`,
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
                message: `PDFが ${pageCount}ページあり、多すぎます。${maxPages}ページ以下に分けて読み込んでください。`,
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
        return `${range}、${unique.length}件`;
    }

    function validateDetectedEntryNumbers(detectedNumbers, knownEntryNumbers) {
        const known = new Set((knownEntryNumbers || [])
            .map(Number)
            .filter(n => Number.isInteger(n) && n > 0));
        if (!known.size) {
            return {
                ok: false,
                message: '参加者一覧が空です。エントリーがそろってから答案を読み込んでください。',
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
                message: `受付番号を読み取れないページがあります：p${unreadablePages.slice(0, 8).join(', p')}${unreadablePages.length > 8 ? ` ほか${unreadablePages.length - 8}件` : ''}。受付番号マークを確認してください。`,
            };
        }
        if (duplicates.size) {
            return {
                ok: false,
                message: `PDF内で受付番号が重複しています：${summarizeEntryNumbers(Array.from(duplicates))}。同じ答案を重複して読み込んでいないか確認してください。`,
            };
        }
        if (missing.size) {
            return {
                ok: false,
                message: `PDFから読んだ受付番号が参加者一覧にありません：${summarizeEntryNumbers(Array.from(missing))}。参加者一覧の番号は ${summarizeEntryRange(Array.from(known))} です。正しいプロジェクト/PDFか、答案の受付番号マークを確認してください。`,
            };
        }
        return { ok: true };
    }

    // 共有時の画像(リンクカード)。X の大きいカードは 1.91:1。
    const CARD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
    const CARD_IMAGE_WIDTH = 1200;
    const CARD_IMAGE_HEIGHT = 630;
    const CARD_IMAGE_MIN_WIDTH = 600;
    const CARD_IMAGE_MIN_HEIGHT = 315;
    const CARD_IMAGE_RATIO = CARD_IMAGE_WIDTH / CARD_IMAGE_HEIGHT;
    const CARD_IMAGE_RATIO_TOLERANCE = 0.05;
    const CARD_SIZE_TEXT = `${CARD_IMAGE_WIDTH}×${CARD_IMAGE_HEIGHT}ピクセル`;

    function detectImageType(bytes) {
        if (!bytes || bytes.length < 8) return '';
        if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
        const png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        if (png.every((b, i) => bytes[i] === b)) return 'image/png';
        return '';
    }

    async function validateCardImageFile(file) {
        if (!file) return { ok: false, message: '画像ファイルを選択してください。' };
        if (file.size <= 0) return { ok: false, message: '空のファイルは読み込めません。' };
        if (file.size > CARD_IMAGE_MAX_BYTES) {
            return {
                ok: false,
                message: `画像が ${formatBytes(file.size)} あり、大きすぎます。${formatBytes(CARD_IMAGE_MAX_BYTES)}以下にしてください。`,
            };
        }
        const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
        if (!detectImageType(header)) {
            return { ok: false, message: 'JPEG または PNG の画像のみ読み込めます。' };
        }
        return { ok: true };
    }

    function validateCardImageDimensions(width, height) {
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            return { ok: false, message: '画像を読み込めませんでした。ファイルを確認してください。' };
        }
        if (width < CARD_IMAGE_MIN_WIDTH || height < CARD_IMAGE_MIN_HEIGHT) {
            return {
                ok: false,
                message: `画像が ${width}×${height}ピクセルで、小さすぎます。${CARD_SIZE_TEXT}で作成してください。`,
            };
        }
        const ratio = width / height;
        if (Math.abs(ratio - CARD_IMAGE_RATIO) / CARD_IMAGE_RATIO > CARD_IMAGE_RATIO_TOLERANCE) {
            return {
                ok: false,
                message: `画像が ${width}×${height}ピクセルで、縦横の比率が合いません。${CARD_SIZE_TEXT}で作成してください。`,
            };
        }
        return { ok: true };
    }

    // 大きい画像は横 1200 ピクセルに縮める。小さい画像は拡大しない。
    function cardOutputSize(width, height) {
        if (width <= CARD_IMAGE_WIDTH) return { width, height };
        return { width: CARD_IMAGE_WIDTH, height: Math.round(height * CARD_IMAGE_WIDTH / width) };
    }

    const api = {
        PDF_MAX_BYTES,
        PDF_MAX_PAGES,
        CARD_IMAGE_MAX_BYTES,
        CARD_IMAGE_WIDTH,
        CARD_IMAGE_HEIGHT,
        formatBytes,
        validatePdfFile,
        validatePdfPageCount,
        validateDetectedEntryNumbers,
        detectImageType,
        validateCardImageFile,
        validateCardImageDimensions,
        cardOutputSize,
    };

    root.CIQUploadValidation = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
