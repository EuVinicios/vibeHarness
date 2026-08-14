import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/** Best-effort cross-platform check for a binary on PATH. Never throws. */
export async function commandExists(cmd: string): Promise<boolean> {
  const probe = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
  try {
    await execAsync(probe);
    return true;
  } catch {
    return false;
  }
}

export interface SecurityTool {
  name: string;
  bin: string;
  purpose: string;
  install: string;
}

/** Security scanners recommended by the curated registry (security category). */
export const SECURITY_TOOLS: SecurityTool[] = [
  {
    name: 'gitleaks',
    bin: 'gitleaks',
    purpose: 'secret detection (pre-commit & CI)',
    install: 'brew install gitleaks  ·  https://github.com/gitleaks/gitleaks',
  },
  {
    name: 'osv-scanner',
    bin: 'osv-scanner',
    purpose: 'multi-ecosystem CVE scanning (OSV.dev)',
    install: 'brew install osv-scanner  ·  https://github.com/google/osv-scanner',
  },
];

export interface ToolingStatus {
  tool: SecurityTool;
  installed: boolean;
}

export async function checkSecurityTooling(
  exists: (bin: string) => Promise<boolean> = commandExists
): Promise<ToolingStatus[]> {
  const results: ToolingStatus[] = [];
  for (const tool of SECURITY_TOOLS) {
    results.push({ tool, installed: await exists(tool.bin) });
  }
  return results;
}
