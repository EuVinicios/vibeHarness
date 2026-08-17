import chalk from 'chalk';
import { prdAction } from '../actions/prd.js';
import { PRD_QUESTIONS } from '../actions/questions.js';
import { askQuestions } from '../ui/prompt.js';
import { renderNextStepBox } from '../ui/next-step.js';
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
    console.log(chalk.bold.green('  ✔  Especificação do Produto salva: .vibe/PRD.md\n'));
    console.log(
      renderNextStepBox({
        currentActionSummary: 'Especificação do produto gerada em .vibe/PRD.md',
        nextStepTitle: '3. Stack & Arquitetura (.vibe/STACK.md)',
        nextStepDescription: 'Recomenda a stack ideal e instala configurações seguras no seu projeto.',
        chatPrompt: 'Chat, recomende e aplique a melhor stack técnica para o projeto (vibe_plan com apply: true).',
        cliCommand: 'npx @vibeharness/cli plan --apply',
      }) + '\n'
    );
  } else {
    console.log(chalk.yellow('  ⚠  .vibe/PRD.md já existe — ignorado (use --force para sobrescrever).\n'));
    console.log(
      renderNextStepBox({
        nextStepTitle: '3. Stack & Arquitetura (.vibe/STACK.md)',
        nextStepDescription: 'Recomenda a stack ideal e instala configurações seguras no seu projeto.',
        chatPrompt: 'Chat, recomende e aplique a melhor stack técnica para o projeto (vibe_plan com apply: true).',
        cliCommand: 'npx @vibeharness/cli plan --apply',
      }) + '\n'
    );
  }
}
