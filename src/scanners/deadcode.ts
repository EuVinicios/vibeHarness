import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fg from 'fast-glob';
import { projectRoot } from '../utils/fs.js';
import { loadAuditIgnores } from '../utils/audit-ignore.js';
import type { Finding, AuditSectionResult } from '../core/types.js';
import { EXCLUDED_DIRS } from './security.js';

export async function scanDeadCode(): Promise<AuditSectionResult> {
  const findings: Finding[] = [];

  const auditIgnores = await loadAuditIgnores();
  const files = await fg('**/*.{js,ts,jsx,tsx}', {
    cwd: projectRoot(),
    ignore: [...EXCLUDED_DIRS.map((d) => `**/${d}/**`), ...auditIgnores],
    absolute: true,
    suppressErrors: true,
  });

  let consoleLogs = 0;
  let todoCount = 0;
  const largeFiles: string[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    if (lines.length > 400) largeFiles.push(file.replace(projectRoot() + '/', ''));
    consoleLogs += (content.match(/console\.log\(/g) ?? []).length;
    todoCount += (content.match(/\/\/\s*TODO/gi) ?? []).length;
  }

  // Check for package.json signals: CLI project detection + knip config
  const pkgPath = join(projectRoot(), 'package.json');
  let hasKnipConfig = false;
  let isCliProject = false;
  try {
    const raw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { bin?: unknown; knip?: unknown };
    isCliProject = typeof pkg.bin === 'string' || (typeof pkg.bin === 'object' && pkg.bin !== null);
    hasKnipConfig = 'knip' in pkg;
  } catch { /* no package.json (or invalid) — assume neither */ }

  if (consoleLogs > 10) {
    // In CLI projects stdout IS the user interface — console.log is idiomatic.
    if (isCliProject) {
      findings.push({
        severity: 'info',
        category: 'dead-code',
        message: `${consoleLogs} console.log() calls — OK for a CLI (stdout is the interface); consider a logger if this grows a server/UI`,
        fix: 'No action needed for CLIs. If you add a server or UI, replace console.log with a structured logger (e.g., pino) and enable `no-console` in ESLint for non-CLI entry points.',
      });
    } else {
      findings.push({
        severity: 'low',
        category: 'dead-code',
        message: `${consoleLogs} console.log() calls found in source files`,
        fix: 'Replace console.log with a structured logger (e.g., pino). Add `no-console` to your ESLint / Biome config to prevent new ones. Ask AI: "Remove all console.log calls from this file and replace with pino logger."',
      });
    }
  }
  if (todoCount > 20) {
    findings.push({
      severity: 'low',
      category: 'dead-code',
      message: `${todoCount} TODO comments — consider filing issues or deleting stale ones`,
      fix: 'Review TODO comments and convert them to GitHub Issues. Delete ones that are no longer relevant.',
    });
  }
  if (largeFiles.length > 0) {
    findings.push({
      severity: 'medium',
      category: 'dead-code',
      message: `${largeFiles.length} file(s) exceed 400 lines — potential God Object/Component`,
      file: largeFiles.slice(0, 3).join(', '),
      fix: 'Ask AI: "Refactor this file into smaller, single-responsibility modules. Each module should be < 200 lines." Split by feature, not by type.',
    });
  }
  if (!hasKnipConfig && files.length > 20) {
    findings.push({
      severity: 'info',
      category: 'dead-code',
      message: 'Knip (dead-code scanner) not configured — AI-generated code often leaves orphaned files',
      fix: 'Run `npx knip` to detect unused exports, files, and dependencies. Add it to your CI pipeline.',
    });
  }

  const maxScore = 10;
  const deductions = findings.reduce(
    (acc, f) => acc + (f.severity === 'medium' ? 4 : f.severity === 'low' ? 2 : 0),
    0
  );
  return { score: Math.max(0, maxScore - deductions), maxScore, findings };
}
