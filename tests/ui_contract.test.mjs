import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PRODUCTION_PAGES = [
  '404.html',
  'admin.html',
  'checkin.html',
  'conflict.html',
  'entry.html',
  'entry_list.html',
  'help.html',
  'index.html',
  'judge.html',
  'my.html',
  'question.html',
  'terms.html',
];
function read(path) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

function pageSources() {
  return PRODUCTION_PAGES.map((path) => ({ path, source: read(path) }));
}

describe('production UI contracts', () => {
  it('uses synchronized shared asset versions on all production pages', () => {
    const pages = pageSources();
    const designVersions = pages.map(({ source }) => source.match(/css\/design_system\.css\?v=([^"']+)/)?.[1]);
    const pageVersions = pages.map(({ source }) => source.match(/css\/pages\.css\?v=([^"']+)/)?.[1]);
    expect(designVersions.every(Boolean)).toBe(true);
    expect(pageVersions.every(Boolean)).toBe(true);
    expect(new Set(designVersions).size).toBe(1);
    expect(new Set(pageVersions).size).toBe(1);

    const uiVersions = pages
      .map(({ source }) => source.match(/js\/ui\.js\?v=([^"']+)/)?.[1])
      .filter(Boolean);
    expect(new Set(uiVersions).size).toBe(1);

    const sharedVersions = pages
      .map(({ source }) => source.match(/js\/shared\.js\?v=([^"']+)/)?.[1])
      .filter(Boolean);
    expect(sharedVersions.length).toBeGreaterThan(0);
    expect(new Set(sharedVersions).size).toBe(1);
  });

  it('preserves strict CSP-compatible markup', () => {
    for (const { path, source } of pageSources()) {
      const csp = source.match(/http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i)?.[1];
      expect(csp, `${path}: CSP meta`).toBeTruthy();
      expect(csp, `${path}: unsafe-inline`).not.toContain("'unsafe-inline'");
      expect(source, `${path}: inline style`).not.toMatch(/\sstyle\s*=/i);
      expect(source, `${path}: inline event handler`).not.toMatch(/\son[a-z]+\s*=/i);
      expect(source, `${path}: inline script`).not.toMatch(/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i);
    }
  });

  it('keeps the required route and interaction hooks', () => {
    const required = {
      'admin.html': ['id="project-id-display"', 'id="menu-panel"', 'id="dt-picker"', 'data-tab-target=', 'data-action='],
      'entry.html': ['id="entry-form"', 'id="form-card"', 'id="send-code-btn"'],
      'my.html': ['id="auth-card"', 'id="hub"', 'id="my-number"'],
      'entry_list.html': ['id="list-body"', 'id="page-title"'],
      'judge.html': ['id="q-grid"', 'id="admin-menu-section"', 'class="u-hidden"'],
      'question.html': ['class="page-question"', 'id="answer-grid"', 'id="mobile-action-bar"'],
      'conflict.html': ['id="conflict-grid"', 'id="conflict-action-bar"'],
      'checkin.html': ['id="camera-container"', 'id="result"'],
    };
    for (const [path, fragments] of Object.entries(required)) {
      const source = read(path);
      for (const fragment of fragments) expect(source, `${path}: ${fragment}`).toContain(fragment);
    }
  });

  it('keeps real selects enhanced by the shared accessible custom control', () => {
    const ui = read('js/ui.js');
    expect(ui).toContain('function initCustomSelects');
    expect(ui).toContain("button.setAttribute('aria-haspopup', 'listbox')");
    expect(ui).toContain("select.dispatchEvent(new Event('change', { bubbles: true }))");

    const help = read('help.html');
    expect(help.match(/<button[^>]+class="qa-question"/g)).toHaveLength(22);
    expect(help.match(/aria-expanded="false"/g)?.length).toBeGreaterThanOrEqual(22);
    expect(help.match(/role="region"/g)).toHaveLength(22);
  });

  it('keeps dynamic UI rendering safe and keyboard operable', () => {
    const ui = read('js/ui.js');
    expect(ui).toContain("dialog.setAttribute('role', 'alertdialog')");
    expect(ui).toContain("dialog.setAttribute('aria-modal', 'true')");
    expect(ui).toContain("text.textContent = String(msg || '')");
    expect(ui).not.toContain('dataset.originalHtml');

    const adminSettings = read('js/admin_settings.js');
    expect(adminSettings).not.toMatch(/picker\.style\.(?:left|top)/);
    expect(adminSettings).toContain("picker.classList.add('place-above')");

    for (const path of ['js/judge.js', 'js/question.js', 'js/conflict.js']) {
      const source = read(path);
      expect(source, `${path}: grid cell role`).toContain("setAttribute('role', 'gridcell')");
      expect(source, `${path}: roving tabindex`).toMatch(/tabIndex\s*=/);
      expect(source, `${path}: keyboard activation`).toMatch(/event\.key === 'Enter'|event\.key !== 'Enter'/);
    }
  });

  it('keeps participant terms markdown extensions safe and styled', () => {
    const terms = read('js/terms.js');
    expect(terms).toContain('function stripFrontMatter');
    expect(terms).toContain('function parseCodeMeta');
    expect(terms).toContain('function appendSafeHtmlInline');
    expect(terms).toContain("block.type === 'definitionList'");
    expect(terms).not.toMatch(/innerHTML\s*=/);

    const css = read('css/pages.css');
    expect(css).toContain('.terms-task-checkbox:checked::after');
    expect(css).toContain('.terms-body pre[data-title]');
    expect(css).toContain('.terms-body small');
  });

  it('maps all product icon names to bundled Lucide icons', () => {
    const icons = read('js/icons.js');
    expect(icons).toContain('Lucide adapter');
    expect(icons).toContain('data-lucide');

    const aliasObjectSource = icons.match(/const ICON_ALIASES = (\{[\s\S]*?\n\});/)?.[1];
    expect(aliasObjectSource).toBeTruthy();
    const aliases = Function(`return (${aliasObjectSource})`)();
    const used = new Set();
    for (const { source } of pageSources()) {
      for (const match of source.matchAll(/data-icon="([^"]+)"/g)) used.add(match[1]);
    }
    for (const sourcePath of [
      'js/admin.js',
      'js/admin_scan.js',
      'js/admin_settings.js',
      'js/admin_stats.js',
      'js/checkin.js',
      'js/conflict.js',
      'js/entry.js',
      'js/entry_list.js',
      'js/index.js',
      'js/judge.js',
      'js/question.js',
      'js/ui.js',
    ]) {
      const source = read(sourcePath);
      for (const match of source.matchAll(/createIcon\('([^']+)'/g)) used.add(match[1]);
      for (const match of source.matchAll(/'([a-z0-9-]+)'/g)) {
        if (aliases[match[1]]) used.add(match[1]);
      }
    }

    const missing = Array.from(used).filter((name) => !aliases[name]).sort();
    expect(missing).toEqual([]);
  });

  it('does not keep the legacy path-registry icon contract in app or review pages', () => {
    const icons = read('js/icons.js');
    expect(icons).not.toContain('window.ICON_PATHS');
    expect(icons).toContain('window.LUCIDE_ICON_NODES');

    for (const path of [...PRODUCTION_PAGES, 'js/ui.js']) {
      const source = read(path);
      expect(source, `${path}: legacy icon path registry`).not.toContain('ICON_PATHS');
      expect(source, `${path}: legacy symbol style marker`).not.toContain('data-ciq-symbol-style');
      expect(source, `${path}: temporary percent ring icon`).not.toContain('percent-ring');
    }
  });

  it('uses the provided PNG favicon and removes the legacy OG image asset', () => {
    expect(existsSync(resolve(ROOT, 'favicon.png'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'favicon.svg'))).toBe(false);
    expect(existsSync(resolve(ROOT, 'og-image.png'))).toBe(false);
    expect(read('sw.js')).toContain("'favicon.png'");
    expect(read('sw.js')).not.toContain('favicon.svg');

    for (const { path, source } of pageSources()) {
      expect(source, `${path}: png favicon`).toContain('rel="icon" type="image/png" href="favicon.png?v=4"');
      expect(source, `${path}: svg favicon`).not.toContain('favicon.svg');
      expect(source, `${path}: og-image`).not.toMatch(/og:image|og-image\.png/);
    }
  });
});

describe('design-system contracts', () => {
  const designCss = read('css/design_system.css');
  const pagesCss = read('css/pages.css');
  const css = `${designCss}\n${pagesCss}`;

  it('defines every referenced CSS custom property', () => {
    const definitions = new Set(Array.from(css.matchAll(/--([a-z0-9-]+)\s*:/gi), (match) => match[1]));
    const references = new Set(Array.from(css.matchAll(/var\(\s*--([a-z0-9-]+)/gi), (match) => match[1]));
    const missing = Array.from(references).filter((name) => !definitions.has(name)).sort();
    expect(missing).toEqual([]);
  });

  it('uses the approved Apple interaction and accessibility tokens', () => {
    for (const token of ['--accent', '--accent-soft', '--on-ok', '--on-warn', '--on-bad', '--fs-22', '--fs-24',
      '--ease-out', '--ease-in-out', '--ease-drawer', '--t-press', '--t-popover', '--t-panel']) {
      expect(designCss).toContain(`${token}:`);
    }
    expect(designCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(designCss).toContain('@media (prefers-contrast: more)');
    expect(designCss).toContain('@media (forced-colors: active)');
  });

  it('keeps Apple-style motion bounded and component-specific', () => {
    expect(css).not.toMatch(/transition\s*:\s*all\b/i);
    expect(css).not.toMatch(/\bease-in(?!-out)\b/i);
    expect(designCss).toContain('@media (prefers-reduced-motion: reduce)');

    const transitionBlocks = css.match(/transition(?:-[a-z-]+)?\s*:[^;]+;/gi) || [];
    const longTransitions = transitionBlocks.filter((block) => {
      const durations = Array.from(block.matchAll(/(\d*\.?\d+)(ms|s)\b/gi), (match) => {
        const value = Number(match[1]);
        return match[2].toLowerCase() === 's' ? value * 1000 : value;
      });
      return durations.some((duration) => duration > 300);
    });
    expect(longTransitions).toEqual([]);
  });

  it('does not reintroduce glass, gradients, or legacy dropdown implementations', () => {
    expect(css).not.toMatch(/backdrop-filter\s*:/);
    expect(css).not.toMatch(/(?:linear|radial|conic)-gradient\s*\(/);
    expect(designCss).not.toContain('.custom-dropdown');
    expect(designCss).not.toContain('select.custom-select');
  });

  it('styles all JS-generated state classes', () => {
    expect(designCss).toMatch(/\.checklist-item\.is-done/);
    expect(designCss).toMatch(/\.checklist-item\.is-pending/);
    expect(designCss).toMatch(/\.q-card\.mine-active/);
    expect(designCss).toMatch(/\.q-card\.inprogress/);
    expect(designCss).toContain('.u-hidden');
  });
});
