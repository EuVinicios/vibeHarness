import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../utils/fs.js';
import type { Finding, AuditSectionResult } from '../core/types.js';

export async function scanDatabase(): Promise<AuditSectionResult> {
  const findings: Finding[] = [];

  const hasMigrations =
    existsSync(join(projectRoot(), 'migrations')) ||
    existsSync(join(projectRoot(), 'db', 'migrations')) ||
    existsSync(join(projectRoot(), 'prisma', 'migrations')) ||
    existsSync(join(projectRoot(), 'drizzle'));

  const hasPrisma = existsSync(join(projectRoot(), 'prisma', 'schema.prisma'));
  const hasDrizzle = existsSync(join(projectRoot(), 'drizzle.config.ts'));

  if (!hasMigrations && (hasPrisma || hasDrizzle)) {
    findings.push({
      severity: 'high',
      category: 'database',
      message: 'Database ORM detected but no versioned migration directory found',
      fix: 'Use migrations instead of `db push`: run `prisma migrate dev --name init` or `drizzle-kit generate`. Migrations keep schema history auditable and reversible.',
    });
  }

  const pkgPath = join(projectRoot(), 'package.json');
  if (existsSync(pkgPath)) {
    const raw = await readFile(pkgPath, 'utf8');
    if (raw.includes('db push') || raw.includes('prisma db push')) {
      findings.push({
        severity: 'high',
        category: 'database',
        message: '`prisma db push` found in package.json scripts — unsafe for production',
        fix: 'Replace `prisma db push` with `prisma migrate deploy` in your CI/CD pipeline. `db push` bypasses migration history and can cause irreversible data loss.',
      });
    }
  }

  const maxScore = 10;
  const deductions = findings.reduce(
    (acc, f) => acc + (f.severity === 'high' ? 8 : 4),
    0
  );
  return { score: Math.max(0, maxScore - deductions), maxScore, findings };
}
