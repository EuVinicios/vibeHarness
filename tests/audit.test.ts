import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { runAudit } from '../src/core/orchestrator.js';
import { auditAction } from '../src/actions/audit.js';

// Override cwd so the audit scans a controlled tmp directory
const originalCwd = process.cwd;

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'vibe-test-'));
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = originalCwd;
  await rm(tmpDir, { recursive: true, force: true });
});

describe('runAudit', () => {
  it('returns a report with totalScore and grade', async () => {
    const report = await runAudit();
    expect(typeof report.totalScore).toBe('number');
    expect(typeof report.grade).toBe('string');
    expect(['A', 'B', 'C', 'D', 'F']).toContain(report.grade);
  });

  it('score is within 0..maxScore', async () => {
    const report = await runAudit();
    expect(report.totalScore).toBeGreaterThanOrEqual(0);
    expect(report.totalScore).toBeLessThanOrEqual(report.maxScore);
  });

  it('detects hardcoded secret in source file', async () => {
    // Build the pattern at runtime so the literal never appears in source
    const prefix = 'sk' + '_' + 'live' + '_';
    const fakeKey = prefix + 'abcdefghijklmnopqrstuvwxyz';
    await writeFile(
      join(tmpDir, 'index.ts'),
      `const key = "${fakeKey}";\n`,
      'utf8'
    );
    const report = await runAudit();
    const secrets = report.sections.security.findings.filter(
      (f) => f.category === 'secrets' && f.severity === 'critical'
    );
    expect(secrets.length).toBeGreaterThan(0);
  });

  it('does not flag clean files as secrets', async () => {
    await writeFile(
      join(tmpDir, 'index.ts'),
      `export const greeting = "hello world";\n`,
      'utf8'
    );
    const report = await runAudit();
    const criticalSecrets = report.sections.security.findings.filter(
      (f) => f.severity === 'critical'
    );
    expect(criticalSecrets).toHaveLength(0);
  });
});

describe('auditAction zero-criticals gate', () => {
  async function plantVendorSecret(): Promise<void> {
    // Built at runtime so the literal never appears in this source file
    const fakeKey = 'sk' + '_' + 'live' + '_' + 'abcdefghijklmnopqrstuvwxyz';
    await writeFile(join(tmpDir, 'index.ts'), `const key = "${fakeKey}";\n`, 'utf8');
  }

  it('fails the audit with criticals even when the score is above the threshold', async () => {
    await plantVendorSecret();
    const result = await auditAction({ failUnder: 70 });
    // One vendor secret: security 10/30 → total 80/100 — above the threshold…
    expect(result.data.percentage).toBeGreaterThanOrEqual(70);
    // …but the zero-criticals gate must block the pass.
    expect(result.data.criticalFindings).toBeGreaterThan(0);
    expect(result.data.criticalBlocked).toBe(true);
    expect(result.data.passed).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('zero-criticals gate');
  });

  it('allowCritical is the explicit, auditable escape hatch', async () => {
    await plantVendorSecret();
    const result = await auditAction({ failUnder: 70, allowCritical: true });
    expect(result.data.criticalFindings).toBeGreaterThan(0);
    expect(result.data.criticalBlocked).toBe(false);
    expect(result.data.allowCritical).toBe(true);
    expect(result.data.passed).toBe(true);
    expect(result.ok).toBe(true);
  });

  it('passes without criticals and without the escape hatch', async () => {
    await writeFile(join(tmpDir, 'index.ts'), 'export const ok = true;\n', 'utf8');
    const result = await auditAction({ failUnder: 70 });
    expect(result.data.criticalFindings).toBe(0);
    expect(result.data.criticalBlocked).toBe(false);
    expect(result.data.passed).toBe(true);
    expect(result.ok).toBe(true);
  });
});
