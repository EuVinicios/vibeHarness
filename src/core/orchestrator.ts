import { scanSecrets, scanDependencies } from '../scanners/security.js';
import { scanLGPD } from '../scanners/lgpd.js';
import { scanDeadCode } from '../scanners/deadcode.js';
import { scanDatabase } from '../scanners/database.js';
import { scanInfra } from '../scanners/infra.js';
import { scanAccessibility } from '../scanners/accessibility.js';
import type { AuditReport, AuditSectionResult } from './types.js';

function scoreToGrade(score: number, max: number): string {
  const pct = (score / max) * 100;
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

export async function runAudit(): Promise<AuditReport> {
  const [security, dependencies, lgpd, deadcode, database, infra, accessibility] =
    await Promise.all([
      scanSecrets(),
      scanDependencies(),
      scanLGPD(),
      scanDeadCode(),
      scanDatabase(),
      scanInfra(),
      scanAccessibility(),
    ]);

  const sections = { security, dependencies, lgpd, deadcode, database, infra, accessibility };
  const totalScore = Object.values(sections).reduce((acc: number, s: AuditSectionResult) => acc + s.score, 0);
  const maxScore = Object.values(sections).reduce((acc: number, s: AuditSectionResult) => acc + s.maxScore, 0);

  return {
    totalScore,
    maxScore,
    grade: scoreToGrade(totalScore, maxScore),
    sections,
  };
}
