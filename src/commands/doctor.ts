import chalk from 'chalk';
import { doctorAction } from '../actions/doctor.js';
import { banner } from '../utils/fs.js';
import { printJson, withStderrConsole } from '../utils/headless.js';

interface DoctorOptions {
  fix?: boolean;
  json?: boolean;
}

const STATUS_ICON: Record<string, string> = {
  ok: chalk.green('✔'),
  warn: chalk.yellow('⚠'),
  fail: chalk.red('✖'),
  info: chalk.dim('·'),
};

export async function doctorCommand(opts: DoctorOptions): Promise<void> {
  if (opts.json) {
    const result = await withStderrConsole(() => doctorAction({ fix: opts.fix }));
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  banner('VibeHarness · DOCTOR');

  const result = await doctorAction({ fix: opts.fix });
  let lastGroup = '';

  for (const check of result.data.checks) {
    if (check.group !== lastGroup) {
      lastGroup = check.group;
      const groupTitles: Record<string, string> = {
        runtime: 'Runtime',
        deps: 'Dependencies',
        automation: 'Automation',
        platform: 'GitHub platform security (via gh CLI)',
        tooling: 'Security tooling (recommended)',
      };
      console.log('\n' + chalk.bold(`  ${groupTitles[check.group]}:`));
    }
    const icon = STATUS_ICON[check.status] ?? chalk.dim('·');
    const hint = check.hint ? chalk.dim(` → ${check.hint}`) : '';
    console.log(`    ${icon}  ${check.label}${check.detail ? chalk.dim(` — ${check.detail}`) : ''}${hint}`);
  }

  console.log('');
  if (result.data.issues === 0) {
    console.log(chalk.bold.green('✅  Doctor found no maintenance issues.'));
  } else {
    console.log(chalk.bold.yellow(`🩺  Doctor found ${result.data.issues} maintenance issue(s) — see above.`));
  }
  console.log('');
}
