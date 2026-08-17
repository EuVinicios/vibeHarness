import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot, ensureDir } from '../utils/fs.js';
import { runAudit } from '../core/orchestrator.js';
import { buildMarkdownReport, buildBatchFixPrompt } from '../ui/report.js';
import { buildHtmlReport } from '../ui/site.js';
import { writeScoreCache } from '../core/score-cache.js';
import type { ActionResult } from './types.js';
import type { AuditReport, Finding } from '../core/types.js';

export interface AuditActionOptions {
  report?: boolean;
  site?: boolean;
  failUnder?: number;
  /**
   * Explicit escape hatch for the zero-criticals gate. When false (default),
   * any critical finding fails the audit even if the score is above the
   * threshold. Kept as a flag so CI exceptions are auditable via git history.
   */
  allowCritical?: boolean;
}

export interface AuditActionData {
  report: AuditReport;
  percentage: number;
  threshold: number;
  passed: boolean;
  /** True when the audit failed solely because of the zero-criticals gate. */
  criticalBlocked: boolean;
  allowCritical: boolean;
  criticalFindings: number;
  highFindings: number;
  fixPrompt: string;
  reportPath?: string;
  sitePath?: string;
}

/**
 * Headless audit: runs the 7 scanners, optionally writes AUDIT_REPORT.md and
 * the visual HTML site, refreshes the score cache and returns findings plus
 * a sanitized batch fix prompt for AI-driven correction.
 */
export async function auditAction(opts: AuditActionOptions = {}): Promise<ActionResult<AuditActionData>> {
  const report = await runAudit();
  const percentage = Math.round((report.totalScore / report.maxScore) * 100);
  const threshold = opts.failUnder ?? 70;

  const findings: Finding[] = Object.values(report.sections).flatMap((s) => s.findings);
  const counts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
  };
  const fixTargets = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  const fixPrompt = fixTargets.length > 0 ? buildBatchFixPrompt(report) : '';

  const outputs: string[] = [];
  const root = projectRoot();

  const sectionScores = Object.fromEntries(
    Object.entries(report.sections).map(([key, s]) => [key, { score: s.score, max: s.maxScore }])
  );
  await writeScoreCache(report.totalScore, report.maxScore, report.grade, root, sectionScores);

  const data: AuditActionData = {
    report,
    percentage,
    threshold,
    passed: percentage >= threshold && (opts.allowCritical === true || counts.critical === 0),
    criticalBlocked: opts.allowCritical !== true && counts.critical > 0,
    allowCritical: opts.allowCritical === true,
    criticalFindings: counts.critical,
    highFindings: counts.high,
    fixPrompt,
  };

  if (opts.report) {
    const reportPath = join(root, 'AUDIT_REPORT.md');
    await writeFile(reportPath, buildMarkdownReport(report), 'utf8');
    data.reportPath = 'AUDIT_REPORT.md';
    outputs.push('AUDIT_REPORT.md');
  }

  if (opts.site) {
    const sitePath = join(root, '.vibe', 'report', 'index.html');
    await ensureDir(join(root, '.vibe', 'report'));
    await writeFile(sitePath, buildHtmlReport(report), 'utf8');
    data.sitePath = '.vibe/report/index.html';
    outputs.push('.vibe/report/index.html');
  }

  return {
    ok: data.passed,
    action: 'audit',
    summary:
      `Score ${report.totalScore}/${report.maxScore} (${percentage}%) — grade ${report.grade}` +
      (counts.critical + counts.high > 0 ? `, ${counts.critical} critical / ${counts.high} high findings` : '') +
      (data.criticalBlocked ? ` — blocked by ${counts.critical} critical finding(s) (zero-criticals gate)` : '') +
      (!data.passed && !data.criticalBlocked ? ` — below threshold ${threshold}` : ''),
    data,
    outputs,
    nextStep: data.passed ? 'doctor' : 'audit',
    notes: [
      ...(fixTargets.length > 0
        ? ['Fix prompt included — apply it with your AI, then run the audit again']
        : []),
      ...(data.criticalBlocked
        ? ['Critical findings fail the audit regardless of score. Fix them, or use --allow-critical as an explicit, auditable exception.']
        : []),
    ],
  };
}
