import chalk from 'chalk';
import ora from 'ora';
import { banner } from '../utils/fs.js';
import {
  ACTION_LIFECYCLE,
  detectProjectState,
  inferStage,
  isActionDone,
  nextAction,
  type ActionId,
  type ProjectState,
  type Stage,
} from '../core/stage.js';
import { initCommand } from './init.js';
import { prdCommand } from './prd.js';
import { planCommand } from './plan.js';
import { packCommand } from './pack.js';
import { auditCommand } from './audit.js';
import { doctorCommand } from './doctor.js';

interface StartOptions {
  yes?: boolean;
}

const ACTION_META: Record<ActionId, { emoji: string; title: string; why: string; command: string }> = {
  init: {
    emoji: '🟢',
    title: 'Initialise the harness',
    why: 'Spec, constitution, LGPD policy, AI rules, threat model and the secret-blocking pre-commit hook.',
    command: 'npx @vibeharness/cli init',
  },
  prd: {
    emoji: '🟢',
    title: 'Write the PRD',
    why: 'The product source of truth your AI agent reads before coding.',
    command: 'npx @vibeharness/cli prd',
  },
  plan: {
    emoji: '🟢',
    title: 'Plan & apply the stack',
    why: 'Curated registry recommendation — installs dependencies and generates the initial configs for you.',
    command: 'npx @vibeharness/cli plan --apply',
  },
  pack: {
    emoji: '🟡',
    title: 'Pack context for your AI',
    why: 'Sanitised project context (secrets redacted) ready to paste into your assistant.',
    command: 'npx @vibeharness/cli pack',
  },
  audit: {
    emoji: '🔴',
    title: 'Run the production audit',
    why: '0–100 scorecard across security, LGPD, infra and a11y — with AI fix prompts.',
    command: 'npx @vibeharness/cli audit --report',
  },
  doctor: {
    emoji: '🔁',
    title: 'Maintenance check',
    why: 'EOL runtimes, outdated dependencies and automatic Dependabot setup.',
    command: 'npx @vibeharness/cli doctor --fix',
  },
};

async function askStage(): Promise<Stage> {
  const { prompt } = await import('enquirer');
  const { stage } = await prompt<{ stage: Stage }>({
    type: 'select',
    name: 'stage',
    message: '🧭  One question: where is your project right now?',
    choices: [
      { name: 'idea', message: '💡 Idea — not coding yet' },
      { name: 'starting', message: '🏗️  Starting — project is (almost) empty' },
      { name: 'building', message: '💻 Building — actively coding' },
      { name: 'shipping', message: '🚀 Shipping — final review before production' },
      { name: 'production', message: '🛠️  Production — already live, maintenance mode' },
    ],
  } as Parameters<typeof prompt>[0]);
  return stage;
}

function printMap(state: ProjectState, stage: Stage, recommended: ActionId | null): void {
  console.log(
    chalk.bold(`\n🗺️  What VibeHarness can do for you ${chalk.dim(`(stage: ${stage})`)}\n`)
  );
  for (const id of ACTION_LIFECYCLE) {
    const meta = ACTION_META[id];
    const done = isActionDone(state, id);
    const isNext = id === recommended;
    const icon = done ? chalk.green('✔') : isNext ? chalk.yellow('★') : chalk.dim('○');
    const label = done
      ? chalk.dim(`${meta.title} — done`)
      : isNext
        ? chalk.bold.yellow(`${meta.title} — recommended next`)
        : chalk.white(meta.title);
    console.log(`  ${icon} ${meta.emoji} ${label}`);
    console.log(chalk.dim(`       ${meta.why}`));
  }
}

async function runAction(id: ActionId, yes: boolean): Promise<void> {
  switch (id) {
    case 'init':
      await initCommand({ yes });
      break;
    case 'prd':
      await prdCommand({ yes });
      break;
    case 'plan':
      await planCommand({ yes, apply: true });
      break;
    case 'pack':
      await packCommand({});
      break;
    case 'audit':
      // failUnder '0': the guided flow must never be killed by the score gate —
      // the user sees the scorecard and fix prompts, then continues.
      await auditCommand({ report: true, failUnder: '0', yes });
      break;
    case 'doctor':
      await doctorCommand({ fix: true });
      break;
  }
}

async function confirmNext(meta: (typeof ACTION_META)[ActionId]): Promise<boolean> {
  const { prompt } = await import('enquirer');
  const { go } = await prompt<{ go: boolean }>({
    type: 'confirm',
    name: 'go',
    message: `Run "${meta.title}" now? (${meta.command})`,
    initial: true,
  } as Parameters<typeof prompt>[0]);
  return go;
}

export async function startCommand(opts: StartOptions): Promise<void> {
  banner('VibeHarness · START');

  const spinner = ora('Detecting project state…').start();
  let state = await detectProjectState();
  spinner.succeed('Project state detected');

  let stage: Stage;
  if (opts.yes) {
    stage = inferStage(state);
    console.log(chalk.dim(`  --yes flag set: stage inferred from project state (${stage}).`));
  } else {
    try {
      stage = await askStage();
    } catch {
      console.log(chalk.yellow('  Selection skipped — stage inferred from project state.'));
      stage = inferStage(state);
    }
  }

  let recommended = nextAction(state, stage);
  printMap(state, stage, recommended);

  if (!recommended) {
    console.log(chalk.bold.green('\n✅  All lifecycle steps are done. Re-run any command whenever you need.\n'));
    return;
  }

  while (recommended) {
    const meta = ACTION_META[recommended];
    console.log(chalk.bold(`\n▶️  Next step: ${meta.title}`));
    console.log(chalk.dim(`   ${meta.command}\n`));

    let go = true;
    if (!opts.yes) {
      try {
        go = await confirmNext(meta);
      } catch {
        console.log(chalk.yellow('  Prompt skipped — stopping the guided flow.'));
        go = false;
      }
    }
    if (!go) {
      console.log(chalk.dim(`\n  Run it later with: ${meta.command}\n`));
      return;
    }

    await runAction(recommended, opts.yes === true);

    state = await detectProjectState();
    recommended = nextAction(state, stage);
    if (recommended) {
      console.log(chalk.bold.cyan(`\n🗺️  Step complete — here is what is left:\n`));
      printMap(state, stage, recommended);
    }
  }

  console.log(
    chalk.bold.green('\n✅  Full lifecycle complete — project is ready. Keep it fresh with `npx @vibeharness/cli doctor`.\n')
  );
}
