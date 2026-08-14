import type { AuditReport, Finding } from '../core/types.js';

const SECTION_META: Record<string, { emoji: string; name: string }> = {
  security:      { emoji: '🛡️',  name: 'Security & Secrets' },
  dependencies:  { emoji: '📦', name: 'Dependency CVEs' },
  lgpd:          { emoji: '🇧🇷', name: 'LGPD Brazil Compliance' },
  deadcode:      { emoji: '🧹', name: 'Dead Code & Hygiene' },
  database:      { emoji: '🗄️',  name: 'Database Integrity' },
  infra:         { emoji: '🏗️',  name: 'Infra & Resilience' },
  accessibility: { emoji: '♿', name: 'Accessibility (WCAG)' },
};

function severityBadge(severity: Finding['severity']): string {
  return `\`${severity.toUpperCase()}\``;
}

function findingBlock(f: Finding, index: number): string {
  const loc = f.file ? `\n> 📁 File: \`${f.file}\`` : '';
  const fix = f.fix
    ? `\n\n**🤖 AI Fix Prompt:**\n> ${f.fix}`
    : '';
  return `#### Finding ${index + 1}: ${severityBadge(f.severity)} ${f.message}${loc}${fix}`;
}

export function buildMarkdownReport(report: AuditReport): string {
  const date = new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC';
  const pct = Math.round((report.totalScore / report.maxScore) * 100);

  const lines: string[] = [
    `# VibeHarness Audit Report`,
    ``,
    `> **Generated:** ${date}`,
    `> **Score:** ${report.totalScore}/${report.maxScore} (${pct}%) — Grade: **${report.grade}**`,
    ``,
    `---`,
    ``,
    `## Summary`,
    ``,
    `| Section | Score | Max | Status |`,
    `|---------|-------|-----|--------|`,
  ];

  for (const [key, result] of Object.entries(report.sections)) {
    const meta = SECTION_META[key] ?? { emoji: '•', name: key };
    const ratio = result.score / result.maxScore;
    const status = ratio === 1 ? '✅ Pass' : ratio >= 0.7 ? '🟡 Warning' : '🔴 Fail';
    lines.push(`| ${meta.emoji} ${meta.name} | ${result.score} | ${result.maxScore} | ${status} |`);
  }

  lines.push('', '---', '');

  // Only add detailed findings sections where there are actual findings
  let hasAnyFindings = false;
  for (const [key, result] of Object.entries(report.sections)) {
    if (result.findings.length === 0) continue;
    hasAnyFindings = true;

    const meta = SECTION_META[key] ?? { emoji: '•', name: key };
    lines.push(`## ${meta.emoji} ${meta.name}`, '');

    const criticals = result.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
    const others = result.findings.filter((f) => f.severity !== 'critical' && f.severity !== 'high');

    if (criticals.length > 0) {
      lines.push('### 🔴 Blocking Issues', '');
      criticals.forEach((f, i) => lines.push(findingBlock(f, i), ''));
    }
    if (others.length > 0) {
      lines.push('### 🟡 Warnings & Improvements', '');
      others.forEach((f, i) => lines.push(findingBlock(f, i), ''));
    }

    lines.push('---', '');
  }

  if (!hasAnyFindings) {
    lines.push('## 🎉 No findings — your project is looking great!', '');
  }

  // AI batch fix prompt
  const allBlockingFindings = Object.values(report.sections)
    .flatMap((s) => s.findings)
    .filter((f) => f.severity === 'critical' || f.severity === 'high');

  if (allBlockingFindings.length > 0) {
    lines.push(
      '---',
      '',
      '## 🤖 Batch AI Fix Prompt',
      '',
      'Copy and paste this into your AI assistant to fix all critical/high findings at once:',
      '',
      '```',
      'I have a production readiness audit report for my project. Please fix the following issues:',
      '',
      ...allBlockingFindings.map((f, i) =>
        `${i + 1}. [${f.severity.toUpperCase()}] ${f.message}${f.file ? ` (in ${f.file})` : ''}${f.fix ? '\n   Fix: ' + f.fix : ''}`
      ),
      '',
      'Please fix each issue in the most minimal and correct way possible, following security best practices.',
      '```',
      ''
    );
  }

  return lines.join('\n');
}
