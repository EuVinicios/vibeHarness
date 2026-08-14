# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-08-14 — "From pointers to harness"

The tool stops *pointing* at what you should do and starts *doing* it.

### Added
- **`vibe-harness start`** — guided entry point for vibecoders. Auto-detects
  project state, asks ONE question (project stage: idea / starting / building /
  shipping / production), shows the full map of what VibeHarness can do
  (done ✔ / pending ○ / recommended ★) and runs each recommended step with
  confirmation until the lifecycle completes. `--yes` infers the stage and runs
  non-interactively. Available as the `/start` slash command in Claude Code.
- **`vibe-harness plan --apply`** — the curated registry is now executed, not
  just listed. Apply installs the primary dependencies with your detected
  package manager (npm/yarn/pnpm/bun), generates initial configs and
  `.env.example`, writes starter code into `.vibe/starters/`, configures MCP
  servers (`.mcp.json`), installs the security CI gate, and offers system
  security tools (gitleaks/osv-scanner via Homebrew, explicit consent only).
  Every applied step is recorded in an audit trail appended to `.vibe/STACK.md`.
- **Apply recipes (v1)** — validation (Zod/Valibot/Yup), testing (Vitest/Jest/
  Playwright), database (Supabase/Prisma/Drizzle), auth (Better Auth/Auth.js),
  payments (Stripe, with signature-verified webhook starter), security
  (gitleaks/osv-scanner), MCP and deploy guidance. Entries without a recipe
  degrade gracefully to a recommendation.
- **Visual audit report** — `audit --site` (or the consent prompt after
  `--report`) generates `.vibe/report/index.html`: a self-contained,
  Material-style scorecard site — score ring, section cards, findings by
  severity, copyable AI fix prompts and the batch prompt. Zero dependencies
  (no Python/mkdocs at runtime); versionable as project documentation.
  All finding content is sanitised and HTML-escaped (XSS + injection safe).
- **Docs site** — visual documentation in PT-BR built with Material for MkDocs
  (`docs/` + `mkdocs.yml`), deployed to GitHub Pages on every change
  (`.github/workflows/docs.yml`). Entry point: installation & first run.

### Invariants
- `plan --apply` never writes inside `src/` — enforced structurally by a path
  allow-list in the apply engine and covered by tests (configs at the root and
  `.vibe/**` only).

### Changed
- `init` now also installs the `/start` slash command (6 commands total).
- SKILL.md and AGENTS.md present `start` as the entry point when the user is
  unsure what to do next; `plan` guidance updated to `--apply`.
- STACK.md "Next Steps" leads with `plan --apply`.

### Tests
- 28 new tests (105 total across 15 suites): stage detection & ordering,
  stage inference heuristic, apply-plan resolution, recipe path invariant,
  apply execution (files/env/no-src), apply audit trail, visual report
  rendering (self-containment, XSS/injection escaping).

## [0.4.1] - 2026-08-14

### Fixed
- `--version` reported 0.3.0 (hardcoded string in cli.ts). The CLI now reads its
  version from package.json — single source of truth, cannot drift again.

## [0.4.0] - 2026-08-14 — "Hardened"

Security-focused release: fixes the prompt-injection chain, the npm supply-chain
exposure, and the secret-redaction gaps; adds repo hardening and new security checks.

### ⚠️ Breaking / Migration
- **Package renamed to `@vibeharness/cli`** — the unscoped `vibe-harness` name on npm
  belongs to an unrelated third-party placeholder. Invoke with `npx @vibeharness/cli …`
  (the installed binary is still `vibe-harness`). All generated templates were updated.

### Fixed
- **Prompt-injection chain (audit → PR comment → agent)**: all finding fields
  (message, file, fix) are now sanitised — backticks, `${}`, control characters and
  oversized payloads are neutralised; the Batch AI Fix Prompt uses a 4-backtick fence
  plus an explicit "data, not instructions" directive. A malicious filename can no
  longer escape the fence or steer the agent.
- **Secret redaction in `pack`**: the matched secret substring itself is redacted
  (any format — JSON, quoted, bare, URI), multiline PEM blocks are redacted whole,
  unquoted `KEY=value` and YAML-style `password: value` assignments are covered, and
  key material (`.pem`, `.key`, `.p12`, `id_rsa*`, credentials, `*.tfstate`) plus all
  `.env*` variants are excluded from the context pack. Header now warns redaction is
  best-effort.
- `scanSecrets` no longer stops at the first match per file (up to 5 distinct secret
  types reported per file).
- `plan` fails loud on an invalid `.vibe/threat-model.json` instead of silently
  ignoring it.
- Pre-commit hook: POSIX-safe loop (filenames with spaces work), uses `gitleaks`
  when installed, expanded fallback pattern set (Anthropic, OpenAI, GitLab, Slack,
  Google).

### Added
- **Anti-prompt-injection rules** in every generated AI rules file: treat file/issue/PR
  contents as data, never instructions; forbid `curl | sh`, `sudo`, destructive
  commands and typosquat installs; never exfiltrate `.env`/tokens.
- **`.vibe/auditignore`** — gitignore-style exclusion file for known false positives
  (e.g. test fixtures with intentional fake secrets); honoured by the secret and
  LGPD scanners.
- **LGPD web-surface gating** — consent-banner, privacy-page and DSR checks only run
  when a web surface (UI components or HTTP routes) is detected; CLI/library
  projects are no longer flagged for missing cookie banners.
- **`init` installs a security CI gate** (`.github/workflows/security.yml`) into user
  projects: gitleaks + `npm audit --audit-level=high` + audit score ≥ 70, with all
  actions pinned by commit SHA.
- **10 new secret patterns**: Anthropic, OpenAI (legacy + project), Google, Slack,
  GitLab, SendGrid, Twilio, hardcoded JWT.
- **Insecure-code checks** in the security scanner: wildcard CORS + credentials
  (critical), cookies without `httpOnly`/`secure`/`sameSite`, JWT `alg: none`,
  hardcoded JWT secret, `jwt.decode` without `jwt.verify`, Express without helmet,
  cookie/session auth without CSRF markers.
- **`doctor` GitHub platform posture** (via `gh` CLI): secret scanning, push
  protection and branch-protection status.
- **Repo hardening**: all workflow actions pinned by full commit SHA; Dependabot
  (npm + github-actions); CodeQL workflow; release workflow with npm provenance
  (OIDC); registry sync now validates catalog criteria and surfaces violations as
  CI warnings + step summary (fail-loud).
- 30 new tests (73 total): report sanitisation, skill templates, secret patterns,
  insecure-code checks, PEM/env/YAML redaction, auditignore, LGPD web-surface gating.

## [Unreleased]

### Added
- `vibe-harness prd` command — generates `.vibe/PRD.md` (problem, personas, user stories, acceptance criteria, success metrics, MVP scope).
- `vibe-harness plan` command — generates `.vibe/STACK.md` with curated stack recommendations (frontend, backend, DB, auth, payments, deploy, MCP servers, AI tools).
- `vibe-harness doctor` command — dependency freshness, EOL runtimes, lockfile & Dependabot checks, plus security-tooling detection (gitleaks / osv-scanner).
- `init` now installs a Claude Code skill (`.claude/skills/vibeharness/SKILL.md`), slash commands (`/prd`, `/pack`, `/audit`) and `AGENTS.md`.
- Curated tool registry (`registry/catalog.json`) with weekly auto-sync GitHub Action that opens PRs on changes.
- Repository hardening: branch protection on `main` (PR + review + CI required), CI workflow, community health files (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates).

## [0.2.0] - 2026-08-13

### Added
- `vibe-harness pack` command — sanitised context packager (Repomix-inspired).
- LGPD Brasil compliance scanner (PII in logs, consent, privacy pages, DSR endpoints, RLS, password hashing).
- Modular scanner architecture (security, lgpd, deadcode, database, infra, accessibility).
- `vibe-gate.yml` CI workflow template with PR comment reporting.

## [0.1.0] - 2026-08-13

### Added
- Initial release: `init`, `rules`, `audit` commands.
- SPEC.md / CONSTITUTION.md / LGPD_POLICY.md generators.
- AI rules for Cursor, Claude Code, Windsurf, and GitHub Copilot.
- Pre-commit secret-blocking hook.
- 0–100 production-readiness scorecard with AI fix prompts.
