# Contributing

Thanks for helping make NestJS DTOs safer! Bug reports, false-positive reports and pull requests are all welcome.

## Before you start

- **Bugs, false positives, missed drift, rule ideas:** open an [issue](https://github.com/kerimakmyradov/eslint-plugin-nest-drift/issues/new/choose) with a minimal DTO.
- **Pull requests** for anything bigger than a typo should reference an issue that a maintainer has labelled `confirmed`, so nobody spends time on a change that will not be merged.
- Issues labelled `good first issue` or `help wanted` are open for anyone — comment that you are taking one.
- Security problems: see [SECURITY.md](SECURITY.md). Never in a public issue.

## Development setup

Requirements: Node 22+ (the repo's `.nvmrc` pins 24) and npm.

```bash
git clone https://github.com/<you>/eslint-plugin-nest-drift.git
cd eslint-plugin-nest-drift
npm install
npm test          # unit tests (RuleTester with type information)
npm run lint
npm run typecheck
npm run build && npm run smoke   # lints tests/smoke with the built plugin
```

If vitest fails with `Cannot find native binding`, you hit an npm bug with optional dependencies:
`rm -rf node_modules package-lock.json && npm install` (do not commit the regenerated lockfile unless dependencies changed).

## How the code is organised

- `src/core/` — the engine: decorator discovery (`decorators.ts`), runtime classification of TypeScript types (`type-compare.ts`), `@Type`/swagger references (`type-ref.ts`).
- `src/rules/` — one rule per file, built only on `core/`.
- `tests/rules/` — one test file per rule; test code is type-checked against `tests/fixtures/tsconfig.json`.
- `docs/rules/` — one page per rule.

## Rules for changes

1. **Test first.** A bug fix starts with a test that fails without the fix.
2. **No false positives.** Every behaviour change adds `valid` cases for nearby correct code. When a rule cannot be sure (any/unknown/generics, custom decorators, non-literal options) it must stay silent.
3. **Add a changeset** for anything users can notice: run `npx changeset`, pick `patch` (fix), `minor` (new rule/option) or `major` (breaking), and write one line for the changelog. `CHANGELOG.md` and versions are generated from these files at release time — never edit them by hand.
4. **Update the rule's docs** in `docs/rules/` when behaviour changes.
5. **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/): `fix(each-matches-array): ...`, `feat: ...`, `docs: ...`.
6. Keep dependencies minimal; runtime code may depend only on `@typescript-eslint/utils` and the `typescript` peer.

## Review and merge

- CI must be green (Node 22/24 and the ESLint 8 job). CI for first-time contributors starts after a maintainer approves the run.
- A maintainer reviews every PR; `main` only changes through squash-merged pull requests.
- Releases are cut by the maintainers through the automated "chore: release" PR.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to uphold it.
