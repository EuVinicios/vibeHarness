import chalk from 'chalk';
import { installAction } from '../actions/install.js';
import { askQuestions } from '../ui/prompt.js';
import { banner } from '../utils/fs.js';
import { printJson, withStderrConsole } from '../utils/headless.js';

interface InstallOptions {
  client?: string;
  json?: boolean;
}

export async function installCommand(
  clientArg: string | undefined,
  opts: InstallOptions = {}
): Promise<void> {
  let client = clientArg ?? opts.client;
  if (opts.json) {
    const result = await withStderrConsole(() =>
      installAction({ client, requireChoice: !client })
    );
    printJson(result);
    return;
  }

  banner('VibeHarness · INSTALL');

  let first = await withStderrConsole(() => installAction({ client }));

  if (!first.ok && first.pendingQuestions) {
    console.log(chalk.bold(`\n🧭  ${first.summary}\n`));
    try {
      const answers = await askQuestions(first.pendingQuestions);
      client = answers.client as string;
    } catch {
      console.log(chalk.yellow('\n  Selection skipped — re-run `install <client-id>` when ready.\n'));
      return;
    }
    first = await withStderrConsole(() => installAction({ client }));
  }

  if (!first.ok && first.pendingQuestions) {
    console.log(chalk.yellow(`\n  ⚠  ${first.summary}\n`));
    return;
  }

  if (!first.ok) {
    console.log(chalk.red(`\n  ✖  ${first.summary}\n`));
    process.exitCode = 1;
    return;
  }

  console.log(chalk.bold.green(`\n✅  ${first.summary}`));
  for (const output of first.outputs ?? []) console.log(chalk.green(`  ✔  ${output}`));
  for (const note of first.notes ?? []) console.log(chalk.dim(`  ·  ${note}`));

  console.log(chalk.bold.cyan('\n  👉 Open your AI client and say: "run vibe status" — it drives the whole harness.\n'));
}
