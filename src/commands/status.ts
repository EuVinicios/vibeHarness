import chalk from 'chalk';
import { statusAction } from '../actions/status.js';
import { banner } from '../utils/fs.js';
import { box } from '../ui/box.js';
import { colors, icons, gradeChip, scoreChip, stageChip } from '../ui/theme.js';
import { renderNextStepBox, renderContinuousWorkflowBox } from '../ui/next-step.js';
import { printJson, withStderrConsole } from '../utils/headless.js';

interface StatusOptions {
  json?: boolean;
}

/**
 * The non-interactive cockpit (v0.8+): renders where the project stands,
 * what has already been built, the standard golden path, and hands the user
 * a crystal-clear immediate next step for their AI client and terminal.
 */
export async function statusCommand(opts: StatusOptions = {}): Promise<void> {
  if (opts.json) {
    const result = await withStderrConsole(() => statusAction());
    printJson(result);
    return;
  }

  banner('VibeHarness · STATUS');

  const result = await withStderrConsole(() => statusAction());
  const d = result.data;

  // 1. Cockpit Header Box
  const header: string[] = [
    `${icons.shield} VibeHarness · Painel de Saúde — ${chalk.bold.white(d.project)}`,
    `Fase: ${stageChip(d.stage)}${d.score ? `  ·  Score de Segurança: ${scoreChip(d.score.score, d.score.max)} ${gradeChip(d.score.grade)}` : chalk.dim('  ·  Score: — (não auditado ainda)')}`,
  ];

  console.log('\n' + box(header, { color: chalk.cyan, padding: 1 }) + '\n');

  // 2. Trilha Padrão (Golden Path visual summary)
  console.log(chalk.bold.cyan('🧭  Trilha Padrão do VibeHarness (Golden Path):'));
  console.log(
    chalk.dim('   ') +
    [
      chalk.green('1. Proteção'),
      chalk.green('2. Escopo (PRD)'),
      chalk.green('3. Stack'),
      chalk.green('4. Contexto IA'),
      chalk.green('5. Auditoria'),
      chalk.green('6. Saúde'),
    ].join(chalk.dim(' ➔ ')) +
    '\n'
  );

  // 3. O que já está pronto no projeto
  const readyDeliverables = d.deliverables.filter((del) => del.done);
  console.log(chalk.bold.cyan('📦  O que já foi feito no seu projeto:'));
  if (readyDeliverables.length === 0) {
    console.log(chalk.dim('   Nenhum artefato configurado ainda — comece com a etapa de proteção.\n'));
  } else {
    for (const del of readyDeliverables) {
      console.log(`   ${chalk.green('✔')} ${chalk.bold.white(del.name)} ${chalk.dim(`(${del.file})`)}`);
    }
    console.log('');
  }

  // 4. Ciclo de Vida detalhado
  console.log(chalk.bold.cyan('🗺️  Etapas do Ciclo de Vida:'));
  for (const entry of d.lifecycle) {
    const icon = entry.done ? chalk.green('✔') : entry.recommended ? chalk.yellow('★') : chalk.dim('○');
    const label = entry.done
      ? chalk.dim(`${entry.title} — concluído`)
      : entry.recommended
        ? chalk.bold.yellow(`${entry.title} — RECOMENDADO AGORA`)
        : chalk.white(entry.title);
    console.log(`  ${icon} ${label}`);
    if (entry.recommended) {
      console.log(chalk.dim(`     ↳ ${entry.why}`));
    }
  }

  // 5. Raio-X por Área (Scorecard técnico)
  if (d.score?.sections) {
    const meta: Record<string, { emoji: string; name: string }> = {
      security: { emoji: '🛡️', name: 'Segurança' },
      dependencies: { emoji: '📦', name: 'Dependências' },
      lgpd: { emoji: '🇧🇷', name: 'LGPD' },
      deadcode: { emoji: '🧹', name: 'Higiene' },
      database: { emoji: '🗄️', name: 'Banco' },
      infra: { emoji: '🏗️', name: 'Infra' },
      accessibility: { emoji: '♿', name: 'A11y' },
    };
    const chips = Object.entries(d.score.sections).map(([key, s]) => {
      const m = meta[key] ?? { emoji: '•', name: key };
      const full = s.score >= s.max;
      const low = s.max > 0 && s.score / s.max < 0.5;
      const text = `${m.emoji} ${m.name}: ${s.score}/${s.max}`;
      return full ? chalk.green(text) : low ? chalk.red(text) : chalk.yellow(text);
    });
    console.log('\n' + chalk.bold.cyan('📊  Raio-X por Área:'));
    console.log('  ' + chips.join(chalk.dim('  ·  ')));
  }

  // 6. Starters pendentes
  if (d.starters.pending) {
    console.log('\n' + chalk.bold.yellow('🧵  Starters pendentes de integração (.vibe/starters/):'));
    for (const step of d.starters.steps) {
      console.log(chalk.yellow(`  ⚠  ${step.name}: ${step.steps.length} passo(s)`));
    }
  }

  // 7. Próximo Passo Imediato OU Fluxo Contínuo
  const recEntry = d.lifecycle.find((e) => e.recommended);
  if (recEntry && d.aiPrompt) {
    console.log(
      '\n' +
      renderNextStepBox({
        nextStepTitle: recEntry.title,
        nextStepDescription: recEntry.why,
        chatPrompt: d.aiPrompt.split('\n')[0],
        cliCommand: recEntry.command,
        showStatusHint: false,
      }) +
      '\n'
    );
  } else if (!d.nextAction) {
    console.log('\n' + renderContinuousWorkflowBox() + '\n');
  }

  console.log(chalk.dim(`  ${colors.dim('Comandos rápidos:')} status · install · init · prd · plan --apply · pack · audit --site · doctor --fix\n`));
}

