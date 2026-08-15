import chalk from 'chalk';
import { auditAction } from '../actions/audit.js';
import { confirm } from '../ui/prompt.js';
import { banner } from '../utils/fs.js';
import { printReport } from '../ui/tui.js';
import { printJson, withStderrConsole } from '../utils/headless.js';

interface AuditOptions {
  report?: boolean;
  site?: boolean;
  yes?: boolean;
  failUnder: string;
  json?: boolean;
}

export async function auditCommand(opts: AuditOptions): Promise<void> {
  if (opts.json) {
    const result = await withStderrConsole(() =>
      auditAction({ report: opts.report, site: opts.site, failUnder: parseInt(opts.failUnder, 10) || 0 })
    );
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  banner('VibeHarness · AUDIT');
  console.log(chalk.dim('  Running production-readiness audit…\n'));

  const wantSite =
    opts.site === true ||
    (opts.report &&
      !opts.yes &&
      await confirm('Also generate the visual report (.vibe/report/index.html)?'));

  const result = await auditAction({
    report: opts.report,
    site: wantSite,
    failUnder: parseInt(opts.failUnder, 10) || 0,
  });

  printReport(result.data.report);

  if (result.data.reportPath) {
    console.log(chalk.green(`  ✔  Report written to ${result.data.reportPath}`));
    console.log(chalk.dim('     Open it to find AI fix prompts for each finding.\n'));
  }
  if (result.data.sitePath) {
    console.log(chalk.green(`  ✔  Visual report written to ${result.data.sitePath}`));
    console.log(chalk.dim('     Open it in a browser — scorecard, findings and copyable AI fix prompts.\n'));
  }

  if (!result.data.passed) {
    console.log(
      chalk.red.bold(
        `  ✖  Score ${result.data.percentage}% is below the required threshold of ${result.data.threshold}%.`
      ) + '\n'
    );
    process.exitCode = 1;
    return;
  }

  console.log(chalk.bold.green('  ✅  Audit finished.\n'));
}
