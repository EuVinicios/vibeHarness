#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statusCommand } from './commands/status.js';
import { installCommand } from './commands/install.js';
import { initCommand } from './commands/init.js';
import { packCommand } from './commands/pack.js';
import { rulesCommand } from './commands/rules.js';
import { auditCommand } from './commands/audit.js';
import { prdCommand } from './commands/prd.js';
import { planCommand } from './commands/plan.js';
import { doctorCommand } from './commands/doctor.js';
import { startCommand } from './commands/start.js';
import { mcpCommand } from './commands/mcp.js';

// Single source of truth: version comes from package.json — never hardcode it
// here again (v0.4.0 shipped reporting 0.3.0 because of a hardcoded string).
let cliVersion = '0.0.0';
try {
  const pkgRaw = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'),
    'utf8'
  );
  cliVersion = (JSON.parse(pkgRaw) as { version?: string }).version ?? cliVersion;
} catch {
  /* fall back to 0.0.0 */
}

const program = new Command();

program
  .name('vibe-harness')
  .description(
    chalk.bold.cyan('VibeHarness') +
      ' — All-in-one production harness for AI-assisted development. Let your AI client drive it: `vibe-harness install`'
  )
  .version(cliVersion);

const jsonFlag = (cmd: Command): Command =>
  cmd.option('--json', 'Machine-readable JSON output (headless — no prompts)');

jsonFlag(
  program
    .command('status', { isDefault: true })
    .description('Non-interactive status panel: stage, lifecycle progress, score, next step + ready-to-paste AI prompt')
    .action(statusCommand)
);

jsonFlag(
  program
    .command('install [client]')
    .description(
      'One-command setup for your AI client (claude-code, cursor, opencode, vscode-copilot, windsurf, antigravity, qwen): rules + MCP server + skills'
    )
    .option('--force', 'Overwrite existing client rules/extras files (default: skip files that already exist)')
    .action(installCommand)
);

program
  .command('mcp')
  .description('Run the vibe-harness MCP server over stdio (used by AI clients — usually not called directly)')
  .action(mcpCommand);

jsonFlag(
  program
    .command('init')
    .description('Phase 1 — Initialise spec, LGPD policy, AI rules, agent skill, and install pre-commit hook')
    .option('--yes', 'Skip interactive prompts and use safe defaults')
    .option('--force', 'Overwrite existing generated files (default: skip files that already exist)')
    .action(initCommand)
);

jsonFlag(
  program
    .command('prd')
    .description('Generate the Product Requirements Document (.vibe/PRD.md)')
    .option('--yes', 'Skip interactive prompts and generate placeholders')
    .option('--force', 'Overwrite an existing .vibe/PRD.md')
    .action(prdCommand)
);

jsonFlag(
  program
    .command('plan')
    .description('Generate a curated stack recommendation (.vibe/STACK.md) from the registry')
    .option('--yes', 'Skip interactive prompts and use defaults')
    .option('--force', 'Overwrite an existing .vibe/STACK.md')
    .option('--type <type>', 'Project type: fullstack-web, api, landing, saas')
    .option('--apply', 'Install the recommended dependencies and generate the initial configs (never touches src/)')
    .action(planCommand)
);

jsonFlag(
  program
    .command('pack')
    .description('Phase 2 — Package a sanitised project context for your AI assistant')
    .option('--output <path>', 'Output file path (default: .vibe/CONTEXT.md)')
    .option('--include-tests', 'Include test files in the context pack')
    .option('--exclude <patterns>', 'Extra comma-separated glob patterns to exclude')
    .action(packCommand)
);

jsonFlag(
  program
    .command('rules')
    .description('Generate AI assistant rule files for Cursor, Claude, Windsurf, Copilot')
    .option('--force', 'Overwrite existing rule files (default: skip)')
    .option(
      '--tools <tools>',
      'Comma-separated list of tools to target (cursor,claude,windsurf,copilot)',
      'cursor,claude,windsurf,copilot'
    )
    .action(rulesCommand)
);

jsonFlag(
  program
    .command('audit')
    .description('Phase 3 — Run production-readiness audit: Security, LGPD, Dead Code, Infra, A11y')
    .option('--report', 'Write AUDIT_REPORT.md with AI fix prompts')
    .option('--site', 'Also write the visual report (.vibe/report/index.html)')
    .option('--yes', 'Skip prompts (visual report only with --site)')
    .option('--fail-under <score>', 'Exit with code 1 if score is below N', '70')
    .option('--allow-critical', 'Explicit escape hatch: pass the gate even with critical findings (auditable via CI history)')
    .action(auditCommand)
);

jsonFlag(
  program
    .command('doctor')
    .description('Maintenance check: EOL runtimes, outdated dependencies, lockfile, Dependabot')
    .option('--fix', 'Generate .github/dependabot.yml if missing')
    .action(doctorCommand)
);

jsonFlag(
  program
    .command('start')
    .description('(Deprecated) Guided terminal flow — prefer `status` or `install`')
    .option('--yes', 'Skip prompts: infer the stage and print the recommended next step')
    .action(startCommand)
);

program.parse();
