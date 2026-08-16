import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Loader for registry/clients.json — the declarative AI-client adapters used
 * by `vibe-harness install`. Adding a client is a data change here, not a
 * code change. The registry ships inside the package, but it is still parsed
 * with a strict schema: every path it carries becomes a write target, so a
 * malformed or tampered entry must fail loud, never flow into writeFileSafe.
 */

/** Write targets may not escape their anchor directory (project root or ~). */
const safePath = z
  .string()
  .min(1)
  .refine((p) => !p.split(/[\\/]/).includes('..'), 'path traversal in registry path');

const ClientAdapterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(['stable', 'beta']),
  detect: z.array(z.string()).default([]),
  rules: z.object({
    path: safePath,
    format: z.enum(['claude-md', 'cursor-mdc', 'agents-md', 'copilot-md', 'windsurf-md']),
  }),
  mcp: z.object({
    path: safePath,
    format: z.enum(['mcp-servers', 'vscode-servers', 'opencode']),
    global: z.boolean(),
    /** Other config files the client may already use (e.g. opencode.jsonc). */
    alternativePaths: z.array(safePath).optional(),
  }),
  extras: z
    .array(
      z.object({
        path: safePath,
        template: z.enum(['skill', 'command']),
        foreach: z.array(z.string()).optional(),
      })
    )
    .default([]),
  docs: z.string().url(),
});

const ClientsCatalogSchema = z.object({
  serverName: z.string().min(1),
  packageName: z.string().min(1),
  serverCommand: z.object({ command: z.string().min(1), args: z.array(z.string()) }),
  selfRepoCommand: z.object({ command: z.string().min(1), args: z.array(z.string()) }).optional(),
  clients: z.array(ClientAdapterSchema).min(1),
});

export type ClientAdapter = z.infer<typeof ClientAdapterSchema>;
export type ClientsCatalog = z.infer<typeof ClientsCatalogSchema>;

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
      const parsed = ClientsCatalogSchema.safeParse(JSON.parse(await readFile(candidate, 'utf8')));
      if (parsed.success) return parsed.data;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}
