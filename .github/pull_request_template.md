## What and why

<!-- Link the issue: "Fixes #123". Anything bigger than a typo needs an issue first. -->

## Checklist

- [ ] A test covers the change (for a bug: the test failed before the fix)
- [ ] False-positive guard: added `valid` cases for correct code near the change
- [ ] `npx changeset` added (skip only for docs/CI-only changes)
- [ ] Rule docs in `docs/rules/` updated if behaviour changed
- [ ] `npm run lint && npm run typecheck && npm test` pass locally
