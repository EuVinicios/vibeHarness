import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loader for registry/clients.json — the declarative AI-client adapters used
 * by `vibe-harness install`. Adding a client is a data change here, not a
 * code change.
 */

export type McpConfigFormat = 'mcp-servers' | 'vscode-servers' | 'opencode';

export interface ClientAdapter {
  id: string;
  name: string;
  status: 'stable' | 'beta';
  /** Glob-ish hints used to detect an already-configured client. */
  detect: string[];
  rules: { path: string; format: 'claude-md' | 'cursor-mdc' | 'agents-md' | 'copilot-md' | 'windsurf-md' };
  mcp: { path: string; format: McpConfigFormat; global: boolean };
  extras: ClientExtra[];
  docs: string;
}

export interface ClientExtra {
  path: string;
  template: 'skill' | 'command';
  foreach?: string[];
}

export interface ClientsCatalog {
  serverName: string;
  serverCommand: { command: string; args: string[] };
  clients: ClientAdapter[];
}

function registryDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'registry');
}

export async function loadClientsCatalog(): Promise<ClientsCatalog | null> {
  for (const candidate of [
    join(registryDir(), 'clients.json'),
    join(process.cwd(), 'registry', 'clients.json'),
  ]) {
    if (!existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(await readFile(candidate, 'utf8')) as ClientsCatalog;
      if (Array.isArray(parsed.clients) && parsed.serverName && parsed.serverCommand) {
        return parsed;
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}
