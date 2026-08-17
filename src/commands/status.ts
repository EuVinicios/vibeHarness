import chalk from 'chalk';
import { statusAction } from '../actions/status.js';
import { banner } from '../utils/fs.js';
import { box } from '../ui/box.js';
import { colors, icons, gradeChip, scoreChip, stageChip } from '../ui/theme.js';
import { printJson, withStderrConsole } from '../utils/headless.js';

interface StatusOptions {
  json?: boolean;
}

/**
 * The non-interactive cockpit (v0.7): renders where the project stands and
 * hands the user a ready-to-paste prompt for their AI client. The terminal
 * is optional — the same data drives the MCP vibe_status tool.
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

  const header: string[] = [
    `${icons.shield} VibeHarness · Painel de Saúde — ${chalk.bold.white(d.project)}`,
    `Fase: ${stageChip(d.stage)}${d.score ? `  ·  Score de Segurança: ${scoreChip(d.score.score, d.score.max)} ${gradeChip(d.score.grade)}` : chalk.dim('  ·  Score: — (não auditado ainda)')}`,
  ];

  console.log('\n' + box(header, { color: chalk.cyan, padding: 1 }) + '\n');

  console.log(chalk.bold.cyan('🗺️  Jornada do seu Aplicativo (Ciclo de Vida):'));
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

  if (d.starters.pending) {
    console.log('\n' + chalk.bold.yellow('🧵  Starters pendentes de integração (.vibe/starters/):'));
    for (const step of d.starters.steps) {
      console.log(chalk.yellow(`  ⚠  ${step.name}: ${step.steps.length} passo(s)`));
    }
  }

  const recEntry = d.lifecycle.find((e) => e.recommended);
  if (recEntry && d.aiPrompt) {
    const actionLines: string[] = [
      `${chalk.bold.yellow('🎯 Ação:')} ${chalk.bold.white(recEntry.title)}`,
      `${chalk.dim('   ' + recEntry.why)}`,
      '',
      `${chalk.bold.cyan('💬 No chat da sua IA (Copie e Envie):')}`,
      `   ${chalk.bold.yellow('"' + d.aiPrompt.split('\n')[0] + '"')}`,
      '',
      `${chalk.bold.cyan('💻 No Terminal (Comando Direto):')}`,
      `   ${chalk.white(recEntry.command)}`,
    ];

    console.log('\n' + box(actionLines, { title: '👉 O QUE FAZER AGORA', color: chalk.yellow, padding: 1 }) + '\n');
  } else if (!d.nextAction) {
    console.log(
      chalk.bold.green('\n✅  Ciclo completo — seu projeto está pronto para produção e protegido!\n')
    );
  }

  console.log(chalk.dim(`  ${colors.dim('Comandos úteis:')} status · install · init · prd · plan --apply · pack · audit --site · doctor --fix\n`));
}
