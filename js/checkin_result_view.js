// checkin_result_view.js — 当日受付の結果の表示(カメラの受付画面・リーダー専用の受付画面で、同じものを使う)
//
// 見せるのは、状態(色つきの印と見出し)・受付番号・所属と学年だけ。
// 状態は、色・印・文字の3つで伝える(離れた所からも、色の見分けが難しい人にも、読めるように)。
(function (root) {
    'use strict';

    // tone: 印の色(ok = 緑 / warn = 黄 / bad = 赤 / neutral = 灰)
    const STATES = {
        loading: { tone: 'neutral', icon: 'spinner', title: '確認中…' },
        success: { tone: 'ok', icon: 'check', title: '受付完了' },
        already: { tone: 'warn', icon: 'triangle-exclamation', title: '受付済み' },
        waitlist: { tone: 'warn', icon: 'clock', title: 'キャンセル待ち' },
        canceled: { tone: 'bad', icon: 'xmark', title: 'キャンセル' },
        error: { tone: 'bad', icon: 'triangle-exclamation', title: 'エラーが発生しました' },
    };

    function pad3(n) {
        return String(n ?? '').padStart(3, '0');
    }

    // サーバーの受付の返事(check-in)を、表示する内容にする
    function describeCheckIn(response) {
        const entry = response?.entry || {};
        const state = response?.result === 'canceled' ? 'canceled'
            : response?.result === 'waitlist' ? 'waitlist'
            : response?.result === 'already' ? 'already'
            : 'success';
        return {
            state,
            number: pad3(entry.entryNumber),
            detail: [entry.affiliation, entry.grade].filter(Boolean).join(' / '),
        };
    }

    // box に、結果を描く。view: { state, title?, number?, detail? }
    function render(box, view) {
        const def = STATES[view.state] || STATES.error;
        box.textContent = '';
        box.hidden = false;
        box.className = `checkin-result is-${def.tone}`;
        // アニメーションを、毎回、最初からやり直す
        void box.offsetWidth;

        const mark = document.createElement('span');
        mark.className = 'checkin-result-mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.appendChild(createIcon(def.icon, { size: 56 }));
        box.appendChild(mark);

        const title = document.createElement('div');
        title.className = 'checkin-result-title';
        title.textContent = view.title || def.title;
        box.appendChild(title);

        if (view.number) {
            const wrap = document.createElement('div');
            wrap.className = 'checkin-result-numberwrap';
            const label = document.createElement('div');
            label.className = 'checkin-result-label';
            label.textContent = '受付番号';
            const number = document.createElement('div');
            number.className = 'checkin-result-number';
            number.textContent = view.number;
            wrap.append(label, number);
            box.appendChild(wrap);
        }
        if (view.detail) {
            const detail = document.createElement('div');
            detail.className = view.number ? 'checkin-result-detail' : 'checkin-result-message';
            detail.textContent = view.detail;
            box.appendChild(detail);
        }
    }

    function hide(box) {
        box.hidden = true;
    }

    const api = { STATES, describeCheckIn, render, hide };
    root.CIQCheckinResultView = api;
    if (typeof window !== 'undefined') window.CIQCheckinResultView = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
