import chalk from 'chalk';
import { prdAction } from '../actions/prd.js';
import { PRD_QUESTIONS } from '../actions/questions.js';
import { askQuestions } from '../ui/prompt.js';
import { banner } from '../utils/fs.js';
import { printJson, withStderrConsole } from '../utils/headless.js';

interface PrdOptions {
  yes?: boolean;
  force?: boolean;
  json?: boolean;
}

export async function prdCommand(opts: PrdOptions): Promise<void> {
  if (opts.json) {
    const result = await withStderrConsole(() => prdAction({ force: opts.force, requireAnswers: false }));
    printJson(result);
    return;
  }

  banner('VibeHarness · PRD');

  let answers: Record<string, unknown> | undefined;
  if (!opts.yes) {
    console.log(chalk.bold('\n📋  Product Questionnaire\n'));
    try {
      answers = await askQuestions(PRD_QUESTIONS);
    } catch {
      console.log(chalk.yellow('\n  Questionnaire skipped — generating placeholder PRD.\n'));
    }
  } else {
    console.log(chalk.dim('  --yes flag set: generating placeholder PRD.\n'));
  }

  const result = await prdAction({ answers, force: opts.force });

  if (result.data.written) {
    console.log(chalk.green('  ✔  Written: .vibe/PRD.md'));
    console.log(chalk.dim([
      '',
      '  Next steps:',
      '    1. Fill the placeholder sections in .vibe/PRD.md',
      '    2. npx @vibeharness/cli plan   → curated stack recommendation',
      '    3. npx @vibeharness/cli pack   → sanitised context for your AI assistant',
    ].join('\n') + '\n'));
  } else {
    console.log(chalk.yellow('  ⚠  .vibe/PRD.md already exists — skipped (use --force to overwrite).'));
  }
}
