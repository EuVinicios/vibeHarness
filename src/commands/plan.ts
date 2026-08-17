import chalk from 'chalk';
import { planAction } from '../actions/plan.js';
import { PROJECT_TYPE_QUESTION } from '../actions/questions.js';
import { askQuestions, confirm } from '../ui/prompt.js';
import { renderNextStepBox } from '../ui/next-step.js';
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
    // Build the plan FIRST so the user reviews real content before
    // consenting (STACK.md + item list). Then apply with the same options.
    const preview = await planAction({ projectType, apply: false, force: opts.force });
    if (!preview.ok && preview.pendingQuestions) {
      console.log(chalk.yellow(`  ⚠  ${preview.summary}`));
      return;
    }
    console.log('\n' + chalk.bold('📋  Apply plan:'));
    for (const item of preview.data.planItems ?? []) {
      console.log(`    ${item.category.padEnd(11)} ${item.name} — ${item.action}`);
    }
    for (const s of preview.data.skipped ?? []) {
      console.log(chalk.dim(`    ${s.category.padEnd(11)} ${s.name ?? ''} — skipped (${s.reason})`));
    }
    const go = await confirm('Apply this plan now? (installs the packages above and writes configs)');
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
  if (!result.ok) process.exitCode = 1;

  console.log(chalk.green(`  ✔  ${result.summary}`));
  for (const note of result.notes ?? []) console.log(chalk.yellow(`  ⚠  ${note}`));

  if (result.data.planItems.length > 0 && !opts.apply) {
    console.log(chalk.dim('\n  Itens prontos para aplicar:'));
    for (const item of result.data.planItems) {
      console.log(`    ${item.category.padEnd(11)} ${item.name} — ${item.action}`);
    }
    console.log('');
    console.log(
      renderNextStepBox({
        currentActionSummary: 'Recomendação de stack gerada (.vibe/STACK.md)',
        nextStepTitle: 'Aplicar a Stack Técnica',
        nextStepDescription: 'Instala dependências e gera as configurações seguras dos starters.',
        chatPrompt: 'Chat, aplique o plano de stack técnica (vibe_plan com apply: true).',
        cliCommand: 'npx @vibeharness/cli plan --apply',
      }) + '\n'
    );
  } else if (opts.apply && (result.data.wiringInstructions?.length ?? 0) > 0) {
    console.log('\n' + chalk.bold('🧵  Instruções de integração escritas em .vibe/starters/README.md:'));
    for (const step of result.data.wiringInstructions ?? []) {
      console.log(chalk.dim(`    - ${step}`));
    }
    console.log('');
    console.log(
      renderNextStepBox({
        currentActionSummary: 'Stack aplicada e starters gerados em .vibe/starters/',
        nextStepTitle: '4. Contexto Otimizado para IA (.vibe/CONTEXT.md)',
        nextStepDescription: 'Gera um pacote limpo e sanitizado do projeto para a IA ter visão global.',
        chatPrompt: 'Chat, integre os starters do VibeHarness e depois empacote o contexto (.vibe/CONTEXT.md).',
        cliCommand: 'npx @vibeharness/cli pack',
      }) + '\n'
    );
  } else {
    console.log('');
    console.log(
      renderNextStepBox({
        currentActionSummary: 'Stack definida em .vibe/STACK.md',
        nextStepTitle: '4. Contexto Otimizado para IA (.vibe/CONTEXT.md)',
        nextStepDescription: 'Empacota o projeto em formato limpo, com senhas e dados confidenciais redigidos.',
        chatPrompt: 'Chat, empacote o contexto do projeto usando o vibe_pack.',
        cliCommand: 'npx @vibeharness/cli pack',
      }) + '\n'
    );
  }
}
