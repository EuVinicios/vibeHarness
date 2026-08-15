import chalk from 'chalk';
import ora from 'ora';
import { banner } from '../utils/fs.js';
import { packContext } from '../packager/index.js';
import { box } from '../ui/box.js';
import { colors, icons } from '../ui/theme.js';

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

  console.log('\n' + box([
    `${colors.success(icons.check)} Output:            ${result.outputPath}`,
    `${colors.success(icons.check)} Files included:    ${result.fileCount}`,
    `${colors.success(icons.check)} Binary skipped:    ${result.skippedBinary}`,
    `${result.redactedCount > 0 ? colors.warn('⚠') : colors.success(icons.check)} Secrets redacted:  ${result.redactedCount}`,
    `${colors.success(icons.check)} Context size:      ${sizeKB} KB`,
  ], { title: '📦 Pack Summary', color: chalk.cyanBright }));
  console.log('');

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
