import chalk from 'chalk';
import { statusAction } from '../actions/status.js';
import { STAGE_QUESTION } from '../actions/questions.js';
import { askQuestions, confirm } from '../ui/prompt.js';
import { banner } from '../utils/fs.js';
import { printJson, withStderrConsole } from '../utils/headless.js';
import {
  ACTION_LIFECYCLE,
  detectProjectState,
  inferStage,
  isActionDone,
  nextAction,
  type ActionId,
  type ProjectState,
  type Stage,
} from '../core/stage.js';
import { LIFECYCLE_META } from '../actions/status.js';
import { runLifecycleCommand } from './lifecycle.js';

interface StartOptions {
  yes?: boolean;
  json?: boolean;
}

function printMap(state: ProjectState, stage: Stage, recommended: ActionId | null): void {
  console.log(chalk.bold(`\n🗺️  O que o VibeHarness pode fazer por você ${chalk.dim(`(fase: ${stage})`)}\n`));
  for (const id of ACTION_LIFECYCLE) {
    const meta = LIFECYCLE_META[id];
    const done = isActionDone(state, id);
    const isNext = id === recommended;
    const icon = done ? chalk.green('✔') : isNext ? chalk.yellow('★') : chalk.dim('○');
    const label = done
      ? chalk.dim(`${meta.title} — concluído`)
      : isNext
        ? chalk.bold.yellow(`${meta.title} — recomendado agora`)
        : chalk.white(meta.title);
    console.log(`  ${icon} ${meta.emoji} ${label}`);
    console.log(chalk.dim(`       ${meta.why}`));
  }
}

/**
 * @deprecated since v0.7.0 — the guided terminal flow. Use `status` (the
 * non-interactive panel) or `install` + your AI client instead; this stays
 * for one release as a convenience for terminal-only users.
 */
export async function startCommand(opts: StartOptions): Promise<void> {
  console.log(
    chalk.yellow(
      '\n  ⚠  `start` is deprecated — use `vibe-harness status` for the panel, or\n     `vibe-harness install` to let your AI client drive the harness via MCP.\n'
    )
  );

  if (opts.json || opts.yes) {
    const result = await withStderrConsole(() => statusAction());
    if (opts.json) {
      printJson(result);
    } else {
      console.log(chalk.bold(`  Fase inferida: ${result.data.stage}`));
      console.log(chalk.bold(`  Próxima etapa: ${result.data.nextAction ?? '— ciclo completo'}`));
    }
    return;
  }

  banner('VibeHarness · START (guided)');

  let state = await detectProjectState();

  let stage: Stage;
  try {
    const answers = await askQuestions([STAGE_QUESTION]);
    stage = answers.stage as Stage;
  } catch {
    console.log(chalk.yellow('  Seleção pulada — fase inferida do estado do projeto.'));
    stage = inferStage(state);
  }

  let recommended = nextAction(state, stage);
  printMap(state, stage, recommended);

  if (!recommended) {
    console.log(chalk.bold.green('\n✅  Todas as etapas do ciclo estão concluídas. Re-execute qualquer comando quando precisar.\n'));
    return;
  }

  while (recommended) {
    const meta = LIFECYCLE_META[recommended];
    console.log(chalk.bold(`\n▶️  Próxima etapa: ${meta.title}`));
    console.log(chalk.dim(`   ${meta.command}\n`));

    const go = await confirm(`Executar "${meta.title}" agora? (${meta.command})`);
    if (!go) {
      console.log(chalk.dim(`\n  Execute depois com: ${meta.command}\n`));
      return;
    }

    await runLifecycleCommand(recommended);

    state = await detectProjectState();
    recommended = nextAction(state, stage);
    if (recommended) {
      console.log(chalk.bold.cyan('\n🗺️  Etapa concluída — olha o que ainda falta:\n'));
      printMap(state, stage, recommended);
    }
  }

  console.log(
    chalk.bold.green('\n✅  Ciclo completo — projeto pronto. Mantenha tudo em dia com `npx @vibeharness/cli doctor`.\n')
  );
}
