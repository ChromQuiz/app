// qr_reader_input.js — 二次元コードリーダー(USBのキーボード入力として動くもの)の入力を、受付の二次元コードに整える。
//
// リーダーは、読み取った文字を、キーボードのように入力欄へ打ち込む(最後に Enter を付ける設定にしておく)。
// 日本語入力(IME)が入っていると、ハイフンが「ー」、ピリオドが「。」、数字や英字が全角になることがある。
// 受付の二次元コードに使う文字(英数字・ハイフン・ピリオド)だけ、半角に戻す。
// 形が受付の二次元コードでなければ、サーバーに送らない(読み間違いで「見つからない」の回数制限に達しないため)。
(function (root) {
    'use strict';

    // 現行: <entryId>.<署名 32桁(16進)>。旧形式(期限つき): <entryId>.<期限>.<署名 64桁(16進)>
    const CODE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.\d{1,16})?\.[0-9a-f]{32,64}$/i;

    function normalizeReaderCode(raw) {
        return String(raw ?? '')
            .normalize('NFKC')            // 全角の英数字・「－」「．」などを半角に
            .replace(/[ー‐‑–—―]/g, '-')   // 日本語入力のままのハイフン
            .replace(/[。｡]/g, '.')       // 日本語入力のままのピリオド
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
