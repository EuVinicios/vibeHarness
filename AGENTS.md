# AGENTS.md — @vibeharness/cli

> Guidance for AI coding agents (opencode, Codex, Cursor, and friends).
> Maintained by **vibe-harness** — re-run `npx @vibeharness/cli init` to regenerate.

## Project context

- Stack: not detected yet
- Source of truth: `.vibe/PRD.md` (what/why), `.vibe/SPEC.md` (how), `.vibe/CONSTITUTION.md` (non-negotiables).

## Commands

| Task | Command |
|------|---------|
| **Not sure what to do next** | `npx @vibeharness/cli start` |
| Create/update the PRD | `npx @vibeharness/cli prd` |
| Stack recommendation + install | `npx @vibeharness/cli plan --apply` |
| Sanitised context for AI | `npx @vibeharness/cli pack` |
| Production-readiness audit | `npx @vibeharness/cli audit --report` |
| Dependency/maintenance check | `npx @vibeharness/cli doctor --fix` |

## Rules

1. Read `.vibe/SPEC.md` and `.vibe/CONSTITUTION.md` before architectural changes.
2. Validate every external input with a typed schema.
3. Never commit secrets; never log PII.
4. Versioned migrations only.
5. Before marking work done: `npx @vibeharness/cli audit` score ≥ 70, no critical findings.
