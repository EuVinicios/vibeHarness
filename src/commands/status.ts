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
    `${icons.shield} VibeHarness · Status — ${chalk.bold(d.project)}`,
    `Fase: ${stageChip(d.stage)}${d.score ? `  ·  Score: ${scoreChip(d.score.score, d.score.max)} ${gradeChip(d.score.grade)}` : chalk.dim('  ·  Score: — (run audit)')}`,
  ];

  console.log('\n' + box(header, { color: chalk.cyan }) + '\n');

  console.log(chalk.bold('🗺️  Ciclo de vida:'));
  for (const entry of d.lifecycle) {
    const icon = entry.done ? chalk.green('✔') : entry.recommended ? chalk.yellow('★') : chalk.dim('○');
    const label = entry.done
      ? chalk.dim(`${entry.title} — concluído`)
      : entry.recommended
        ? chalk.bold.yellow(`${entry.title} — recomendado agora`)
        : chalk.white(entry.title);
    console.log(`  ${icon} ${entry.emoji} ${label}`);
    if (entry.recommended) console.log(chalk.dim(`       ${entry.why}`));
  }

  if (d.score?.sections) {
    const meta: Record<string, { emoji: string; name: string }> = {
      security: { emoji: '🛡️', name: 'Security' },
      dependencies: { emoji: '📦', name: 'Deps' },
      lgpd: { emoji: '🇧🇷', name: 'LGPD' },
      deadcode: { emoji: '🧹', name: 'Hygiene' },
      database: { emoji: '🗄️', name: 'DB' },
      infra: { emoji: '🏗️', name: 'Infra' },
      accessibility: { emoji: '♿', name: 'A11y' },
    };
    const chips = Object.entries(d.score.sections).map(([key, s]) => {
      const m = meta[key] ?? { emoji: '•', name: key };
      const full = s.score >= s.max;
      const low = s.max > 0 && s.score / s.max < 0.5;
      const text = `${m.emoji} ${s.score}/${s.max}`;
      return full ? chalk.green(text) : low ? chalk.red(text) : chalk.yellow(text);
    });
    console.log('\n' + chalk.bold('📊  Auditoria por seção:'));
    console.log('  ' + chips.join(chalk.dim(' · ')));
  }

  if (d.starters.pending) {
    console.log('\n' + chalk.bold('🧵  Starters pendentes de integração (.vibe/starters/):'));
    for (const step of d.starters.steps) {
      console.log(chalk.yellow(`  ⚠  ${step.name}: ${step.steps.length} passo(s)`));
    }
  }

  if (d.aiPrompt) {
    console.log('\n' + chalk.bold('📋  Cole isto na sua IA para o próximo passo:'));
    console.log(
      box(d.aiPrompt.split('\n').slice(0, 8).map((l) => chalk.dim(l)), {
        title: 'Prompt pronto',
        color: chalk.cyanBright,
      })
    );
    const total = d.aiPrompt.split('\n').length;
    if (total > 8) console.log(chalk.dim(`  (+${total - 8} linhas — prompt completo em modo JSON: vibe-harness status --json)`));
    console.log(
      chalk.dim('  Melhor ainda: rode `npx @vibeharness/cli install` e sua IA faz tudo via MCP.\n')
    );
  } else {
    console.log(
      chalk.bold.green('\n✅  Ciclo completo — projeto pronto. Mantenha em dia com `npx @vibeharness/cli doctor`.\n')
    );
  }

  console.log(chalk.dim(`  ${colors.dim('Comandos:')} status --json · install · init · prd · plan --apply · pack · audit --report · doctor --fix\n`));
}
