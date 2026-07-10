import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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

  it('uses native selects and accessible disclosure controls', () => {
    for (const { path, source } of pageSources()) {
      expect(source, `${path}: custom select script`).not.toContain('js/custom-select.js');
      expect(source, `${path}: custom select class`).not.toMatch(/class=["'][^"']*\bcustom-select\b/);
    }

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
    for (const token of ['--accent', '--accent-soft', '--on-ok', '--on-warn', '--on-bad', '--fs-22', '--fs-24']) {
      expect(designCss).toContain(`${token}:`);
    }
    expect(designCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(designCss).toContain('@media (prefers-contrast: more)');
    expect(designCss).toContain('@media (forced-colors: active)');
  });

  it('does not reintroduce glass, gradients, or the removed custom dropdown', () => {
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
