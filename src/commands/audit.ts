import chalk from 'chalk';
import ora from 'ora';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { banner, projectRoot } from '../utils/fs.js';
import { runAudit } from '../core/orchestrator.js';
import { printReport } from '../ui/tui.js';
import { buildMarkdownReport } from '../ui/report.js';
import type { AuditReport } from '../core/types.js';

interface AuditOptions {
  report?: boolean;
  failUnder: string;
}

export async function auditCommand(opts: AuditOptions): Promise<void> {
  banner('VibeHarness · AUDIT');

  const spinner = ora('Running production-readiness audit…').start();

  let report: AuditReport;
  try {
    report = await runAudit();
  } catch (err) {
    spinner.fail('Audit failed with an unexpected error');
    console.error(err);
    process.exit(1);
  }

  spinner.succeed('Audit complete');

  printReport(report);

  if (opts.report) {
    const md = buildMarkdownReport(report);
    const reportPath = join(projectRoot(), 'AUDIT_REPORT.md');
    await writeFile(reportPath, md, 'utf8');
    console.log(chalk.green(`  ✔  Report written to AUDIT_REPORT.md`));
    console.log(
      chalk.dim(
        '     Open it to find AI fix prompts for each finding.\n'
      )
    );
  }

  const pct = Math.round((report.totalScore / report.maxScore) * 100);
  const threshold = parseInt(opts.failUnder, 10);
  if (!isNaN(threshold) && pct < threshold) {
    console.log(
      chalk.red.bold(
        `  ✖  Score ${pct}% is below the required threshold of ${threshold}%.`
      ) + '\n'
    );
    process.exit(1);
  }

  console.log(chalk.bold.green('  ✅  Audit finished.\n'));
}
