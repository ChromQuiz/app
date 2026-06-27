/**
 * カスタムセレクト — ネイティブ <select class="custom-select"> を自動変換
 */

class CustomSelect {
    static initAll() {
        document.querySelectorAll('select.custom-select').forEach(sel => {
            if (sel.dataset.csInit) return;
            new CustomSelect(sel);
        });
    }

    constructor(selectEl) {
        this.select = selectEl;
        this.select.dataset.csInit = '1';
        this.select.style.display = 'none';
        this.options = Array.from(this.select.options);
        this.searchable = this.options.length > 10;

        this._build();
        this._bindEvents();
    }

    _build() {
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'custom-dropdown';

        this.trigger = document.createElement('div');
        this.trigger.className = 'cd-trigger';
        this.trigger.setAttribute('tabindex', '0');
        this.trigger.setAttribute('role', 'combobox');
        this.labelSpan = document.createElement('span');
        this.labelSpan.className = 'cd-label cd-placeholder';
        this.labelSpan.textContent = this.options[0]?.text || '選択';
        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        arrow.classList.add('cd-arrow');
        arrow.setAttribute('viewBox', '0 0 24 24');
        arrow.setAttribute('fill', 'none');
        arrow.setAttribute('stroke', 'currentColor');
        arrow.setAttribute('stroke-width', '2.5');
        arrow.setAttribute('stroke-linecap', 'round');
        arrow.setAttribute('stroke-linejoin', 'round');
        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', '6 9 12 15 18 9');
        arrow.appendChild(polyline);
        this.trigger.append(this.labelSpan, arrow);

        this.menu = document.createElement('div');
        this.menu.className = 'cd-menu';

        if (this.searchable) {
            const searchWrap = document.createElement('div');
            searchWrap.className = 'cd-search';
            this.searchInput = document.createElement('input');
            this.searchInput.type = 'text';
            this.searchInput.placeholder = '検索...';
            this.searchInput.className = 'cd-search-input';
            searchWrap.appendChild(this.searchInput);
            this.menu.appendChild(searchWrap);
        }

        this.optionEls = [];
        this.options.forEach((opt, i) => {
            if (i === 0 && !opt.value) return;
            const div = document.createElement('div');
            div.className = 'cd-option';
            div.dataset.value = opt.value;
            div.textContent = opt.text;
            div.addEventListener('click', () => this._selectOption(div));
            this.menu.appendChild(div);
            this.optionEls.push(div);
        });

        this.noMatch = document.createElement('div');
        this.noMatch.className = 'cd-no-match';
        this.noMatch.textContent = '一致する項目がありません';
        this.noMatch.style.display = 'none';
        this.menu.appendChild(this.noMatch);

        this.wrapper.appendChild(this.trigger);
        this.wrapper.appendChild(this.menu);
        this.select.parentNode.insertBefore(this.wrapper, this.select);
        this.wrapper.appendChild(this.select);

        if (this.select.value) {
            const pre = this.optionEls.find(o => o.dataset.value === this.select.value);
            if (pre) this._selectOption(pre, true);
        }
    }

    _bindEvents() {
        this.trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggle();
        });

        this.trigger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._toggle(); }
            if (e.key === 'Escape') this._close();
            if (e.key === 'ArrowDown') { e.preventDefault(); this._open(); this._focusOption(0); }
        });

        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => this._filter());
            this.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this._close();
                if (e.key === 'ArrowDown') { e.preventDefault(); this._focusOption(0); }
            });
        }

        document.addEventListener('click', (e) => {
            if (!this.wrapper.contains(e.target)) this._close();
        });
    }

    _toggle() {
        if (this.wrapper.classList.contains('open')) {
            this._close();
        } else {
            this._open();
        }
    }

    _open() {
        document.querySelectorAll('.custom-dropdown.open').forEach(d => {
            if (d !== this.wrapper) d.classList.remove('open');
        });
        this.wrapper.classList.add('open');
        if (this.searchInput) {
            this.searchInput.value = '';
            this._filter();
            setTimeout(() => this.searchInput.focus(), 50);
        }
    }

    _close() {
        this.wrapper.classList.remove('open');
        this.trigger.focus();
    }

    _selectOption(optEl, silent = false) {
        this.optionEls.forEach(o => o.classList.remove('selected'));
        optEl.classList.add('selected');

        this.labelSpan.textContent = optEl.textContent;
        this.labelSpan.classList.remove('cd-placeholder');

        this.select.value = optEl.dataset.value;
        this.select.dispatchEvent(new Event('change', { bubbles: true }));

        if (!silent) this._close();
    }

    _filter() {
        const q = this.searchInput.value.toLowerCase();
        let visible = 0;
        this.optionEls.forEach(o => {
            const match = o.textContent.toLowerCase().includes(q);
            o.classList.toggle('hidden', !match);
            if (match) visible++;
        });
        this.noMatch.style.display = visible === 0 ? 'block' : 'none';
    }

    _focusOption(index) {
        const visible = this.optionEls.filter(o => !o.classList.contains('hidden'));
        if (visible[index]) visible[index].focus();
    }

    setValue(value) {
        const opt = this.optionEls.find(o => o.dataset.value === value);
        if (opt) this._selectOption(opt, true);
    }

    reset() {
        this.optionEls.forEach(o => o.classList.remove('selected'));
        this.labelSpan.textContent = this.options[0]?.text || '選択';
        this.labelSpan.classList.add('cd-placeholder');
        this.select.value = '';
    }
}
