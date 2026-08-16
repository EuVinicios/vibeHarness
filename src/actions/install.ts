import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fg from 'fast-glob';
import {
  loadClientsCatalog,
  type ClientAdapter,
  type ClientsCatalog,
} from '../registry/clients.js';
import { writeFileSafe, backupFile, detectStack, projectRoot, getProjectName } from '../utils/fs.js';
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
  /** Overwrite existing rules/extras files (default: skip — unified write policy). */
  force?: boolean;
}

export interface InstallActionData {
  installed: string[];
  detected: string[];
  available: { id: string; name: string; status: string }[];
  mcpConfigPaths: string[];
  /** Per-client failures (isolated — one broken client never aborts the rest). */
  errors: string[];
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

/** Discriminated read: an existing-but-unparseable config is a hard error —
 * treating it as `{}` would silently destroy the user's config on merge. */
type JsonRead =
  | { status: 'missing' }
  | { status: 'ok'; data: JsonRecord }
  | { status: 'invalid'; error: string };

async function readJsonObject(path: string): Promise<JsonRead> {
  if (!existsSync(path)) return { status: 'missing' };
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    return { status: 'invalid', error: `unreadable (${err instanceof Error ? err.message : String(err)})` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'invalid', error: 'not valid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { status: 'invalid', error: 'root is not a JSON object' };
  }
  return { status: 'ok', data: parsed as JsonRecord };
}

/** True when the current project is the vibe-harness package itself. */
async function isSelfPackage(packageName: string): Promise<boolean> {
  try {
    const raw = await readFile(join(projectRoot(), 'package.json'), 'utf8');
    return (JSON.parse(raw) as { name?: string }).name === packageName;
  } catch {
    return false;
  }
}

/** Merge the vibe-harness server into the client's MCP config without
 * clobbering existing servers. Fails loud (never writes) when the existing
 * config is unparseable or not an object — and backs up the original first. */
async function mergeMcpConfig(
  catalog: ClientsCatalog,
  client: ClientAdapter,
  selfRepo: boolean
): Promise<{ path: string; created: boolean; merged: boolean; selfRepo: boolean; backup?: string }> {
  // If the primary path is absent but the client already keeps its config in
  // an alternative file (e.g. opencode.jsonc), merge there instead of
  // creating a shadowing file the client may ignore.
  let targetPath = client.mcp.path;
  if (!existsSync(resolveTargetPath(targetPath))) {
    for (const alt of client.mcp.alternativePaths ?? []) {
      if (existsSync(resolveTargetPath(alt))) {
        targetPath = alt;
        break;
      }
    }
  }
  const target = resolveTargetPath(targetPath);
  const read = await readJsonObject(target);
  if (read.status === 'invalid') {
    throw new Error(
      `${client.name}: MCP config ${targetPath} is ${read.error} — fix or remove it, then re-run install (nothing was written)`
    );
  }
  const existing = read.status === 'ok' ? read.data : {};

  // Inside the package's own repo `npx -y @vibeharness/cli mcp` exits 127 —
  // npm exec resolves the package name against the local project, whose bin
  // is not linked into node_modules/.bin. Run the local build directly.
  const { command, args } = selfRepo
    ? catalog.selfRepoCommand ?? catalog.serverCommand
    : catalog.serverCommand;

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

  const existedBefore = read.status === 'ok';
  const backup = existedBefore ? (await backupFile(target)) ?? undefined : undefined;
  await writeFileSafe(target, JSON.stringify(root, null, 2) + '\n', { overwrite: true, quiet: true });
  return { path: targetPath, created: !existedBefore, merged: existedBefore, selfRepo, backup };
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
  notes: string[],
  selfRepo: boolean,
  force: boolean
): Promise<void> {
  const rulesContent = await buildRulesContent(client);
  const rulesWritten = await writeFileSafe(resolveTargetPath(client.rules.path), rulesContent, {
    overwrite: force,
    quiet: true,
  });
  if (rulesWritten) {
    outputs.push(client.rules.path);
  } else {
    notes.push(`${client.name}: ${client.rules.path} kept unchanged (exists or symlink — use force to overwrite)`);
  }

  const mcp = await mergeMcpConfig(catalog, client, selfRepo);
  outputs.push(mcp.path);
  notes.push(
    `${client.name}: MCP ${mcp.created ? 'config created' : 'merged'} (${mcp.path})` +
      (mcp.backup ? ` — original backed up as ${mcp.backup.split(/[\\/]/).pop()}` : '')
  );
  if (mcp.selfRepo) {
    notes.push(
      `${client.name}: self-install detected — registered the local dist build (npx cannot resolve this project's own bin)`
    );
  }

  for (const extra of client.extras) {
    if (extra.template === 'skill') {
      const projectName = await getProjectName();
      const written = await writeFileSafe(resolveTargetPath(extra.path), skillMdTemplate(projectName), { overwrite: force, quiet: true });
      if (written) {
        outputs.push(extra.path);
      } else {
        notes.push(`${client.name}: ${extra.path} kept unchanged (exists or symlink — use force to overwrite)`);
      }
    } else if (extra.template === 'command' && extra.foreach) {
      for (const cmd of extra.foreach) {
        const path = extra.path.replace('{command}', cmd);
        const written = await writeFileSafe(resolveTargetPath(path), slashCommandTemplate(cmd as never), { overwrite: force, quiet: true });
        if (written) {
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

const execFileAsync = promisify(execFile);

/**
 * Prewarm the npx cache so the client's first MCP connection doesn't hit a
 * cold package download — on slow networks that download can exceed the
 * client's spawn timeout and leave the server showing as offline.
 * Best-effort: never fails the install.
 */
async function warmNpxCache(catalog: ClientsCatalog, notes: string[]): Promise<void> {
  const { command, args } = catalog.serverCommand;
  if (command !== 'npx' || process.env.CI) return;
  try {
    await execFileAsync(command, [...args.filter((a) => a !== 'mcp'), '--version'], {
      timeout: 120_000,
    });
    notes.push('MCP package pre-cached — the first connection should be instant.');
  } catch {
    notes.push(
      'Could not pre-cache the MCP package (offline?) — the first connection may pause while npx downloads it.'
    );
  }
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
      data: { installed: [], detected: [], available: [], mcpConfigPaths: [], errors: [] },
    };
  }

  const force = opts.force === true;
  const available = availableList(catalog);
  const detected = await detectClients(catalog);
  const detectedIds = detected.map((d) => d.id);
  const selfRepo = catalog.packageName
    ? await isSelfPackage(catalog.packageName)
    : false;

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
        data: { installed: [], detected: detectedIds, available, mcpConfigPaths: [], errors: [] },
      };
    }
    if (targets.length === 0) {
      return {
        ok: false,
        action: 'install',
        summary: 'No client selected.',
        data: { installed: [], detected: detectedIds, available, mcpConfigPaths: [], errors: [] },
      };
    }

    const outputs: string[] = [];
    const notes: string[] = [];
    const installedIds: string[] = [];
    const errors: string[] = [];
    // Isolated per client: one broken config never aborts the remaining installs.
    for (const target of targets) {
      try {
        await installOne(catalog, target, outputs, notes, selfRepo, force);
        installedIds.push(target.id);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (!selfRepo) await warmNpxCache(catalog, notes);
    notes.push('Verify after restart: the vibe-harness server should show connected (Qwen Code: /mcp).');
    const ok = errors.length === 0;
    const names = targets.map((t) => t.name).join(', ');
    return {
      ok,
      action: 'install',
      summary: ok
        ? `${targets.length > 1 ? `${targets.length} clients` : names} configured. Restart each client, approve the MCP server, then ask it to "run vibe status".`
        : `${errors.length} of ${targets.length} client(s) failed: ${errors.join(' | ')}`,
      data: {
        installed: installedIds,
        detected: detectedIds,
        available,
        mcpConfigPaths: targets.filter((t) => installedIds.includes(t.id)).map((t) => t.mcp.path),
        errors,
      },
      outputs,
      notes,
    };
  }

  // ---- No explicit choice ----
  if (detected.length === 1 && !opts.requireChoice) {
    const outputs: string[] = [];
    const notes: string[] = [];
    try {
      await installOne(catalog, detected[0], outputs, notes, selfRepo, force);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        action: 'install',
        summary: message,
        data: { installed: [], detected: detectedIds, available, mcpConfigPaths: [], errors: [message] },
        notes,
      };
    }
    if (!selfRepo) await warmNpxCache(catalog, notes);
    notes.push('Verify after restart: the vibe-harness server should show connected (Qwen Code: /mcp).');
    return {
      ok: true,
      action: 'install',
      summary: `${detected[0].name} configured. Restart the client, approve the MCP server, then ask it to "run vibe status".`,
      data: {
        installed: [detected[0].id],
        detected: detectedIds,
        available,
        mcpConfigPaths: [detected[0].mcp.path],
        errors: [],
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
      data: { installed: [], detected: detectedIds, available, mcpConfigPaths: [], errors: [] },
      pendingQuestions: [question],
    };
  }

  return {
    ok: false,
    action: 'install',
    summary: detected.length > 1 ? 'Multiple clients detected — choose one.' : 'No client detected — choose one.',
    data: { installed: [], detected: detectedIds, available, mcpConfigPaths: [], errors: [] },
    pendingQuestions: [question],
  };
}
