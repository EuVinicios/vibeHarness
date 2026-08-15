import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coerceThreatModel, coercePrdAnswers } from '../src/actions/questions.js';
import { prdAction } from '../src/actions/prd.js';
import { initAction } from '../src/actions/init.js';
import { rulesAction } from '../src/actions/rules.js';
import { statusAction } from '../src/actions/status.js';
import { readStartersStatus } from '../src/actions/starters.js';
import { installAction } from '../src/actions/install.js';
import { loadClientsCatalog } from '../src/registry/clients.js';

const CWD = process.cwd();
const roots: string[] = [];

function mkRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'vh-actions-'));
  roots.push(root);
  process.chdir(root);
  return root;
}

afterEach(() => {
  process.chdir(CWD);
});

afterAll(() => {
  for (const d of roots) rmSync(d, { recursive: true, force: true });
});

describe('question coercion (loose chat answers → typed)', () => {
  it('coerces strings/booleans into a threat model with safe fallbacks', () => {
    const tm = coerceThreatModel({ hasPayments: 'true', hasAuth: false, hasSensitiveData: 'yes' });
    expect(tm.hasPayments).toBe(true);
    expect(tm.hasAuth).toBe(false);
    // 'yes' is not a valid boolean → falls back to the safe default (true for auth scope)
    expect(tm.hasSensitiveData).toBe(false);
    expect(tm.country).toBe('brazil');
  });

  it('accepts arrays or CSV for PRD lists', () => {
    const a = coercePrdAnswers({ mainFeatures: ['a', 'b'], successMetrics: 'x, y' });
    expect(a.mainFeatures).toEqual(['a', 'b']);
    expect(a.successMetrics).toEqual(['x', 'y']);
  });
});

describe('prdAction (headless)', () => {
  it('returns pendingQuestions without writing when requireAnswers and no answers', async () => {
    mkRoot();
    const result = await prdAction({ requireAnswers: true });
    expect(result.ok).toBe(false);
    expect(result.pendingQuestions?.map((q) => q.id)).toEqual([
      'problem',
      'targetUsers',
      'mainFeatures',
      'successMetrics',
      'outOfScope',
    ]);
    expect(existsSync('.vibe/PRD.md')).toBe(false);
  });

  it('writes the PRD with chat answers and skips existing unless forced', async () => {
    const root = mkRoot();
    const first = await prdAction({ answers: { problem: 'p1', targetUsers: 'u', mainFeatures: 'f1,f2' } });
    expect(first.ok).toBe(true);
    expect(first.outputs).toContain('.vibe/PRD.md');
    expect(readFileSync(join(root, '.vibe', 'PRD.md'), 'utf8')).toContain('p1');

    const second = await prdAction({ answers: { problem: 'p2' } });
    expect(second.data.written).toBe(false);
    expect(readFileSync(join(root, '.vibe', 'PRD.md'), 'utf8')).toContain('p1');

    const forced = await prdAction({ answers: { problem: 'p3' }, force: true });
    expect(forced.data.written).toBe(true);
    expect(readFileSync(join(root, '.vibe', 'PRD.md'), 'utf8')).toContain('p3');
  });
});

describe('initAction (headless)', () => {
  it('refuses defaults when requireAnswers and returns the threat-model questions', async () => {
    mkRoot();
    const result = await initAction({ requireAnswers: true });
    expect(result.ok).toBe(false);
    expect(result.pendingQuestions?.map((q) => q.id)).toEqual([
      'hasPayments',
      'hasAuth',
      'hasSensitiveData',
      'country',
    ]);
    expect(existsSync('.vibe/SPEC.md')).toBe(false);
  });

  it('writes the full foundation with answers', async () => {
    const root = mkRoot();
    const result = await initAction({
      answers: { hasPayments: true, hasAuth: true, hasSensitiveData: true, country: 'brazil' },
    });
    expect(result.ok).toBe(true);
    expect(result.outputs).toContain('.vibe/SPEC.md');
    expect(result.outputs).toContain('.vibe/threat-model.json');
    expect(result.outputs).toContain('CLAUDE.md');
    expect(result.outputs).toContain('AGENTS.md');
    const tm = JSON.parse(readFileSync(join(root, '.vibe', 'threat-model.json'), 'utf8'));
    expect(tm.hasPayments).toBe(true);
    expect(tm.country).toBe('brazil');
  });
});

describe('rulesAction (unified write policy)', () => {
  it('skips existing files by default and overwrites with force', async () => {
    const root = mkRoot();
    const first = await rulesAction({ tools: 'claude' });
    expect(first.outputs).toContain('CLAUDE.md');

    const before = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
    const second = await rulesAction({ tools: 'claude' });
    expect(second.outputs ?? []).not.toContain('CLAUDE.md');
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toBe(before);

    const forced = await rulesAction({ tools: 'claude', force: true });
    expect(forced.outputs).toContain('CLAUDE.md');
  });
});

describe('statusAction', () => {
  it('reports lifecycle, stage and pending starter wiring', async () => {
    const root = mkRoot();
    await initAction({ answers: { hasAuth: true, country: 'brazil' } });
    await prdAction({ answers: { problem: 'x', targetUsers: 'y', mainFeatures: 'z' } });

    // Simulate starters pending wiring (as plan --apply would leave them)
    mkdirSync(join(root, '.vibe', 'starters'), { recursive: true });
    writeFileSync(
      join(root, '.vibe', 'starters', 'README.md'),
      [
        '# Starters — integration guide',
        '## Zod (`colinhacks/zod`)',
        '',
        '- [ ] Copy the schema starter',
        '- [ ] Validate req.body',
        '',
        '<!-- vibe-harness: wiring complete -->',
        '',
      ].join('\n'),
      'utf8'
    );

    const status = await statusAction();
    expect(status.ok).toBe(true);
    expect(status.data.starters.pending).toBe(true);
    expect(status.data.starters.steps[0].steps).toEqual([
      'Copy the schema starter',
      'Validate req.body',
    ]);
    // Starters wiring outranks the next lifecycle action in the AI prompt
    expect(status.data.aiPrompt).toContain('.vibe/starters/');
    expect(status.data.nextAction).toBeTruthy();
  });

  it('marks wiring done when every checkbox is checked', async () => {
    const root = mkRoot();
    mkdirSync(join(root, '.vibe', 'starters'), { recursive: true });
    writeFileSync(
      join(root, '.vibe', 'starters', 'README.md'),
      '## Zod (`colinhacks/zod`)\n\n- [x] done\n\n<!-- vibe-harness: wiring complete -->\n',
      'utf8'
    );
    const status = await readStartersStatus();
    expect(status.pending).toBe(false);
  });
});

describe('installAction (MCP config merge)', () => {
  it('merges the server without clobbering existing config (all formats)', async () => {
    const catalog = await loadClientsCatalog();
    expect(catalog).not.toBeNull();
    expect(catalog!.clients.length).toBeGreaterThanOrEqual(7);

    // mcp-servers format (cursor)
    const root = mkRoot();
    mkdirSync(join(root, '.cursor'), { recursive: true });
    writeFileSync(
      join(root, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { existing: { command: 'foo' } } }),
      'utf8'
    );
    const cursor = await installAction({ client: 'cursor' });
    expect(cursor.ok).toBe(true);
    const cursorJson = JSON.parse(readFileSync(join(root, '.cursor', 'mcp.json'), 'utf8'));
    expect(cursorJson.mcpServers.existing).toEqual({ command: 'foo' });
    expect(cursorJson.mcpServers['vibe-harness'].command).toBe('npx');

    // opencode format
    const ocRoot = mkRoot();
    writeFileSync(join(ocRoot, 'opencode.json'), JSON.stringify({ theme: 'dark' }), 'utf8');
    const oc = await installAction({ client: 'opencode' });
    expect(oc.ok).toBe(true);
    const ocJson = JSON.parse(readFileSync(join(ocRoot, 'opencode.json'), 'utf8'));
    expect(ocJson.theme).toBe('dark');
    expect(ocJson.mcp['vibe-harness'].type).toBe('local');
    expect(ocJson.mcp['vibe-harness'].command[0]).toBe('npx');
    expect(existsSync(join(ocRoot, 'AGENTS.md'))).toBe(true);

    // vscode-servers format
    const vsRoot = mkRoot();
    const vs = await installAction({ client: 'vscode-copilot' });
    expect(vs.ok).toBe(true);
    const vsJson = JSON.parse(readFileSync(join(vsRoot, '.vscode', 'mcp.json'), 'utf8'));
    expect(vsJson.servers['vibe-harness'].type).toBe('stdio');
  });

  it('rejects unknown clients and asks for a choice in headless mode', async () => {
    mkRoot();
    const unknown = await installAction({ client: 'not-a-client' });
    expect(unknown.ok).toBe(false);
    expect(unknown.summary).toContain('Unknown client');

    const headless = await installAction({ requireChoice: true });
    expect(headless.ok).toBe(false);
    expect(headless.pendingQuestions?.[0].options?.length).toBeGreaterThanOrEqual(7);
  });

  it('installs multiple clients at once (comma-separated and "all")', async () => {
    const root = mkRoot();
    const multi = await installAction({ client: 'cursor,opencode' });
    expect(multi.ok).toBe(true);
    expect(multi.data.installed).toEqual(['cursor', 'opencode']);
    expect(existsSync(join(root, '.cursor', 'mcp.json'))).toBe(true);
    expect(existsSync(join(root, 'opencode.json'))).toBe(true);
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(true);

    const all = await installAction({ client: 'all' });
    expect(all.ok).toBe(true);
    expect(all.data.installed.length).toBeGreaterThanOrEqual(7);
    expect(existsSync(join(root, '.mcp.json'))).toBe(true);
    expect(existsSync(join(root, '.vscode', 'mcp.json'))).toBe(true);
  });

  it('offers "all" as first option when multiple clients are detected', async () => {
    const root = mkRoot();
    mkdirSync(join(root, '.cursor'), { recursive: true });
    writeFileSync(join(root, '.cursor', 'mcp.json'), '{}', 'utf8');
    writeFileSync(join(root, 'CLAUDE.md'), '', 'utf8');
    writeFileSync(join(root, 'AGENTS.md'), '', 'utf8');
    const result = await installAction({});
    expect(result.ok).toBe(false);
    expect(result.pendingQuestions?.[0].options?.[0].value).toBe('all');
    expect(result.data.detected.sort()).toEqual(['claude-code', 'cursor', 'opencode'].sort());
  });
});
