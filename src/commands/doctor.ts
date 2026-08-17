import chalk from 'chalk';
import { doctorAction } from '../actions/doctor.js';
import { banner } from '../utils/fs.js';
import { renderNextStepBox } from '../ui/next-step.js';
import { printJson, withStderrConsole } from '../utils/headless.js';

interface DoctorOptions {
  fix?: boolean;
  json?: boolean;
}

const STATUS_ICON: Record<string, string> = {
  ok: chalk.green('✔'),
  warn: chalk.yellow('⚠'),
  fail: chalk.red('✖'),
  info: chalk.dim('·'),
};

export async function doctorCommand(opts: DoctorOptions): Promise<void> {
  if (opts.json) {
    const result = await withStderrConsole(() => doctorAction({ fix: opts.fix }));
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  banner('VibeHarness · DOCTOR');

  const result = await doctorAction({ fix: opts.fix });
  let lastGroup = '';

  for (const check of result.data.checks) {
    if (check.group !== lastGroup) {
      lastGroup = check.group;
      const groupTitles: Record<string, string> = {
        runtime: 'Runtime',
        deps: 'Dependencies',
        automation: 'Automation',
        platform: 'GitHub platform security (via gh CLI)',
        tooling: 'Security tooling (recommended)',
      };
      console.log('\n' + chalk.bold(`  ${groupTitles[check.group]}:`));
    }
    const icon = STATUS_ICON[check.status] ?? chalk.dim('·');
    const hint = check.hint ? chalk.dim(` → ${check.hint}`) : '';
    console.log(`    ${icon}  ${check.label}${check.detail ? chalk.dim(` — ${check.detail}`) : ''}${hint}`);
  }

  console.log('');
  if (result.data.issues === 0) {
    console.log(chalk.bold.green('✅  Doctor: Tudo em ordem! Nenhuma pendência de manutenção encontrada.\n'));
  } else {
    console.log(chalk.bold.yellow(`🩺  Doctor encontrou ${result.data.issues} item(ns) de atenção — veja acima.\n`));
  }

  console.log(
    renderNextStepBox({
      currentActionSummary: 'Checagem de saúde e dependências concluída',
      nextStepTitle: 'Ver Painel de Saúde do Projeto',
      nextStepDescription: 'Acompanhe o score de segurança e o ciclo contínuo de desenvolvimento.',
      chatPrompt: 'Chat, execute o vibe_status para me mostrar o painel completo do projeto.',
      cliCommand: 'npx @vibeharness/cli status',
    }) + '\n'
  );
}
