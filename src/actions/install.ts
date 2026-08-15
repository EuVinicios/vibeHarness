import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import {
  loadClientsCatalog,
  type ClientAdapter,
  type ClientsCatalog,
} from '../registry/clients.js';
import { writeFileSafe, detectStack, projectRoot, getProjectName } from '../utils/fs.js';
import {
  masterRulesTemplate,
  claudeMdTemplate,
  copilotInstructionsTemplate,
  windsurfRulesTemplate,
} from '../generators/rules.js';
import {
  skillMdTemplate,
  slashCommandTemplate,
  agentsMdTemplate,
} from '../generators/skill.js';
import type { ActionResult, QuestionDef } from './types.js';

/**
 * `vibe-harness install` — one-command setup for AI clients (v0.7).
 * Writes each client's rules file, merges the vibe-harness MCP server into
 * the client's config (never clobbering other servers) and installs extras
 * (skills/slash commands). Adapters are data (registry/clients.json).
 *
 * Accepts a single id (`cursor`), a comma-separated list (`cursor,opencode`)
 * or `all` — most vibecoders use more than one client.
 */

export interface InstallActionOptions {
  client?: string;
  /** Headless: without client return the choice question instead of detecting. */
  requireChoice?: boolean;
}

export interface InstallActionData {
  installed: string[];
  detected: string[];
  available: { id: string; name: string; status: string }[];
  mcpConfigPaths: string[];
}

async function readThreatModel(): Promise<{
  projectName: string;
  stack: string[];
  hasPayments: boolean;
  hasAuth: boolean;
  hasSensitiveData: boolean;
} | null> {
  const path = join(projectRoot(), '.vibe', 'threat-model.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function detectClients(catalog: ClientsCatalog): Promise<ClientAdapter[]> {
  const root = projectRoot();
  const matches: ClientAdapter[] = [];
  for (const client of catalog.clients) {
    let hit = false;
    for (const pattern of client.detect) {
      const found = await fg(pattern, { cwd: root, dot: true, deep: 2, onlyFiles: false });
      if (found.length > 0) {
        hit = true;
        break;
      }
    }
    if (hit) matches.push(client);
  }
  return matches;
}

function expandPath(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(homedir(), p.slice(2));
  return p;
}

function resolveTargetPath(p: string): string {
  const expanded = expandPath(p);
  return p.startsWith('~') ? expanded : join(projectRoot(), p);
}

interface JsonRecord {
  [key: string]: unknown;
}

async function readJsonIfExists(path: string): Promise<JsonRecord | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8')) as JsonRecord;
  } catch {
    return null;
  }
}

/** Merge the vibe-harness server into the client's MCP config without clobbering existing servers. */
async function mergeMcpConfig(
  catalog: ClientsCatalog,
  client: ClientAdapter
): Promise<{ path: string; created: boolean; merged: boolean }> {
  const target = resolveTargetPath(client.mcp.path);
  const existing = (await readJsonIfExists(target)) ?? {};
  const { command, args } = catalog.serverCommand;

  let root: JsonRecord;
  switch (client.mcp.format) {
    case 'mcp-servers': {
      const servers = (existing.mcpServers as JsonRecord | undefined) ?? {};
      servers[catalog.serverName] = { command, args };
      root = { ...existing, mcpServers: servers };
      break;
    }
    case 'vscode-servers': {
      const servers = (existing.servers as JsonRecord | undefined) ?? {};
      servers[catalog.serverName] = { type: 'stdio', command, args };
      root = { ...existing, servers };
      break;
    }
    case 'opencode': {
      const mcp = (existing.mcp as JsonRecord | undefined) ?? {};
      mcp[catalog.serverName] = { type: 'local', command: [command, ...args], enabled: true };
      root = { ...existing, mcp };
      break;
    }
    default:
      throw new Error(`unknown MCP config format: ${client.mcp.format}`);
  }

  const existedBefore = existsSync(target);
  await writeFileSafe(target, JSON.stringify(root, null, 2) + '\n', { overwrite: true, quiet: true });
  return { path: client.mcp.path, created: !existedBefore, merged: existedBefore };
}

async function buildRulesContent(client: ClientAdapter): Promise<string> {
  const tm = await readThreatModel();
  const stack = tm?.stack ?? (await detectStack());
  const projectName = tm?.projectName ?? (await getProjectName());

  if (client.rules.format === 'agents-md') {
    return agentsMdTemplate(projectName, stack);
  }

  const masterRules = masterRulesTemplate({
    projectName,
    stack,
    hasPayments: tm?.hasPayments ?? false,
    hasAuth: tm?.hasAuth ?? false,
    hasSensitiveData: tm?.hasSensitiveData ?? false,
    usesSupabase: stack.includes('Supabase'),
  });

  switch (client.rules.format) {
    case 'claude-md':
      return claudeMdTemplate(masterRules, projectName);
    case 'copilot-md':
      return copilotInstructionsTemplate(masterRules);
    case 'windsurf-md':
      return windsurfRulesTemplate(masterRules);
    case 'cursor-mdc':
      return '---\ndescription: VibeHarness security & architecture guardrails\nglobs: ["**/*"]\n---\n\n' + masterRules;
    default:
      return masterRules;
  }
}

async function installOne(
  catalog: ClientsCatalog,
  client: ClientAdapter,
  outputs: string[],
  notes: string[]
): Promise<void> {
  const rulesContent = await buildRulesContent(client);
  if (
    await writeFileSafe(resolveTargetPath(client.rules.path), rulesContent, {
      overwrite: true,
      quiet: true,
    })
  ) {
    outputs.push(client.rules.path);
  }

  const mcp = await mergeMcpConfig(catalog, client);
  outputs.push(mcp.path);
  notes.push(
    `${client.name}: MCP ${mcp.created ? 'config created' : 'merged'} (${mcp.path})`
  );

  for (const extra of client.extras) {
    if (extra.template === 'skill') {
      const projectName = await getProjectName();
      if (await writeFileSafe(resolveTargetPath(extra.path), skillMdTemplate(projectName), { overwrite: true, quiet: true })) {
        outputs.push(extra.path);
      }
    } else if (extra.template === 'command' && extra.foreach) {
      for (const cmd of extra.foreach) {
        const path = extra.path.replace('{command}', cmd);
        if (await writeFileSafe(resolveTargetPath(path), slashCommandTemplate(cmd as never), { overwrite: true, quiet: true })) {
          outputs.push(path);
        }
      }
    }
  }

  if (client.status === 'beta') {
    notes.push(`${client.name} adapter is beta — verify the MCP server appears in the client settings (${client.docs})`);
  }
}

function availableList(catalog: ClientsCatalog): { id: string; name: string; status: string }[] {
  return catalog.clients.map((c) => ({ id: c.id, name: c.name, status: c.status }));
}

function choiceQuestion(catalog: ClientsCatalog, message: string, detectedIds: string[]): QuestionDef {
  const options = [
    ...(detectedIds.length > 1
      ? [{ value: 'all', label: `Todos os detectados (${detectedIds.join(', ')})` }]
      : []),
    ...catalog.clients.map((c) => ({
      value: c.id,
      label: `${c.name}${c.status === 'beta' ? ' (beta)' : ''}`,
    })),
  ];
  return { id: 'client', kind: 'select', message, options };
}

export async function installAction(opts: InstallActionOptions = {}): Promise<ActionResult<InstallActionData>> {
  const catalog = await loadClientsCatalog();
  if (!catalog) {
    return {
      ok: false,
      action: 'install',
      summary: 'Could not load registry/clients.json — is the package installed correctly?',
      data: { installed: [], detected: [], available: [], mcpConfigPaths: [] },
    };
  }

  const available = availableList(catalog);
  const detected = await detectClients(catalog);
  const detectedIds = detected.map((d) => d.id);

  // ---- Explicit selection: 'all', a single id, or a comma-separated list ----
  if (opts.client) {
    const wanted = opts.client
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const targets =
      wanted.includes('all')
        ? catalog.clients
        : wanted
            .map((id) => catalog.clients.find((c) => c.id === id))
            .filter((c): c is ClientAdapter => c !== undefined);

    const unknown = wanted.filter(
      (id) => id !== 'all' && !catalog.clients.some((c) => c.id === id)
    );
    if (unknown.length > 0) {
      return {
        ok: false,
        action: 'install',
        summary: `Unknown client(s): ${unknown.join(', ')}. Available: ${available.map((a) => a.id).join(', ')} (or "all").`,
        data: { installed: [], detected: detectedIds, available, mcpConfigPaths: [] },
      };
    }
    if (targets.length === 0) {
      return {
        ok: false,
        action: 'install',
        summary: 'No client selected.',
        data: { installed: [], detected: detectedIds, available, mcpConfigPaths: [] },
      };
    }

    const outputs: string[] = [];
    const notes: string[] = [];
    for (const target of targets) {
      await installOne(catalog, target, outputs, notes);
    }
    const names = targets.map((t) => t.name).join(', ');
    return {
      ok: true,
      action: 'install',
      summary: `${targets.length > 1 ? `${targets.length} clients` : names} configured. Restart each client, approve the MCP server, then ask it to "run vibe status".`,
      data: {
        installed: targets.map((t) => t.id),
        detected: detectedIds,
        available,
        mcpConfigPaths: targets.map((t) => t.mcp.path),
      },
      outputs,
      notes,
    };
  }

  // ---- No explicit choice ----
  if (detected.length === 1 && !opts.requireChoice) {
    const outputs: string[] = [];
    const notes: string[] = [];
    await installOne(catalog, detected[0], outputs, notes);
    return {
      ok: true,
      action: 'install',
      summary: `${detected[0].name} configured. Restart the client, approve the MCP server, then ask it to "run vibe status".`,
      data: {
        installed: [detected[0].id],
        detected: detectedIds,
        available,
        mcpConfigPaths: [detected[0].mcp.path],
      },
      outputs,
      notes,
    };
  }

  const question =
    detected.length > 1
      ? choiceQuestion(
          catalog,
          `Multiple AI clients detected (${detected.map((d) => d.name).join(', ')}). Install into which?`,
          detectedIds
        )
      : choiceQuestion(catalog, 'No AI client detected yet. Which one do you use?', []);

  if (opts.requireChoice) {
    return {
      ok: false,
      action: 'install',
      summary: 'Client choice required — ask the user, then call again with the chosen id(s) (comma-separated, or "all").',
      data: { installed: [], detected: detectedIds, available, mcpConfigPaths: [] },
      pendingQuestions: [question],
    };
  }

  return {
    ok: false,
    action: 'install',
    summary: detected.length > 1 ? 'Multiple clients detected — choose one.' : 'No client detected — choose one.',
    data: { installed: [], detected: detectedIds, available, mcpConfigPaths: [] },
    pendingQuestions: [question],
  };
}
