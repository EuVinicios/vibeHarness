import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distEntry = join(repoRoot, 'dist', 'cli.js');
const pkgVersion = (
  JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { version: string }
).version;

/**
 * Regression for the v0.8.0 "server offline" bug. Clients spawn the server
 * and expect a pure JSON-RPC stream on stdout — so we spawn the real built
 * binary here (InMemoryTransport in mcp.test.ts cannot catch process-layer
 * failures). Run `npm run build` first; CI builds before testing.
 */
describe('mcp stdio handshake (spawned process)', () => {
  it('initialize answers with exactly one JSON-RPC frame on stdout and no noise', async () => {
    if (!existsSync(distEntry)) {
      throw new Error('dist/cli.js missing — run `npm run build` first (stdio regression needs the built binary)');
    }

    const child = spawn(process.execPath, [distEntry, 'mcp'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.resume(); // stderr is the log channel — just drain it

    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'regression-test', version: '0.0.0' },
      },
    };
    child.stdin.write(JSON.stringify(request) + '\n');

    const deadline = Date.now() + 15_000;
    while (!stdout.includes('\n') && Date.now() < deadline && child.exitCode === null) {
      await new Promise((r) => setTimeout(r, 50));
    }
    child.stdin.end();
    if (child.exitCode === null) child.kill();

    const frames = stdout.split('\n').filter((l) => l.trim().length > 0);
    expect(frames).toHaveLength(1); // stdout carries JSON-RPC only — nothing else may share the channel

    const frame = JSON.parse(frames[0]) as {
      jsonrpc: string;
      id: number;
      result?: { protocolVersion: string; serverInfo?: { name: string; version: string } };
    };
    expect(frame.jsonrpc).toBe('2.0');
    expect(frame.id).toBe(1);
    expect(frame.result?.protocolVersion).toBe('2025-06-18');
    expect(frame.result?.serverInfo?.name).toBe('vibe-harness');
    // Version comes from package.json — a hardcoded string once shipped 0.7.0 in a 0.8.0 package.
    expect(frame.result?.serverInfo?.version).toBe(pkgVersion);
  }, 20_000);
});
