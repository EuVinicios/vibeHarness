import chalk from 'chalk';
import { box } from './box.js';

export interface NextStepOptions {
  currentActionSummary?: string;
  nextStepTitle: string;
  nextStepDescription?: string;
  chatPrompt?: string;
  cliCommand?: string;
  showStatusHint?: boolean;
}

/**
 * Renders a standardized, beautiful card showing what was accomplished
 * and giving dual clear next-step options (AI Chat prompt + Terminal command).
 */
export function renderNextStepBox(opts: NextStepOptions): string {
  const lines: string[] = [];

  if (opts.currentActionSummary) {
    lines.push(`${chalk.bold.green('✔ Concluído:')} ${chalk.white(opts.currentActionSummary)}`);
    lines.push('');
  }

  lines.push(`${chalk.bold.yellow('🎯 Próximo Passo:')} ${chalk.bold.white(opts.nextStepTitle)}`);
  if (opts.nextStepDescription) {
    lines.push(chalk.dim(`   ↳ ${opts.nextStepDescription}`));
  }
  lines.push('');

  if (opts.chatPrompt) {
    lines.push(chalk.bold.cyan('💬 No Chat da sua IA (Copie e envie):'));
    lines.push(`   ${chalk.bold.yellow(`"${opts.chatPrompt}"`)}`);
    lines.push('');
  }

  if (opts.cliCommand) {
    lines.push(chalk.bold.cyan('💻 No Terminal (Comando Direto):'));
    lines.push(`   ${chalk.white(opts.cliCommand)}`);
    lines.push('');
  }

  if (opts.showStatusHint !== false) {
    lines.push(chalk.dim('🧭 Ver painel de saúde e progresso a qualquer momento:'));
    lines.push(chalk.dim('   npx @vibeharness/cli status'));
  }

  return box(lines, {
    title: '👉 O QUE FAZER AGORA',
    color: chalk.yellow,
    padding: 1,
  });
}

/**
 * Renders guidance for daily/continuous development when all 6 lifecycle
 * setup stages are completed.
 */
export function renderContinuousWorkflowBox(): string {
  const lines: string[] = [
    chalk.bold.green('🏆 Ciclo Base Completo — Seu projeto está pronto e protegido!'),
    '',
    chalk.bold.cyan('🔄 Fluxo de Trabalho Contínuo com IA (Dia a Dia):'),
    `  ${chalk.bold('1. Construa Features:')} Peça para sua IA implementar requisitos do ${chalk.cyan('.vibe/PRD.md')}.`,
    `  ${chalk.bold('2. Valide Prontidão:')} Antes de commits ou deploy, rode a auditoria visual:`,
    `     ${chalk.yellow('npx @vibeharness/cli audit --site')}`,
    `  ${chalk.bold('3. Mantenha Dependências:')} Atualize pacotes e segurança regularmente:`,
    `     ${chalk.yellow('npx @vibeharness/cli doctor --fix')}`,
    '',
    chalk.dim('💡 Dica: Peça no chat da sua IA "vibe_status" a qualquer momento para checar a saúde.'),
  ];

  return box(lines, {
    title: '🚀 DESENVOLVIMENTO CONTÍNUO',
    color: chalk.green,
    padding: 1,
  });
}
