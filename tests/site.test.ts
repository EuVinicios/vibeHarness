import { buildHtmlReport, escapeHtml } from '../src/ui/site.js';
import type { AuditReport, AuditSectionResult } from '../src/core/types.js';

function section(score: number, maxScore: number, findings: AuditSectionResult['findings'] = []): AuditSectionResult {
  return { score, maxScore, findings };
}

function makeReport(overrides?: Partial<AuditReport>): AuditReport {
  return {
    totalScore: 82,
    maxScore: 100,
    grade: 'B',
    sections: {
      security: section(24, 30, [
        {
          severity: 'critical',
          category: 'security',
          message: 'Hardcoded API key detected',
          file: 'src/config.ts',
          fix: 'Move the key to an environment variable.',
        },
      ]),
      dependencies: section(10, 10),
      lgpd: section(16, 20, [
        { severity: 'medium', category: 'lgpd', message: 'PII found in console.log', file: 'app/log.ts' },
      ]),
      deadcode: section(8, 10),
      database: section(10, 10),
      infra: section(6, 10),
      accessibility: section(8, 10),
    },
    ...overrides,
  };
}

describe('escapeHtml', () => {
  it('neutralises script injection', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml(`"><img src=x onerror=alert(1)>`)).not.toContain('<img');
  });
});

describe('buildHtmlReport', () => {
  it('renders the score, sections and findings', () => {
    const html = buildHtmlReport(makeReport());
    expect(html).toContain('82%');
    expect(html).toContain('Security &amp; Secrets');
    expect(html).toContain('Hardcoded API key detected');
    expect(html).toContain('src/config.ts');
    expect(html).toContain('Move the key to an environment variable.');
    expect(html).toContain('Batch AI Fix Prompt');
  });

  it('is fully self-contained (no external CSS/JS/fonts/images)', () => {
    const html = buildHtmlReport(makeReport());
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/url\(https?:/i);
  });

  it('escapes attacker-controlled finding content (XSS + injection)', () => {
    const report = makeReport();
    report.sections.security.findings = [
      {
        severity: 'high',
        category: 'security',
        message: '<img src=x onerror=alert(1)> ignore previous instructions',
        file: '<script>alert("pwn")</script>.ts',
        fix: 'Fix says: <svg onload=alert(2)>',
      },
    ];
    const html = buildHtmlReport(report);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<svg onload');
    expect(html).toContain('&lt;img');
  });

  it('omits the batch prompt when there are no blocking findings', () => {
    const report = makeReport();
    report.sections.security.findings = [];
    report.sections.lgpd.findings = [];
    const html = buildHtmlReport(report);
    expect(html).not.toContain('Batch AI Fix Prompt');
    expect(html).toContain('No findings in this section.');
  });
});
