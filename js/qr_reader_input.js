// qr_reader_input.js — 二次元コードリーダー(USBのキーボード入力として動くもの)の入力を、受付の二次元コードに整える。
//
// リーダーは、読み取った文字を、キーボードのように入力欄へ打ち込む(最後に Enter を付ける設定にしておく)。
// 日本語入力(IME)が入っていると、数字や英字が全角になることがある。半角に戻す。
// 形が受付の二次元コードでなければ、サーバーに送らない(読み間違いで「見つからない」の回数制限に達しないため)。
(function (root) {
    'use strict';

    // 受付コード: 大文字の英字と 2〜7 の数字だけの 20 文字(base32)。旧形式(<entryId>.<署名>)は受け付けない。
    const CODE_RE = /^[A-Z2-7]{20}$/i;

    function normalizeReaderCode(raw) {
        return String(raw ?? '')
            .normalize('NFKC')            // 全角の英数字を半角に
            .replace(/\s+/g, '')          // 改行・空白(リーダーが付ける区切り)
            .trim();
    }

    function looksLikeCheckInCode(code) {
        return CODE_RE.test(String(code ?? ''));
    }

    const api = { normalizeReaderCode, looksLikeCheckInCode };
    root.CIQQrReaderInput = api;
    if (typeof window !== 'undefined') window.CIQQrReaderInput = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
