import chalk from 'chalk';
import { initAction } from '../actions/init.js';
import { THREAT_MODEL_QUESTIONS, coerceThreatModel } from '../actions/questions.js';
import { askQuestions } from '../ui/prompt.js';
import { banner, detectStack } from '../utils/fs.js';
import { printJson, withStderrConsole } from '../utils/headless.js';

interface InitOptions {
  yes?: boolean;
  force?: boolean;
  json?: boolean;
}

export async function initCommand(opts: InitOptions): Promise<void> {
  if (opts.json) {
    const result = await withStderrConsole(() =>
      initAction({ force: opts.force, requireAnswers: false })
    );
    printJson(result);
    return;
  }

  banner('VibeHarness · INIT');

  const stack = await detectStack();
  console.log(chalk.dim(`  Stack detected: ${stack.length ? stack.join(', ') : 'Generic'}`));

  let answers: Record<string, unknown> | undefined;
  if (!opts.yes) {
    console.log(chalk.bold('\n🔍  Quick Threat Model Questionnaire\n'));
    try {
      answers = await askQuestions(THREAT_MODEL_QUESTIONS);
    } catch {
      console.log(chalk.yellow('\n  Questionnaire skipped — using safe defaults.\n'));
    }
  } else {
    console.log(chalk.dim('  --yes flag set: using safe defaults.\n'));
  }

  console.log('\n' + chalk.bold('📝  Generating project files…\n'));

  const result = await initAction({ answers, force: opts.force });

  if (answers) {
    const tm = coerceThreatModel(answers);
    console.log(
      chalk.dim(
        `  Threat model: payments=${tm.hasPayments} auth=${tm.hasAuth} pii=${tm.hasSensitiveData} scope=${tm.country}\n`
      )
    );
  }
  for (const note of result.notes ?? []) console.log(chalk.dim(`  ·  ${note}`));

  console.log('\n' + chalk.bold.green('✅  VibeHarness initialised!'));
  console.log(chalk.dim([
    '',
    '  Next steps:',
    '    npx @vibeharness/cli prd    → write the product requirements',
    '    npx @vibeharness/cli plan   → curated stack recommendation',
    '    npx @vibeharness/cli pack   → build sanitised context for AI',
    '    npx @vibeharness/cli audit  → run production readiness check',
  ].join('\n') + '\n'));
}
