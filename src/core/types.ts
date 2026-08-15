/**
 * Triage classification for findings produced by heuristic scanners.
 * Lets the vibecoder (and the AI) separate real issues from known-benign
 * patterns before spending time on them. Findings are NEVER hidden by
 * triage — only re-classified and downgraded in severity.
 */
export type FindingTriage = 'real' | 'fixture' | 'env-reference' | 'ci-ephemeral' | 'static-message';

export interface Finding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  message: string;
  file?: string;
  /** Actionable guidance — shown in AUDIT_REPORT.md and can be pasted into AI chat */
  fix?: string;
  /** Heuristic triage class (v0.8+). Absent means unclassified. */
  triage?: FindingTriage;
}

export interface AuditSectionResult {
  score: number;
  maxScore: number;
  findings: Finding[];
}

export interface AuditReport {
  totalScore: number;
  maxScore: number;
  grade: string;
  sections: {
    security: AuditSectionResult;
    dependencies: AuditSectionResult;
    lgpd: AuditSectionResult;
    deadcode: AuditSectionResult;
    database: AuditSectionResult;
    infra: AuditSectionResult;
    accessibility: AuditSectionResult;
  };
}
