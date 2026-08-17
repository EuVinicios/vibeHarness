import chalk from 'chalk';
import { initAction } from '../actions/init.js';
import { THREAT_MODEL_QUESTIONS, coerceThreatModel } from '../actions/questions.js';
import { askQuestions } from '../ui/prompt.js';
import { renderNextStepBox } from '../ui/next-step.js';
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

  console.log('\n' + chalk.bold.green('✅  Fundação do VibeHarness inicializada com sucesso!\n'));
  console.log(
    renderNextStepBox({
      currentActionSummary: 'Fundação criada: .vibe/ (SPEC.md, CONSTITUTION.md), regras de IA e pre-commit hook de proteção',
      nextStepTitle: '2. Especificação do Produto (.vibe/PRD.md)',
      nextStepDescription: 'Defina a visão, público-alvo e recursos essenciais para guiar sua IA sem desvios.',
      chatPrompt: 'Chat, vamos criar a especificação do produto (.vibe/PRD.md) usando o VibeHarness.',
      cliCommand: 'npx @vibeharness/cli prd',
    }) + '\n'
  );
}
