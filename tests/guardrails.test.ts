import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, rm, writeFile as write } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  writeGuardrailsManifest,
  verifyGuardrails,
  HOOK_MARKER,
} from '../src/utils/guardrails.js';

const execFileAsync = promisify(execFile);
const originalCwd = process.cwd;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'vibe-guard-'));
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = originalCwd;
  await rm(tmpDir, { recursive: true, force: true });
});

async function plantGuardrails(): Promise<void> {
  await mkdir(join(tmpDir, '.vibe'), { recursive: true });
  await write(join(tmpDir, '.vibe', 'CONSTITUTION.md'), '# Laws\n1. No secrets in code\n', 'utf8');
  await write(join(tmpDir, '.gitignore'), 'node_modules\n.env\n.env*.local\n', 'utf8');
  await mkdir(join(tmpDir, '.git', 'hooks'), { recursive: true });
  await write(
    join(tmpDir, '.git', 'hooks', 'pre-commit'),
    `#!/bin/sh\n# --- ${HOOK_MARKER} ---\necho ok\n`,
    'utf8'
  );
  await writeGuardrailsManifest(tmpDir);
}

describe('verifyGuardrails (v0.9 anti-tamper)', () => {
  it('returns an info finding (no crash) when the manifest is absent', async () => {
    const findings = await verifyGuardrails();
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
    expect(findings[0].message).toContain('guardrails.json');
  });

  it('returns no findings when the state matches the baseline', async () => {
    await plantGuardrails();
    expect(await verifyGuardrails()).toEqual([]);
  });

  it('flags .env removed from .gitignore as critical', async () => {
    await plantGuardrails();
    await write(join(tmpDir, '.gitignore'), 'node_modules\n', 'utf8');
    const findings = await verifyGuardrails();
    const f = findings.find((x) => x.category === 'guardrails');
    expect(f?.severity).toBe('critical');
    expect(f?.message).toContain('.env');
  });

  it('flags a deleted CONSTITUTION.md as critical', async () => {
    await plantGuardrails();
    await rm(join(tmpDir, '.vibe', 'CONSTITUTION.md'));
    const findings = await verifyGuardrails();
    expect(findings.find((x) => x.severity === 'critical')?.message).toContain('CONSTITUTION');
  });

  it('flags an edited CONSTITUTION.md as medium (drift, not deletion)', async () => {
    await plantGuardrails();
    await write(join(tmpDir, '.vibe', 'CONSTITUTION.md'), '# weakened\n', 'utf8');
    const findings = await verifyGuardrails();
    expect(findings.find((x) => x.severity === 'medium')?.message).toContain('CONSTITUTION');
  });

  it('flags the pre-commit hook losing the secret scanner block as high', async () => {
    await plantGuardrails();
    await write(join(tmpDir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho fast\n', 'utf8');
    const findings = await verifyGuardrails();
    expect(findings.find((x) => x.severity === 'high')?.message).toContain('pre-commit');
  });

  it('flags a core.hooksPath redirect as high (classic --no-verify substitute)', async () => {
    await execFileAsync('git', ['init', '-q'], { cwd: tmpDir });
    await execFileAsync('git', ['config', 'core.hooksPath', '/tmp/empty-hooks'], { cwd: tmpDir });
    const findings = await verifyGuardrails();
    expect(findings.find((x) => x.severity === 'high')?.message).toContain('core.hooksPath');
  });

  it('a corrupted manifest yields a medium finding instead of throwing', async () => {
    await mkdir(join(tmpDir, '.vibe'), { recursive: true });
    await write(join(tmpDir, '.vibe', 'guardrails.json'), '{not json', 'utf8');
    const findings = await verifyGuardrails();
    expect(findings.find((x) => x.severity === 'medium')?.message).toContain('corrupted');
  });
});

describe('initAction baseline integration', () => {
  it('init writes .vibe/guardrails.json and the audit verifies clean', async () => {
    const { initAction } = await import('../src/actions/init.js');
    const { verifyGuardrails: verify } = await import('../src/utils/guardrails.js');
    const { existsSync } = await import('node:fs');
    await initAction({ answers: { hasAuth: true, country: 'brazil' } });
    expect(existsSync(join(tmpDir, '.vibe', 'guardrails.json'))).toBe(true);
    expect(await verify()).toEqual([]);
  });
});
