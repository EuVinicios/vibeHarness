import chalk from 'chalk';
import ora from 'ora';
import { banner } from '../utils/fs.js';
import { packContext } from '../packager/index.js';

interface PackOptions {
  output?: string;
  includeTests?: boolean;
  exclude?: string;
}

export async function packCommand(opts: PackOptions): Promise<void> {
  banner('VibeHarness · PACK');

  console.log(chalk.dim(
    '  Packaging project context for AI — removing secrets and noise…\n'
  ));

  const spinner = ora('Scanning and sanitising files…').start();

  const result = await packContext({
    outputPath: opts.output,
    includeTests: opts.includeTests,
    extraExclude: opts.exclude
      ? opts.exclude.split(',').map((s) => s.trim())
      : undefined,
  });

  spinner.succeed('Context packed');

  const sizeKB = Math.round(result.totalBytes / 1024);

  console.log('\n' + chalk.bold('  📦  Pack Summary\n'));
  console.log(`  ${chalk.green('✔')} Output:            ${result.outputPath}`);
  console.log(`  ${chalk.green('✔')} Files included:    ${result.fileCount}`);
  console.log(`  ${chalk.green('✔')} Binary skipped:    ${result.skippedBinary}`);
  console.log(
    `  ${result.redactedCount > 0 ? chalk.yellow('⚠') : chalk.green('✔')} Secrets redacted:  ${result.redactedCount}`
  );
  console.log(`  ${chalk.green('✔')} Context size:      ${sizeKB} KB`);

  if (result.redactedCount > 0) {
    console.log(
      '\n' + chalk.yellow(
        `  ⚠  ${result.redactedCount} line(s) were redacted to prevent secret leakage.\n` +
        '     Review .vibe/CONTEXT.md before sharing.'
      )
    );
  }

  console.log(
    '\n' + chalk.bold.green('  ✅  Context ready!') +
    chalk.dim(`\n  Paste ${result.outputPath} into your AI assistant or attach as context.\n`)
  );
}
