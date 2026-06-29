# Workflow

Use issue-scoped development whenever practical.

## Before Implementation

1. Identify the affected page and user flow.
2. Read the relevant HTML file.
3. Read the matching JS file.
4. Search for existing helpers and CSS classes.
5. Check architecture/security docs if data access or permissions change.
6. Make a scoped plan.

## During Implementation

- Keep changes narrow.
- Avoid unrelated refactors.
- Preserve current architecture.
- Update cache-busting query strings when changing deployed JS/CSS files.
- Update docs when behavior, security assumptions, or architecture changes.

## Verification

Run the relevant subset:

```bash
npm test
find js -name '*.js' -exec node --check {} \;
git diff --check
```

For UI work, inspect affected pages manually when possible and note anything not visually verified.

## Commit Style

Use short imperative commit messages, for example:

- `Fix entry labels and list states`
- `Validate answer PDF uploads`
- `Tighten style CSP`
