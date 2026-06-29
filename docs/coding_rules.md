# Coding Rules

## JavaScript

- Use plain browser JavaScript.
- Keep page logic in the matching `js/<page>.js` file.
- Put reusable Supabase calls in `js/supabase_api.js`.
- Prefer `const` and `let`.
- Keep helpers small and named by behavior.
- Avoid global state unless the surrounding page already uses it.

## Rendering

- Build DOM nodes with `document.createElement`.
- Use `textContent` for variable text.
- Do not introduce raw `innerHTML` for user or database content.
- Reuse shared helpers in `js/ui.js`, `js/shared.js`, and page-local render helpers.

## CSS

- Reuse `css/design_system.css` tokens and utility classes.
- Put page-specific rules in `css/pages.css`.
- Do not add inline `style` attributes or JS `element.style` mutations.
- Keep colors and states consistent across entry, disclosure, admin, judge, and conflict pages.

## Naming

- HTML ids should describe page-local UI elements.
- JS page files should match HTML entry points.
- Tests use `*.test.mjs`.
- Migrations use timestamped descriptive names.
