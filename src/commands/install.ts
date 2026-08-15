import chalk from 'chalk';
import { installAction } from '../actions/install.js';
import { askQuestions } from '../ui/prompt.js';
import { banner } from '../utils/fs.js';
import { printJson, withStderrConsole } from '../utils/headless.js';

interface InstallOptions {
  client?: string;
  json?: boolean;
}

function printChoices(detected: string[], available: { id: string; name: string; status: string }[]): void {
  if (detected.length > 1) {
    console.log(chalk.bold('  Detected in this project: ') + detected.join(', '));
    console.log(chalk.dim(`  Install into all of them:  npx @vibeharness/cli install all`));
  }
  console.log(chalk.bold('  Available clients:'));
  for (const a of available) {
    console.log(`    ${a.id.padEnd(16)} ${a.name}${a.status === 'beta' ? chalk.yellow(' (beta)') : ''}`);
  }
  console.log(chalk.dim('  Multiple at once:  npx @vibeharness/cli install cursor,opencode\n'));
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
      console.log(chalk.yellow('\n  Selection skipped — pick one (or more) explicitly:\n'));
      printChoices(first.data.detected, first.data.available);
      return;
    }
    first = await withStderrConsole(() => installAction({ client }));
  }

  if (!first.ok && first.pendingQuestions) {
    console.log(chalk.yellow(`\n  ⚠  ${first.summary}\n`));
    printChoices(first.data.detected, first.data.available);
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

  console.log(chalk.bold.cyan('\n  👉 Open your AI client(s) and say: "run vibe status" — it drives the whole harness.\n'));
}
