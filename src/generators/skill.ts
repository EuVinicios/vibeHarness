export function skillMdTemplate(projectName: string): string {
  return `---
name: vibeharness
description: Production harness for vibecoding in ${projectName}. Use when starting a feature (prd/plan), preparing AI context (pack), or checking production readiness (audit/doctor). Invokes the vibe-harness CLI — never re-implement its logic.
---

# VibeHarness Skill

This project is guarded by **VibeHarness**. The CLI is the single source of truth — always invoke it via the terminal instead of reproducing its behaviour manually.

## Workflow

1. **Before coding a feature**
   - Ensure \`.vibe/PRD.md\` exists; if not, run \`npx vibe-harness prd\`.
   - Ensure \`.vibe/STACK.md\` decisions are reflected in \`.vibe/SPEC.md\`; if missing, run \`npx vibe-harness plan\`.
2. **While coding**
   - Read \`.vibe/SPEC.md\`, \`.vibe/CONSTITUTION.md\` and \`.vibe/PRD.md\` before making architectural decisions.
   - Need full-project context? Run \`npx vibe-harness pack\` and use \`.vibe/CONTEXT.md\` (secrets are redacted).
3. **Before declaring work done**
   - Run \`npx vibe-harness audit --report\`. Target score ≥ 70; fix critical/high findings first (AI fix prompts are in AUDIT_REPORT.md).
   - Run \`npx vibe-harness doctor\` periodically to keep dependencies fresh.

## Hard rules (from .vibe/CONSTITUTION.md)

- Never commit secrets or log PII.
- Validate every external input with a schema (Zod/Valibot/Pydantic).
- Versioned migrations only — never \`db push\` in production.
- Tests before merge for auth, payment and data-deletion flows.
`;
}

export type SlashCommandName = 'prd' | 'plan' | 'pack' | 'audit' | 'doctor';

const SLASH_COMMAND_SPECS: Record<SlashCommandName, { description: string; body: string }> = {
  prd: {
    description: 'Generate or update the project PRD (.vibe/PRD.md) via vibe-harness',
    body: `Run \`npx vibe-harness prd\` at the project root (add \`--yes\` only if the user asks to skip prompts).
Then open \`.vibe/PRD.md\`, review it with the user, and help fill any placeholder sections based on the conversation.`,
  },
  plan: {
    description: 'Generate the curated stack recommendation (.vibe/STACK.md) via vibe-harness',
    body: `Run \`npx vibe-harness plan\` at the project root (use \`--type <fullstack-web|api|landing|saas>\` if the user already stated the project type).
Then review \`.vibe/STACK.md\` with the user and copy the accepted decisions into \`.vibe/SPEC.md\` section 4.`,
  },
  pack: {
    description: 'Build a sanitised project context (.vibe/CONTEXT.md) for the AI assistant',
    body: `Run \`npx vibe-harness pack\` at the project root.
Use \`.vibe/CONTEXT.md\` as the project context. Never share it publicly; secrets are redacted but review before pasting into external services.`,
  },
  audit: {
    description: 'Run the production-readiness audit and fix findings',
    body: `Run \`npx vibe-harness audit --report\` at the project root.
Read \`AUDIT_REPORT.md\` and fix critical and high findings first, using the AI fix prompts. Re-run the audit until the score is ≥ 70 and no critical findings remain.`,
  },
  doctor: {
    description: 'Check dependency freshness and project maintenance health',
    body: `Run \`npx vibe-harness doctor\` at the project root (add \`--fix\` to generate \`.github/dependabot.yml\` automatically).
Report outdated dependencies, EOL runtimes, and apply the suggested upgrades with tests.`,
  },
};

export function slashCommandTemplate(name: SlashCommandName): string {
  const spec = SLASH_COMMAND_SPECS[name];
  return `---
description: ${spec.description}
---

${spec.body}
`;
}

export function agentsMdTemplate(projectName: string, stack: string[]): string {
  const stackLine = stack.length ? stack.join(', ') : 'not detected yet';
  return `# AGENTS.md — ${projectName}

> Guidance for AI coding agents (opencode, Codex, Cursor, and friends).
> Maintained by **vibe-harness** — re-run \`vibe-harness init\` to regenerate.

## Project context

- Stack: ${stackLine}
- Source of truth: \`.vibe/PRD.md\` (what/why), \`.vibe/SPEC.md\` (how), \`.vibe/CONSTITUTION.md\` (non-negotiables).

## Commands

| Task | Command |
|------|---------|
| Create/update the PRD | \`npx vibe-harness prd\` |
| Stack recommendation | \`npx vibe-harness plan\` |
| Sanitised context for AI | \`npx vibe-harness pack\` |
| Production-readiness audit | \`npx vibe-harness audit --report\` |
| Dependency/maintenance check | \`npx vibe-harness doctor\` |

## Rules

1. Read \`.vibe/SPEC.md\` and \`.vibe/CONSTITUTION.md\` before architectural changes.
2. Validate every external input with a typed schema.
3. Never commit secrets; never log PII.
4. Versioned migrations only.
5. Before marking work done: \`npx vibe-harness audit\` score ≥ 70, no critical findings.
`;
}
