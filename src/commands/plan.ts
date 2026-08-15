import chalk from 'chalk';
import { planAction } from '../actions/plan.js';
import { PROJECT_TYPE_QUESTION } from '../actions/questions.js';
import { askQuestions, confirm } from '../ui/prompt.js';
import { banner } from '../utils/fs.js';
import { printJson, withStderrConsole } from '../utils/headless.js';

interface PlanOptions {
  yes?: boolean;
  force?: boolean;
  type?: string;
  apply?: boolean;
  json?: boolean;
}

export async function planCommand(opts: PlanOptions): Promise<void> {
  if (opts.json) {
    const result = await withStderrConsole(() =>
      planAction({ projectType: opts.type, apply: opts.apply, yes: true, force: opts.force })
    );
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  banner('VibeHarness · PLAN');

  let projectType = opts.type;
  if (!projectType && !opts.yes) {
    try {
      const answers = await askQuestions([PROJECT_TYPE_QUESTION]);
      projectType = answers.projectType as string;
    } catch {
      console.log(chalk.yellow('  Selection skipped — defaulting to fullstack-web.'));
    }
  }

  if (opts.apply && !opts.yes) {
    const go = await confirm('Review the plan in .vibe/STACK.md — apply it now?');
    if (!go) {
      console.log(chalk.dim('  Skipped — run again with `npx @vibeharness/cli plan --apply` when ready.\n'));
      return;
    }
  }

  console.log('\n' + chalk.bold('🔧  Building the recommended stack…\n'));

  const result = await planAction({
    projectType,
    apply: opts.apply,
    yes: opts.yes,
    force: opts.force,
  });

  if (!result.ok && result.pendingQuestions) {
    console.log(chalk.yellow(`  ⚠  ${result.summary}`));
    return;
  }

  console.log(chalk.green(`  ✔  ${result.summary}`));
  for (const note of result.notes ?? []) console.log(chalk.yellow(`  ⚠  ${note}`));

  if (result.data.planItems.length > 0 && !opts.apply) {
    console.log(chalk.dim('\n  Ready to apply:'));
    for (const item of result.data.planItems) {
      console.log(`    ${item.category.padEnd(11)} ${item.name} — ${item.action}`);
    }
    console.log(chalk.dim('\n  Apply with: npx @vibeharness/cli plan --apply\n'));
  }

  if (opts.apply && (result.data.wiringInstructions?.length ?? 0) > 0) {
    console.log('\n' + chalk.bold('🧵  Wiring instructions written to .vibe/starters/README.md:'));
    for (const step of result.data.wiringInstructions ?? []) {
      console.log(chalk.dim(`    - ${step}`));
    }
    console.log(
      chalk.bold.cyan(
        '\n  👉 Ask your AI assistant to "wire the VibeHarness starters" — it will integrate them with your consent.\n'
      )
    );
  }
}
