import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { writeFileSafe, detectStack, projectRoot, getProjectName } from '../utils/fs.js';
import {
  masterRulesTemplate,
  cursorRulesTemplate,
  claudeMdTemplate,
  windsurfRulesTemplate,
  copilotInstructionsTemplate,
  mergeRulesContent,
  wrapVibeHarnessBlock,
} from '../generators/rules.js';
import type { ActionResult } from './types.js';

export interface RulesActionOptions {
  tools?: string[] | string;
  force?: boolean;
}

export interface RulesActionData {
  tools: string[];
  projectName: string;
}

interface ThreatModel {
  projectName: string;
  stack: string[];
  hasPayments: boolean;
  hasAuth: boolean;
  hasSensitiveData: boolean;
}

async function loadThreatModel(): Promise<ThreatModel | null> {
  const path = join(projectRoot(), '.vibe', 'threat-model.json');
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as ThreatModel;
  } catch {
    return null;
  }
}

/**
 * Headless rules regeneration from the stored threat model. Unified write
 * policy: skip-if-exists unless `force` (v0.6 silently overwrote files).
 */
export async function rulesAction(opts: RulesActionOptions = {}): Promise<ActionResult<RulesActionData>> {
  const threatModel = await loadThreatModel();
  const stack = threatModel?.stack ?? (await detectStack());
  const projectName = threatModel?.projectName ?? (await getProjectName());
  const usesSupabase = stack.includes('Supabase');

  const masterRules = masterRulesTemplate({
    projectName,
    stack,
    hasPayments: threatModel?.hasPayments ?? false,
    hasAuth: threatModel?.hasAuth ?? false,
    hasSensitiveData: threatModel?.hasSensitiveData ?? false,
    usesSupabase,
  });

  const tools = (Array.isArray(opts.tools)
    ? opts.tools
    : (opts.tools ?? 'cursor,claude,windsurf,copilot').split(',')
  )
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const root = projectRoot();
  const outputs: string[] = [];
  const track = async (rel: string, content: string): Promise<void> => {
    const target = join(root, rel);
    if (opts.force) {
      if (await writeFileSafe(target, wrapVibeHarnessBlock(content) + '\n', { overwrite: true, quiet: true })) {
        outputs.push(rel);
      }
    } else if (existsSync(target)) {
      try {
        const existing = await readFile(target, 'utf8');
        const merged = mergeRulesContent(existing, content);
        if (existing !== merged) {
          if (await writeFileSafe(target, merged, { overwrite: true, quiet: true })) {
            outputs.push(rel);
          }
        }
      } catch {
        // skip
      }
    } else {
      if (await writeFileSafe(target, wrapVibeHarnessBlock(content) + '\n', { overwrite: false, quiet: true })) {
        outputs.push(rel);
      }
    }
  };

  if (tools.includes('cursor')) {
    await track('.cursorrules', cursorRulesTemplate(masterRules));
    await track(
      join('.cursor', 'rules', 'vibeharness.mdc'),
      '---\ndescription: VibeHarness security & architecture guardrails\nglobs: ["**/*"]\n---\n\n' + masterRules
    );
  }
  if (tools.includes('claude')) {
    await track('CLAUDE.md', claudeMdTemplate(masterRules, projectName));
  }
  if (tools.includes('windsurf')) {
    await track('.windsurfrules', windsurfRulesTemplate(masterRules));
  }
  if (tools.includes('copilot')) {
    await track(join('.github', 'copilot-instructions.md'), copilotInstructionsTemplate(masterRules));
  }

  return {
    ok: true,
    action: 'rules',
    summary:
      outputs.length > 0
        ? `AI rule files generated for: ${tools.join(', ')}`
        : `All rule files already exist — skipped (use force to overwrite)`,
    data: { tools, projectName },
    outputs,
  };
}
