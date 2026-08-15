import type { AuditReport, AuditSectionResult } from '../core/types.js';
import { colors, icons } from './theme.js';
import { box } from './box.js';
import { severityBadge, scoreBar as scoreBarBadge, gradePill } from './badges.js';

function sectionIcon(result: AuditSectionResult): string {
  const ratio = result.maxScore > 0 ? result.score / result.maxScore : 0;
  if (ratio === 1) return '✅';
  if (ratio >= 0.7) return '🟡';
  return '🔴';
}

export function printSection(label: string, result: AuditSectionResult): void {
  const icon = sectionIcon(result);
  console.log(
    `  ${icon} ${colors.text(label.padEnd(22))} ${scoreBarBadge(result.score, result.maxScore)}  ${result.score}/${result.maxScore}`
  );
  for (const f of result.findings) {
    const loc = f.file ? colors.dim(` (${f.file})`) : '';
    console.log(`       ${severityBadge(f.severity)}  ${f.message}${loc}`);
  }
}

export function printReport(report: AuditReport): void {
  const pct = Math.round((report.totalScore / report.maxScore) * 100);

  console.log('\n' + box(
    [`${icons.chart}  Commercial Readiness Scorecard`],
    { title: 'AUDIT', color: colors.primary }
  ) + '\n');

  console.log(
    `  ${colors.text('OVERALL'.padEnd(24))} ${scoreBarBadge(report.totalScore, report.maxScore)}  ` +
    `${report.totalScore}/${report.maxScore} (${pct}%)  Grade: ${gradePill(report.grade)}\n`
  );

  printSection(`${icons.shield}  Security & Secrets`, report.sections.security);
  printSection(`${icons.package} Dependencies`, report.sections.dependencies);
  printSection(`${icons.lgpd} LGPD Compliance`, report.sections.lgpd);
  printSection(`${icons.broom} Dead Code`, report.sections.deadcode);
  printSection(`${icons.db} Database`, report.sections.database);
  printSection(`${icons.infra} Infra & Resilience`, report.sections.infra);
  printSection(`${icons.a11y} Accessibility`, report.sections.accessibility);

  console.log('');

  const allFindings = Object.values(report.sections)
    .flatMap((s) => s.findings)
    .filter((f) => f.severity === 'critical' || f.severity === 'high');

  if (allFindings.length > 0) {
    console.log(colors.danger(`  ⛔  ${allFindings.length} critical/high finding(s) require immediate attention.\n`));
  } else {
    console.log(colors.success(`  ✅  No critical or high-severity findings.\n`));
  }
}
