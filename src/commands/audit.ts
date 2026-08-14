import chalk from 'chalk';
import ora from 'ora';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { banner, projectRoot, ensureDir } from '../utils/fs.js';
import { runAudit } from '../core/orchestrator.js';
import { printReport } from '../ui/tui.js';
import { buildMarkdownReport } from '../ui/report.js';
import { buildHtmlReport } from '../ui/site.js';
import type { AuditReport } from '../core/types.js';

interface AuditOptions {
  report?: boolean;
  site?: boolean;
  yes?: boolean;
  failUnder: string;
}

async function writeHtmlSite(report: AuditReport): Promise<void> {
  const sitePath = join(projectRoot(), '.vibe', 'report', 'index.html');
  await ensureDir(join(projectRoot(), '.vibe', 'report'));
  await writeFile(sitePath, buildHtmlReport(report), 'utf8');
  console.log(chalk.green(`  ✔  Visual report written to .vibe/report/index.html`));
  console.log(chalk.dim('     Open it in a browser — scorecard, findings and copyable AI fix prompts.\n'));
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

  if (opts.site) {
    await writeHtmlSite(report);
  } else if (opts.report && !opts.yes) {
    // Visual report is opt-in with explicit consent — it writes a file the
    // user may want to version as project documentation.
    let go: boolean;
    try {
      const { prompt } = await import('enquirer');
      const answer = await prompt<{ go: boolean }>({
        type: 'confirm',
        name: 'go',
        message: 'Also generate the visual report (.vibe/report/index.html)?',
        initial: true,
      } as Parameters<typeof prompt>[0]);
      go = answer.go;
    } catch {
      go = false;
    }
    if (go) {
      await writeHtmlSite(report);
    } else {
      console.log(chalk.dim('  ↷  Visual report skipped — generate it later with `audit --site`.\n'));
    }
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
