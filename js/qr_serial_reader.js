// qr_serial_reader.js — USBシリアル(Web Serial)で、二次元コードリーダーの読み取りを受け取る。
//
// キーボードとして動かすのと違い、日本語入力(IME)や配列の影響を受けない。Chrome・Edge でだけ動く(Safari・Firefox は未対応)。
// 読み取りは、行(最後の CR / LF)ごとに、1つの読み取りとして渡す。最後に改行を付けない設定のリーダーのために、
// データが止まって少したったら、そこまでを1つの読み取りとして渡す。
(function (root) {
    'use strict';

    const IDLE_FLUSH_MS = 250;

    // buffer(前に受け取った、改行のまだ来ていない文字)に chunk を足し、完成した行と、残りを返す。
    function splitReaderChunks(buffer, chunk) {
        const text = String(buffer ?? '') + String(chunk ?? '');
        const parts = text.split(/\r\n|\r|\n/);
        const rest = parts.pop();
        return { lines: parts.map(line => line.trim()).filter(Boolean), rest };
    }

    function isSupported() {
        return typeof navigator !== 'undefined' && 'serial' in navigator;
    }

    // onCode(text): 読み取りが1つ届くたびに。onState('connected' | 'disconnected' | 'error', detail): 接続の状態が変わるたびに。
    function createSerialReader({ onCode, onState }) {
        let port = null;
        let reader = null;
        let closing = false;
        let flushTimer = 0;

        async function open(selectedPort, baudRate) {
            await close();
            closing = false;
            port = selectedPort;
            await port.open({ baudRate });
            onState('connected', '');
            readLoop(port);
        }

        async function readLoop(openedPort) {
            const decoder = new TextDecoderStream();
            const piped = openedPort.readable.pipeTo(decoder.writable).catch(() => {});
            reader = decoder.readable.getReader();
            let pending = '';
            try {
                for (;;) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    clearTimeout(flushTimer);
                    const split = splitReaderChunks(pending, value);
                    pending = split.rest;
                    split.lines.forEach(onCode);
                    if (pending.trim()) {
                        flushTimer = setTimeout(() => { const text = pending.trim(); pending = ''; if (text) onCode(text); }, IDLE_FLUSH_MS);
                    }
                }
            } catch (error) {
                if (!closing) onState('error', error?.message || '');
            } finally {
                clearTimeout(flushTimer);
                try { reader?.releaseLock(); } catch (e) { /* すでに解放済み */ }
                reader = null;
                await piped;
                try { await openedPort.close(); } catch (e) { /* すでに閉じている */ }
                if (!closing && port === openedPort) {
                    port = null;
                    onState('disconnected', '');
                }
            }
        }

        async function close() {
            closing = true;
            clearTimeout(flushTimer);
            try { await reader?.cancel(); } catch (e) { /* 読み取り中でない */ }
            port = null;
        }

        return {
            // 利用者が許可する画面を出す(押した操作の中で呼ぶ)
            async connect(baudRate) {
                const selected = await navigator.serial.requestPort();
                await open(selected, baudRate);
            },
            // 前に許可したポートがあれば、画面を出さずにつなぐ
            async reconnect(baudRate) {
                const ports = await navigator.serial.getPorts();
                if (!ports.length) return false;
                await open(ports[0], baudRate);
                return true;
            },
            disconnect: close,
        };
    }

    const api = { splitReaderChunks, isSupported, createSerialReader };
    root.CIQQrSerialReader = api;
    if (typeof window !== 'undefined') window.CIQQrSerialReader = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
