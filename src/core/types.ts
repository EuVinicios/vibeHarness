export interface Finding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  message: string;
  file?: string;
  /** Actionable guidance — shown in AUDIT_REPORT.md and can be pasted into AI chat */
  fix?: string;
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
