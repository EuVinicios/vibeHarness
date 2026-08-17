import chalk from 'chalk';
import { packAction } from '../actions/pack.js';
import { banner } from '../utils/fs.js';
import { box } from '../ui/box.js';
import { renderNextStepBox } from '../ui/next-step.js';
import { colors, icons } from '../ui/theme.js';
import { printJson, withStderrConsole } from '../utils/headless.js';

interface PackOptions {
  output?: string;
  includeTests?: boolean;
  exclude?: string;
  json?: boolean;
}

export async function packCommand(opts: PackOptions): Promise<void> {
  if (opts.json) {
    const result = await withStderrConsole(() =>
      packAction({ output: opts.output, includeTests: opts.includeTests, exclude: opts.exclude })
    );
    printJson(result);
    return;
  }

  banner('VibeHarness · PACK');

  console.log(chalk.dim('  Packaging project context for AI — removing secrets and noise…\n'));

  const result = await packAction({
    output: opts.output,
    includeTests: opts.includeTests,
    exclude: opts.exclude,
  });
  const d = result.data;
  const sizeKB = Math.round(d.totalBytes / 1024);

  console.log('\n' + box([
    `${colors.success(icons.check)} Output:            ${d.outputPath}`,
    `${colors.success(icons.check)} Files included:    ${d.fileCount}`,
    `${colors.success(icons.check)} Binary skipped:    ${d.skippedBinary}`,
    `${d.redactedCount > 0 ? colors.warn('⚠') : colors.success(icons.check)} Secrets redacted:  ${d.redactedCount}`,
    `${colors.success(icons.check)} Context size:      ${sizeKB} KB`,
  ], { title: '📦 Pack Summary', color: chalk.cyanBright }));
  console.log('');

  for (const note of result.notes ?? []) console.log(chalk.yellow(`  ⚠  ${note}\n`));

  console.log(chalk.bold.green('  ✅  Contexto gerado com sucesso!\n'));
  console.log(
    renderNextStepBox({
      currentActionSummary: `Contexto do projeto empacotado em ${d.outputPath} (${d.fileCount} arquivos, ${sizeKB} KB)`,
      nextStepTitle: '5. Auditoria de Prontidão & Segurança',
      nextStepDescription: 'Avalia vulnerabilidades, vazamento de senhas, conformidade LGPD e gera relatório visual em HTML.',
      chatPrompt: 'Chat, execute a auditoria de prontidão e segurança do VibeHarness (vibe_audit com site: true).',
      cliCommand: 'npx @vibeharness/cli audit --site',
    }) + '\n'
  );
}
