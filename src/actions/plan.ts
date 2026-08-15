import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { writeFileSafe, detectStack, projectRoot, getProjectName } from '../utils/fs.js';
import { loadCatalog, isCatalogStale, catalogViolations, type Catalog } from '../registry/index.js';
import { stackPlanTemplate, type StackPlanInput } from '../generators/stack-plan.js';
import {
  buildApplyPlan,
  executeApplyPlan,
  readInstalledDeps,
  appendApplyTrail,
  detectResolvedCapabilities,
  type ApplyResult,
  type ResolvedCapabilities,
} from '../core/apply.js';
import { writeStartersReadme } from './starters.js';
import { PROJECT_TYPES, PROJECT_TYPE_QUESTION, type ProjectType } from './questions.js';
import type { ActionResult } from './types.js';

export interface PlanActionOptions {
  projectType?: string;
  /** Execute the apply plan (deps + configs). Consent was already collected. */
  apply?: boolean;
  /** Non-interactive: skip binary-tool consent, use defaults. */
  yes?: boolean;
  force?: boolean;
  /** Headless: without projectType return the question instead of defaulting. */
  requireAnswers?: boolean;
}

export interface PlanItemSummary {
  category: string;
  name: string;
  repo: string;
  action: string;
}

export interface PlanActionData {
  projectType: ProjectType;
  catalogLastSync: string;
  catalogStale: boolean;
  planItems: PlanItemSummary[];
  skipped: { category: string; name?: string; reason: string }[];
  stackWritten: boolean;
  /** Capabilities already solved by the existing stack (no conflicting recommendations). */
  resolved: ResolvedCapabilities;
  apply?: ApplyResult;
  wiringInstructions?: string[];
}

interface StoredThreatModel {
  hasPayments?: boolean;
  hasAuth?: boolean;
  hasSensitiveData?: boolean;
}

type ReadThreatResult = { model: StoredThreatModel | null; invalid: boolean };

async function readThreatModel(): Promise<ReadThreatResult> {
  const path = join(projectRoot(), '.vibe', 'threat-model.json');
  if (!existsSync(path)) return { model: null, invalid: false };
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as StoredThreatModel;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return { model: parsed, invalid: false };
  } catch {
    // Fail loud for the caller to surface: a silently-ignored threat model
    // would generate a stack plan without auth/payments guardrails.
    return { model: null, invalid: true };
  }
}

/**
 * Headless stack plan (+apply). Reads the curated registry and the stored
 * threat model, writes .vibe/STACK.md and — with `apply` — installs deps and
 * writes configs/starters (never inside src/), returning wiring instructions
 * so an AI can integrate the starters with user consent.
 */
export async function planAction(opts: PlanActionOptions = {}): Promise<ActionResult<PlanActionData>> {
  const catalog: Catalog | null = await loadCatalog();
  if (!catalog) {
    return {
      ok: false,
      action: 'plan',
      summary: 'Could not load registry/catalog.json — is the package installed correctly?',
      data: {} as PlanActionData,
    };
  }

  const stale = isCatalogStale(catalog);
  const violations = catalogViolations(catalog);
  const notes: string[] = [];
  if (stale) notes.push(`registry snapshot is stale (last sync: ${catalog.lastSync})`);
  if (violations.length > 0) notes.push(`${violations.length} registry entries violate curation criteria`);

  let projectType: ProjectType | undefined =
    opts.projectType && (PROJECT_TYPES as readonly string[]).includes(opts.projectType)
      ? (opts.projectType as ProjectType)
      : undefined;

  if (!projectType && opts.requireAnswers) {
    return {
      ok: false,
      action: 'plan',
      summary: 'Project type required — ask the user, then call again.',
      data: {} as PlanActionData,
      pendingQuestions: [PROJECT_TYPE_QUESTION],
      notes,
    };
  }
  projectType = projectType ?? 'fullstack-web';

  const stack = await detectStack();
  const projectName = await getProjectName();
  const { model: threatModel, invalid: threatInvalid } = await readThreatModel();
  if (threatInvalid) {
    notes.push('.vibe/threat-model.json is INVALID — ignored. Re-run init to regenerate.');
  }
  if (!threatModel) notes.push('No threat model found — run init for tailored recommendations');

  // v0.8: don't recommend replacements for capabilities the project already solved.
  const resolved = detectResolvedCapabilities();
  const resolvedBits = [resolved.auth, resolved.payments, resolved.deploy].filter(Boolean);
  if (resolvedBits.length > 0) {
    notes.push(`Existing stack already solves: ${resolvedBits.join(', ')} — conflicting recommendations skipped`);
  }

  const input: StackPlanInput = {
    projectName,
    projectType,
    catalog,
    catalogStale: stale,
    threatModel: threatModel
      ? {
          hasPayments: threatModel.hasPayments ?? false,
          hasAuth: threatModel.hasAuth ?? true,
          hasSensitiveData: threatModel.hasSensitiveData ?? false,
        }
      : null,
    detectedStack: stack,
    resolved,
  };

  const vibeDir = join(projectRoot(), '.vibe');
  const stackPath = join(vibeDir, 'STACK.md');
  const stackWritten = await writeFileSafe(stackPath, stackPlanTemplate(input), {
    overwrite: opts.force === true,
    quiet: true,
  });
  if (!stackWritten) notes.push('.vibe/STACK.md already exists — skipped (use force to overwrite)');

  const applyPlan = buildApplyPlan(catalog, {
    projectType,
    hasAuth: threatModel?.hasAuth ?? true,
    hasPayments: threatModel?.hasPayments ?? false,
    installedDeps: readInstalledDeps(),
    resolved,
  });

  const planItems: PlanItemSummary[] = applyPlan.items.map((i) => ({
    category: i.category,
    name: i.entry.name,
    repo: i.entry.repo,
    action: [
      i.recipe.install?.length ? `install ${i.recipe.install.join(', ')}` : '',
      i.recipe.devInstall?.length ? `dev-install ${i.recipe.devInstall.join(', ')}` : '',
      i.recipe.files?.length ? `write ${i.recipe.files.map((f) => f.path).join(', ')}` : '',
      i.recipe.envVars?.length ? `env: ${i.recipe.envVars.map((e) => e.name).join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
  }));

  const data: PlanActionData = {
    projectType,
    catalogLastSync: catalog.lastSync,
    catalogStale: stale,
    planItems,
    skipped: applyPlan.skipped.map((s) => ({ category: s.category, name: s.entry?.name, reason: s.reason })),
    stackWritten,
    resolved,
  };

  if (!opts.apply) {
    return {
      ok: true,
      action: 'plan',
      summary: `.vibe/STACK.md ${stackWritten ? 'written' : 'kept'} — ${planItems.length} item(s) applicable via apply.`,
      data,
      outputs: stackWritten ? [join('.vibe', 'STACK.md')] : [],
      nextStep: 'pack',
      notes,
    };
  }

  // ---- Apply: install + configure the curated stack (never touches src/) ----
  const applyResult = await executeApplyPlan(applyPlan, { yes: opts.yes === true, projectName });

  if (stackWritten || existsSync(stackPath)) {
    await appendApplyTrail(stackPath, applyResult);
  }

  const wiringInstructions = await writeStartersReadme(applyPlan);
  if (wiringInstructions.length > 0) {
    notes.push('Starters live in .vibe/starters/ — see wiring instructions and integrate with user consent');
  }

  data.apply = applyResult;
  data.wiringInstructions = wiringInstructions;

  return {
    ok: applyResult.failedInstalls.length === 0,
    action: 'plan',
    summary:
      `Stack applied: ${applyResult.installedPackages.length} package(s) installed, ` +
      `${applyResult.filesWritten.length} file(s) written, ${wiringInstructions.length} wiring step(s) pending.`,
    data,
    outputs: [join('.vibe', 'STACK.md'), ...(wiringInstructions.length > 0 ? [join('.vibe', 'starters', 'README.md')] : [])],
    nextStep: 'pack',
    notes,
  };
}
