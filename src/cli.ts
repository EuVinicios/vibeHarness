#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { packCommand } from './commands/pack.js';
import { rulesCommand } from './commands/rules.js';
import { auditCommand } from './commands/audit.js';

const program = new Command();

program
  .name('vibe-harness')
  .description(
    chalk.bold.cyan('VibeHarness') +
      ' — All-in-one production harness for AI-assisted development'
  )
  .version('0.2.0');

program
  .command('init')
  .description(
    'Phase 1 — Initialise spec, LGPD policy, AI rules, and install pre-commit hook'
  )
  .option('--yes', 'Skip interactive prompts and use safe defaults')
  .action(initCommand);

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
  .option('--fail-under <score>', 'Exit with code 1 if score is below N', '70')
  .action(auditCommand);

program.parse();
