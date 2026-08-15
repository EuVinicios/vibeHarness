import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installAction } from '../src/actions/install.js';

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

  it('regular projects keep the npx invocation', async () => {
    const dir = makeTmp('my-app');
    dirs.push(dir);
    process.chdir(dir);

    const result = await installAction({ client: 'qwen' });
    expect(result.ok).toBe(true);

    const settings = readJson(join(dir, '.qwen', 'settings.json'));
    const servers = settings.mcpServers as Record<string, { command: string; args: string[] }>;
    expect(servers['vibe-harness']).toEqual({
      command: 'npx',
      args: ['-y', '@vibeharness/cli', 'mcp'],
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
