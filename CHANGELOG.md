# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
