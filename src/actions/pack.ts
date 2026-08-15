import { packContext } from '../packager/index.js';
import type { ActionResult } from './types.js';

export interface PackActionOptions {
  output?: string;
  includeTests?: boolean;
  exclude?: string[] | string;
}

export interface PackActionData {
  outputPath: string;
  fileCount: number;
  skippedBinary: number;
  redactedCount: number;
  totalBytes: number;
}

/** Headless context pack — deterministic, no prompts. */
export async function packAction(opts: PackActionOptions = {}): Promise<ActionResult<PackActionData>> {
  const exclude = Array.isArray(opts.exclude)
    ? opts.exclude
    : opts.exclude
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  const result = await packContext({
    outputPath: opts.output,
    includeTests: opts.includeTests,
    extraExclude: exclude,
  });

  return {
    ok: true,
    action: 'pack',
    summary:
      `Packed ${result.fileCount} files into ${result.outputPath}` +
      (result.redactedCount > 0 ? ` (${result.redactedCount} redacted lines)` : ''),
    data: {
      outputPath: result.outputPath,
      fileCount: result.fileCount,
      skippedBinary: result.skippedBinary,
      redactedCount: result.redactedCount,
      totalBytes: result.totalBytes,
    },
    outputs: [result.outputPath],
    nextStep: 'audit',
    notes:
      result.redactedCount > 0
        ? [`${result.redactedCount} line(s) redacted — review ${result.outputPath} before sharing`]
        : [],
  };
}
