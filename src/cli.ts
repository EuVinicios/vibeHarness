#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initCommand } from './commands/init.js';
import { packCommand } from './commands/pack.js';
import { rulesCommand } from './commands/rules.js';
import { auditCommand } from './commands/audit.js';
import { prdCommand } from './commands/prd.js';
import { planCommand } from './commands/plan.js';
import { doctorCommand } from './commands/doctor.js';
import { startCommand } from './commands/start.js';

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
      ' — All-in-one production harness for AI-assisted development'
  )
  .version(cliVersion);

program
  .command('start')
  .description(
    'Guided entry point — one question about your project stage, then VibeHarness recommends and runs the next steps'
  )
  .option('--yes', 'Skip prompts: infer the stage and run the recommended step with defaults')
  .action(startCommand);

program
  .command('init')
  .description(
    'Phase 1 — Initialise spec, LGPD policy, AI rules, agent skill, and install pre-commit hook'
  )
  .option('--yes', 'Skip interactive prompts and use safe defaults')
  .action(initCommand);

program
  .command('prd')
  .description('Generate the Product Requirements Document (.vibe/PRD.md)')
  .option('--yes', 'Skip interactive prompts and generate placeholders')
  .option('--force', 'Overwrite an existing .vibe/PRD.md')
  .action(prdCommand);

program
  .command('plan')
  .description(
    'Generate a curated stack recommendation (.vibe/STACK.md) from the registry'
  )
  .option('--yes', 'Skip interactive prompts and use defaults')
  .option('--force', 'Overwrite an existing .vibe/STACK.md')
  .option('--type <type>', 'Project type: fullstack-web, api, landing, saas')
  .option('--apply', 'Install the recommended dependencies and generate the initial configs (never touches src/)')
  .action(planCommand);

program
  .command('pack')
  .description(
    'Phase 2 — Package a sanitised project context for your AI assistant'
  )
  .option('--output <path>', 'Output file path (default: .vibe/CONTEXT.md)')
  .option('--include-tests', 'Include test files in the context pack')
  .option('--exclude <patterns>', 'Extra comma-separated glob patterns to exclude')
  .action(packCommand);

program
  .command('rules')
  .description(
    'Generate AI assistant rule files for Cursor, Claude, Windsurf, Copilot'
  )
  .option(
    '--tools <tools>',
    'Comma-separated list of tools to target (cursor,claude,windsurf,copilot)',
    'cursor,claude,windsurf,copilot'
  )
  .action(rulesCommand);

program
  .command('audit')
  .description(
    'Phase 3 — Run production-readiness audit: Security, LGPD, Dead Code, Infra, A11y'
  )
  .option('--report', 'Write AUDIT_REPORT.md with AI fix prompts')
  .option('--site', 'Also write the visual report (.vibe/report/index.html)')
  .option('--yes', 'Skip prompts (visual report only with --site)')
  .option('--fail-under <score>', 'Exit with code 1 if score is below N', '70')
  .action(auditCommand);

program
  .command('doctor')
  .description(
    'Maintenance check: EOL runtimes, outdated dependencies, lockfile, Dependabot'
  )
  .option('--fix', 'Generate .github/dependabot.yml if missing')
  .action(doctorCommand);

program.parse();
