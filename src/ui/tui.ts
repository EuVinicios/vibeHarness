import chalk from 'chalk';
import type { AuditReport, AuditSectionResult } from '../core/types.js';

export function severityIcon(severity: string): string {
  switch (severity) {
    case 'critical': return chalk.bgRed.white(' CRIT ');
    case 'high':     return chalk.red('  HIGH');
    case 'medium':   return chalk.yellow('  WARN');
    case 'low':      return chalk.blue('   LOW');
    default:         return chalk.dim('  INFO');
  }
}

export function scoreBar(score: number, max: number, width = 20): string {
  const pct = Math.round((score / max) * width);
  const filled = '█'.repeat(Math.max(0, pct));
  const empty = '░'.repeat(Math.max(0, width - pct));
  const ratio = score / max;
  const color = ratio >= 0.7 ? chalk.green : ratio >= 0.5 ? chalk.yellow : chalk.red;
  return color(filled + empty);
}

export function gradeColor(grade: string): string {
  if (grade === 'A') return chalk.bold.green(grade);
  if (grade === 'B') return chalk.bold.cyan(grade);
  if (grade === 'C') return chalk.bold.yellow(grade);
  if (grade === 'D') return chalk.bold.red(grade);
  return chalk.bold.bgRed.white(grade);
}

function sectionIcon(result: AuditSectionResult): string {
  const ratio = result.score / result.maxScore;
  if (ratio === 1) return '✅';
  if (ratio >= 0.7) return '🟡';
  return '🔴';
}

export function printSection(label: string, result: AuditSectionResult): void {
  const icon = sectionIcon(result);
  console.log(
    `  ${icon} ${chalk.bold(label.padEnd(22))} ${scoreBar(result.score, result.maxScore)}  ${result.score}/${result.maxScore}`
  );
  for (const f of result.findings) {
    const loc = f.file ? chalk.dim(` (${f.file})`) : '';
    console.log(`       ${severityIcon(f.severity)}  ${f.message}${loc}`);
  }
}

export function printReport(report: AuditReport): void {
  const pct = Math.round((report.totalScore / report.maxScore) * 100);

  console.log('\n' + chalk.bold('  📊  Commercial Readiness Scorecard\n'));
  console.log(
    `  ${chalk.bold('OVERALL'.padEnd(24))} ${scoreBar(report.totalScore, report.maxScore)}  ` +
    `${report.totalScore}/${report.maxScore} (${pct}%)  Grade: ${gradeColor(report.grade)}\n`
  );

  printSection('🛡️  Security & Secrets', report.sections.security);
  printSection('📦 Dependencies', report.sections.dependencies);
  printSection('🇧🇷 LGPD Compliance', report.sections.lgpd);
  printSection('🧹 Dead Code', report.sections.deadcode);
  printSection('🗄️  Database', report.sections.database);
  printSection('🏗️  Infra & Resilience', report.sections.infra);
  printSection('♿ Accessibility', report.sections.accessibility);

  console.log('');

  const allFindings = Object.values(report.sections)
    .flatMap((s) => s.findings)
    .filter((f) => f.severity === 'critical' || f.severity === 'high');

  if (allFindings.length > 0) {
    console.log(chalk.bold.red(`  ⛔  ${allFindings.length} critical/high finding(s) require immediate attention.\n`));
  } else {
    console.log(chalk.bold.green('  ✅  No critical or high-severity findings.\n'));
  }
}
