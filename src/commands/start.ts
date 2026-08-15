import chalk from 'chalk';
import ora from 'ora';
import { banner } from '../utils/fs.js';
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
import { ACTION_META, runAction } from '../conductor/actions.js';
import { conductorLoop } from '../conductor/engine.js';
import { stdinIsInteractive } from '../conductor/keys.js';

interface StartOptions {
  yes?: boolean;
}

async function askStage(): Promise<Stage> {
  const { prompt } = await import('enquirer');
  const { stage } = await prompt<{ stage: Stage }>({
    type: 'select',
    name: 'stage',
    message: '🧭  Uma pergunta: em que fase seu projeto está hoje?',
    choices: [
      { name: 'idea', message: '💡 Idea — ainda nem comecei a codar' },
      { name: 'starting', message: '🏗️  Starting — projeto (quase) vazio' },
      { name: 'building', message: '💻 Building — codando ativamente' },
      { name: 'shipping', message: '🚀 Shipping — revisão final antes de produzir' },
      { name: 'production', message: '🛠️  Production — já no ar, modo manutenção' },
    ],
  } as Parameters<typeof prompt>[0]);
  return stage;
}

function printMap(state: ProjectState, stage: Stage, recommended: ActionId | null): void {
  console.log(
    chalk.bold(`\n🗺️  O que o VibeHarness pode fazer por você ${chalk.dim(`(fase: ${stage})`)}\n`)
  );
  for (const id of ACTION_LIFECYCLE) {
    const meta = ACTION_META[id];
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

async function confirmNext(meta: (typeof ACTION_META)[ActionId]): Promise<boolean> {
  const { prompt } = await import('enquirer');
  const { go } = await prompt<{ go: boolean }>({
    type: 'confirm',
    name: 'go',
    message: `Executar "${meta.title}" agora? (${meta.command})`,
    initial: true,
  } as Parameters<typeof prompt>[0]);
  return go;
}

export async function startCommand(opts: StartOptions): Promise<void> {
  // Interactive Conductor loop (Qwen/Antigravity-inspired cockpit) — the
  // default experience on a real TTY. Falls back to the guided flow on
  // --yes or when stdin is not interactive (CI, pipes).
  if (!opts.yes && stdinIsInteractive()) {
    const handled = await conductorLoop();
    if (handled) return;
  }

  banner('VibeHarness · START');

  const spinner = ora('Detectando o estado do projeto…').start();
  let state = await detectProjectState();
  spinner.succeed('Estado do projeto detectado');

  let stage: Stage;
  if (opts.yes) {
    stage = inferStage(state);
    console.log(chalk.dim(`  --yes: fase inferida do estado do projeto (${stage}).`));
  } else {
    try {
      stage = await askStage();
    } catch {
      console.log(chalk.yellow('  Seleção pulada — fase inferida do estado do projeto.'));
      stage = inferStage(state);
    }
  }

  let recommended = nextAction(state, stage);
  printMap(state, stage, recommended);

  if (!recommended) {
    console.log(chalk.bold.green('\n✅  Todas as etapas do ciclo estão concluídas. Re-execute qualquer comando quando precisar.\n'));
    return;
  }

  while (recommended) {
    const meta = ACTION_META[recommended];
    console.log(chalk.bold(`\n▶️  Próxima etapa: ${meta.title}`));
    console.log(chalk.dim(`   ${meta.command}\n`));

    let go = true;
    if (!opts.yes) {
      try {
        go = await confirmNext(meta);
      } catch {
        console.log(chalk.yellow('  Prompt pulado — encerrando o fluxo guiado.'));
        go = false;
      }
    }
    if (!go) {
      console.log(chalk.dim(`\n  Execute depois com: ${meta.command}\n`));
      return;
    }

    await runAction(recommended, opts.yes === true);

    state = await detectProjectState();
    recommended = nextAction(state, stage);
    if (recommended) {
      console.log(chalk.bold.cyan(`\n🗺️  Etapa concluída — olha o que ainda falta:\n`));
      printMap(state, stage, recommended);
    }
  }

  console.log(
    chalk.bold.green('\n✅  Ciclo completo — projeto pronto. Mantenha tudo em dia com `npx @vibeharness/cli doctor`.\n')
  );
}
