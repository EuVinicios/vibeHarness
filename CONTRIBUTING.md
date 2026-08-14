# Contributing to VibeHarness

Thanks for your interest in VibeHarness! This project follows a **PR-only workflow** — the `main` branch is protected and all changes (including from maintainers) land via pull request.

## How to Contribute

1. **Fork** the repository (forks are welcome and unrestricted).
2. Create a feature branch from `main`: `git checkout -b feat/my-change`.
3. Make your changes, following the conventions below.
4. Run `npm run build` and `npm test` — both must pass.
5. Open a pull request against `main`, filling in the PR template.

## Development Setup

```bash
git clone https://github.com/<you>/vibeHarness.git
cd vibeHarness
npm install
npm run build    # compile TypeScript → dist/
npm test         # run the test suite
```

## Conventions

- **Language:** TypeScript (strict), ESM modules, Node ≥ 18.
- **Style:** follow the existing patterns in `src/` — one responsibility per module, explicit return types, no `any` without justification.
- **No new runtime dependencies** without discussion (see Constitution Law 6 in the project docs). Prefer Node built-ins.
- **Tests:** add/extend tests in `tests/` for any scanner, generator, or command change.
- **Commits:** use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- **Never commit secrets.** The pre-commit hook and CI will block them.

## Adding a New Scanner

1. Create `src/scanners/<name>.ts` exporting an async function that returns `AuditSectionResult`.
2. Register it in `src/core/orchestrator.ts`.
3. Add section metadata (emoji + name) in `src/ui/report.ts` and `src/ui/tui.ts`.
4. Add tests in `tests/<name>.test.ts`.

## Adding a New AI-Rule Target

1. Add a template function in `src/generators/rules.ts`.
2. Wire it into `src/commands/init.ts` and `src/commands/rules.ts`.

## Release Process (maintainers)

> ⚠️ **npm name:** `vibe-harness` on the npm registry is currently occupied by a
> placeholder `0.0.1` package. Before publishing, move to a scoped name
> (e.g. `@euvinicios/vibe-harness`) or acquire the name. Update `package.json`
> `name` accordingly; the `vibe-harness` bin/command can stay unchanged.

1. Update `CHANGELOG.md` (move Unreleased items into the new version).
2. Bump the version in `package.json` **and** in `src/cli.ts` (`.version(...)`).
3. Open a PR; after CI passes and review is approved, merge.
4. Tag the release: `git tag vX.Y.Z && git push origin vX.Y.Z`.
5. Publish: `npm publish --access public` (runs `prepublishOnly` → build automatically).

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Security Issues

Do **not** open public issues for vulnerabilities. See [SECURITY.md](./SECURITY.md).
