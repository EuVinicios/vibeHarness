import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installAction } from '../src/actions/install.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgVersion = (
  JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { version: string }
).version;

function makeTmp(packageName: string): string {
  // Keep the tmp prefix filesystem-safe: scoped package names contain '/'.
  const dir = mkdtempSync(join(tmpdir(), 'vh-install-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: packageName, version: '0.0.0' }));
  return dir;
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

describe('installAction — MCP server registration', () => {
  let prevCwd: string;
  let prevCi: string | undefined;
  const dirs: string[] = [];

  beforeAll(() => {
    prevCwd = process.cwd();
    prevCi = process.env.CI;
    // Keep the suite deterministic: never hit the network for the prewarm.
    process.env.CI = '1';
  });

  afterAll(() => {
    process.chdir(prevCwd);
    if (prevCi === undefined) delete process.env.CI;
    else process.env.CI = prevCi;
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it('self-install registers the local dist build (npx cannot resolve the project own bin)', async () => {
    const dir = makeTmp('@vibeharness/cli');
    dirs.push(dir);
    process.chdir(dir);

    const result = await installAction({ client: 'qwen' });
    expect(result.ok).toBe(true);

    const settings = readJson(join(dir, '.qwen', 'settings.json'));
    const servers = settings.mcpServers as Record<string, { command: string; args: string[] }>;
    expect(servers['vibe-harness']).toEqual({
      command: 'node',
      args: ['./dist/cli.js', 'mcp'],
    });
    expect(result.notes?.some((n) => n.includes('self-install detected'))).toBe(true);
  }, 20_000);

  it('regular projects pin the CLI version in the npx invocation (no floating latest)', async () => {
    const dir = makeTmp('my-app');
    dirs.push(dir);
    process.chdir(dir);

    const result = await installAction({ client: 'qwen' });
    expect(result.ok).toBe(true);

    const settings = readJson(join(dir, '.qwen', 'settings.json'));
    const servers = settings.mcpServers as Record<string, { command: string; args: string[] }>;
    expect(servers['vibe-harness']).toEqual({
      command: 'npx',
      args: ['-y', `@vibeharness/cli@${pkgVersion}`, 'mcp'],
    });
  }, 20_000);

  it('antigravity config lands in .agents/mcp_config.json (the path Antigravity IDE reads)', async () => {
    const dir = makeTmp('agy-app');
    dirs.push(dir);
    mkdirSync(join(dir, '.agents'), { recursive: true });
    process.chdir(dir);

    const result = await installAction({ client: 'antigravity' });
    expect(result.ok).toBe(true);

    const config = readJson(join(dir, '.agents', 'mcp_config.json'));
    const servers = config.mcpServers as Record<string, { command: string }>;
    expect(servers['vibe-harness']).toBeDefined();
  }, 20_000);

  it('never clobbers other MCP servers already registered by the client', async () => {
    const dir = makeTmp('busy-app');
    dirs.push(dir);
    mkdirSync(join(dir, '.qwen'), { recursive: true });
    writeFileSync(
      join(dir, '.qwen', 'settings.json'),
      JSON.stringify({ mcpServers: { other: { command: 'other-server' } } })
    );
    process.chdir(dir);

    await installAction({ client: 'qwen' });

    const settings = readJson(join(dir, '.qwen', 'settings.json'));
    const servers = settings.mcpServers as Record<string, unknown>;
    expect(servers['other']).toEqual({ command: 'other-server' });
    expect(servers['vibe-harness']).toBeDefined();
  }, 20_000);
});

describe('installAction — user-file safety (v0.8.2)', () => {
  let prevCwd: string;
  let prevCi: string | undefined;
  const dirs: string[] = [];

  beforeAll(() => {
    prevCwd = process.cwd();
    prevCi = process.env.CI;
    process.env.CI = '1';
  });

  afterAll(() => {
    process.chdir(prevCwd);
    if (prevCi === undefined) delete process.env.CI;
    else process.env.CI = prevCi;
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it('preserves an existing user rules file unless force is set', async () => {
    const dir = makeTmp('rules-app');
    dirs.push(dir);
    writeFileSync(join(dir, 'CLAUDE.md'), '# MY OWN RULES — do not touch\n');
    process.chdir(dir);

    const skip = await installAction({ client: 'claude-code' });
    expect(skip.ok).toBe(true);
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('# MY OWN RULES — do not touch\n');
    expect(skip.notes?.some((n) => n.includes('CLAUDE.md') && n.includes('kept unchanged'))).toBe(true);

    const forced = await installAction({ client: 'claude-code', force: true });
    expect(forced.ok).toBe(true);
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).not.toContain('MY OWN RULES');
  }, 30_000);

  it('fails loud and writes NOTHING when the existing MCP config is invalid JSON', async () => {
    const dir = makeTmp('broken-app');
    dirs.push(dir);
    mkdirSync(join(dir, '.qwen'), { recursive: true });
    const broken = '{ "mcpServers": oops';
    writeFileSync(join(dir, '.qwen', 'settings.json'), broken);
    process.chdir(dir);

    const result = await installAction({ client: 'qwen' });
    expect(result.ok).toBe(false);
    expect(result.data.errors.some((e) => e.includes('not valid JSON'))).toBe(true);
    expect(readFileSync(join(dir, '.qwen', 'settings.json'), 'utf8')).toBe(broken);
  }, 20_000);

  it('rejects a non-object JSON root (array) instead of corrupting it', async () => {
    const dir = makeTmp('array-app');
    dirs.push(dir);
    mkdirSync(join(dir, '.qwen'), { recursive: true });
    writeFileSync(join(dir, '.qwen', 'settings.json'), '[1, 2, 3]');
    process.chdir(dir);

    const result = await installAction({ client: 'qwen' });
    expect(result.ok).toBe(false);
    expect(result.data.errors.some((e) => e.includes('not a JSON object'))).toBe(true);
    expect(readFileSync(join(dir, '.qwen', 'settings.json'), 'utf8')).toBe('[1, 2, 3]');
  }, 20_000);

  it('backs up the original config before merging', async () => {
    const dir = makeTmp('backup-app');
    dirs.push(dir);
    mkdirSync(join(dir, '.qwen'), { recursive: true });
    const original = JSON.stringify({ mcpServers: { other: { command: 'x' } } });
    writeFileSync(join(dir, '.qwen', 'settings.json'), original);
    process.chdir(dir);

    const result = await installAction({ client: 'qwen' });
    expect(result.ok).toBe(true);
    expect(readFileSync(join(dir, '.qwen', 'settings.json.vibe-bak'), 'utf8')).toBe(original);
  }, 20_000);

  it('refuses to write rules through a symlink (target outside stays intact)', async () => {
    const dir = makeTmp('link-app');
    dirs.push(dir);
    writeFileSync(join(dir, 'outside.md'), 'precious content\n');
    symlinkSync(join(dir, 'outside.md'), join(dir, 'CLAUDE.md'));
    process.chdir(dir);

    const result = await installAction({ client: 'claude-code', force: true });
    expect(result.ok).toBe(true); // the rest of the install still succeeds
    expect(readFileSync(join(dir, 'outside.md'), 'utf8')).toBe('precious content\n');
    expect(result.notes?.some((n) => n.includes('CLAUDE.md') && n.includes('kept unchanged'))).toBe(true);
  }, 30_000);

  it('merges into opencode.jsonc when that is the config the project already uses', async () => {
    const dir = makeTmp('jsonc-app');
    dirs.push(dir);
    writeFileSync(join(dir, 'opencode.jsonc'), '{\n  // my config\n  "mcp": { "other": {} }\n}\n');
    process.chdir(dir);

    // JSONC with comments is not parseable as strict JSON — must fail loud,
    // not be silently replaced.
    const loud = await installAction({ client: 'opencode' });
    expect(loud.ok).toBe(false);
    expect(loud.data.errors.some((e) => e.includes('not valid JSON'))).toBe(true);

    // With valid JSON inside .jsonc the merge targets the existing file and
    // does NOT create a shadowing opencode.json.
    writeFileSync(join(dir, 'opencode.jsonc'), JSON.stringify({ mcp: { other: {} } }));
    const merged = await installAction({ client: 'opencode' });
    expect(merged.ok).toBe(true);
    const config = readJson(join(dir, 'opencode.jsonc'));
    expect((config.mcp as Record<string, unknown>)['vibe-harness']).toBeDefined();
    expect((config.mcp as Record<string, unknown>)['other']).toEqual({});
    expect(existsSync(join(dir, 'opencode.json'))).toBe(false);
  }, 30_000);
});

describe('installAction — symlink + isolation hardening (v0.8.3)', () => {
  let prevCwd: string;
  let prevCi: string | undefined;
  let prevVibeHome: string | undefined;
  const dirs: string[] = [];

  beforeAll(() => {
    prevCwd = process.cwd();
    prevCi = process.env.CI;
    prevVibeHome = process.env.VIBE_HOME;
    process.env.CI = '1';
  });

  afterAll(() => {
    process.chdir(prevCwd);
    if (prevCi === undefined) delete process.env.CI;
    else process.env.CI = prevCi;
    if (prevVibeHome === undefined) delete process.env.VIBE_HOME;
    else process.env.VIBE_HOME = prevVibeHome;
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it('reports a HARD FAILURE (never "merged") when the MCP config itself is a symlink', async () => {
    const dir = makeTmp('link-mcp-app');
    dirs.push(dir);
    writeFileSync(join(dir, 'mcp-target.json'), JSON.stringify({ mcpServers: { keep: { command: 'x' } } }));
    symlinkSync(join(dir, 'mcp-target.json'), join(dir, '.mcp.json'));
    process.chdir(dir);

    const result = await installAction({ client: 'claude-code', force: true });
    // The pre-0.8.3 behaviour returned ok:true + "MCP merged" while writing
    // nothing — a silent false success. Now the client fails loud.
    expect(result.ok).toBe(false);
    expect(result.data.errors.some((e) => e.includes('refused to write MCP config'))).toBe(true);
    expect(readFileSync(join(dir, 'mcp-target.json'), 'utf8')).not.toContain('vibe-harness');
  }, 30_000);

  it('refuses to write through a symlinked ANCESTOR directory (repo-planted escape)', async () => {
    const dir = makeTmp('link-dir-app');
    dirs.push(dir);
    const outside = join(dir, 'outside-escape');
    mkdirSync(outside);
    symlinkSync(outside, join(dir, '.cursor'));
    process.chdir(dir);

    const result = await installAction({ client: 'cursor', force: true });
    expect(result.ok).toBe(false);
    expect(result.data.errors.some((e) => e.includes('symlinked directory'))).toBe(true);
    // Nothing may land outside the project root.
    expect(existsSync(join(outside, 'mcp.json'))).toBe(false);
    expect(existsSync(join(outside, 'rules'))).toBe(false);
  }, 30_000);

  it('writes the Windsurf global config under VIBE_HOME, never the real ~', async () => {
    const dir = makeTmp('windsurf-app');
    dirs.push(dir);
    const fakeHome = join(dir, 'fakehome');
    mkdirSync(fakeHome);
    writeFileSync(join(dir, '.windsurfrules'), '# rules\n');
    process.chdir(dir);
    process.env.VIBE_HOME = fakeHome;

    const result = await installAction({ client: 'windsurf' });
    expect(result.ok).toBe(true);
    const configPath = join(fakeHome, '.codeium', 'windsurf', 'mcp_config.json');
    expect(existsSync(configPath)).toBe(true);
    const config = readJson(configPath);
    expect((config.mcpServers as Record<string, unknown>)['vibe-harness']).toBeDefined();
  }, 30_000);
});
