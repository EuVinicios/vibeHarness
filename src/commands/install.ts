import chalk from 'chalk';
import { installAction } from '../actions/install.js';
import { askQuestions } from '../ui/prompt.js';
import { banner } from '../utils/fs.js';
import { box } from '../ui/box.js';
import { printJson, withStderrConsole } from '../utils/headless.js';

interface InstallOptions {
  client?: string;
  force?: boolean;
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
      installAction({ client, force: opts.force, requireChoice: !client })
    );
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  banner('VibeHarness · INSTALL');

  let first = await withStderrConsole(() => installAction({ client, force: opts.force }));

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
    first = await withStderrConsole(() => installAction({ client, force: opts.force }));
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

  const installedList = first.data.installed.length > 0
    ? first.data.installed.join(', ')
    : 'AI Client';

  const cardLines: string[] = [
    chalk.bold.cyan('🛡️  VIBEHARNESS · PROJETO PROTEGIDO E INTEGRADO À IA'),
    '',
    chalk.white('O VibeHarness é o seu cinto de segurança: ele guia sua IA para'),
    chalk.white('criar código seguro, sem vazamento de senhas, com LGPD e pronto'),
    chalk.white('para produção, sem você precisar ser especialista em DevOps.'),
    '',
    `${chalk.bold.green('🔌 Assistente(s) Conectado(s):')} ${chalk.bold.white(installedList)}`,
    ...((first.outputs ?? []).map((o) => `   ${chalk.green('✔')} ${chalk.dim(o)}`)),
    '',
    chalk.bold.yellow('⚡ Capacidades ativadas para sua IA (via MCP):'),
    `   ${chalk.cyan('• vibe_status')}  ${chalk.dim('→ Painel de saúde e ciclo de vida do projeto')}`,
    `   ${chalk.cyan('• vibe_audit')}   ${chalk.dim('→ Raio-X completo (segurança, LGPD, senhas expostas)')}`,
    `   ${chalk.cyan('• vibe_init')}    ${chalk.dim('→ Bloqueio de senhas (pre-commit) e constituição')}`,
    `   ${chalk.cyan('• vibe_prd')}     ${chalk.dim('→ Especificação de produto e regras de negócio')}`,
    `   ${chalk.cyan('• vibe_plan')}    ${chalk.dim('→ Arquitetura e tecnologias recomendadas')}`,
    `   ${chalk.cyan('• vibe_doctor')}  ${chalk.dim('→ Manutenção e atualização de dependências')}`,
    '',
    chalk.bold.magenta('🚀 COMO USAR AGORA (Escolha uma opção):'),
    '',
    ` ${chalk.bold.cyan('💬 OPÇÃO 1 (No chat da sua IA — Recomendado):')}`,
    `    ${chalk.dim('Envie para o seu assistente no chat:')}`,
    `    ${chalk.bold.yellow('"Chat, rode o vibe_status e a auditoria do VibeHarness (vibe_audit)')}`,
    `     ${chalk.bold.yellow('e me mostre o score de segurança do projeto."')}`,
    '',
    ` ${chalk.bold.cyan('💻 OPÇÃO 2 (Aqui no terminal):')}`,
    `    ${chalk.dim('• Ver painel do projeto:')}        ${chalk.white('npx @vibeharness/cli status')}`,
    `    ${chalk.dim('• Gerar relatório visual HTML:')}  ${chalk.white('npx @vibeharness/cli audit --site')}`,
    `    ${chalk.dim('• Ativar proteção inicial:')}      ${chalk.white('npx @vibeharness/cli init')}`,
  ];

  console.log('\n' + box(cardLines, { color: chalk.cyan, padding: 1 }) + '\n');
}
