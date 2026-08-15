import chalk from 'chalk';
import { rulesAction } from '../actions/rules.js';
import { banner } from '../utils/fs.js';
import { printJson, withStderrConsole } from '../utils/headless.js';

interface RulesOptions {
  tools: string;
  force?: boolean;
  json?: boolean;
}

export async function rulesCommand(opts: RulesOptions): Promise<void> {
  if (opts.json) {
    const result = await withStderrConsole(() => rulesAction({ tools: opts.tools, force: opts.force }));
    printJson(result);
    return;
  }

  banner('VibeHarness · RULES GENERATOR');
  console.log('\n' + chalk.bold('✍️  Writing rule files…\n'));

  const result = await rulesAction({ tools: opts.tools, force: opts.force });

  for (const output of result.outputs ?? []) {
    console.log(chalk.green(`  ✔  Written: ${output}`));
  }
  if ((result.outputs ?? []).length === 0) {
    console.log(chalk.yellow('  ⚠  All rule files already exist — use --force to overwrite.'));
  }

  console.log('\n' + chalk.bold.green('✅  AI rule files generated!'));
  console.log(
    chalk.dim(
      `  Tools targeted: ${result.data.tools.join(', ')}\n  Next: run \`npx @vibeharness/cli audit\` before shipping.\n`
    )
  );
}
