/**
 * Context Packager — generates a clean, sanitised .vibe/CONTEXT.md
 * for feeding into LLMs without leaking secrets or noise.
 *
 * Inspired by Repomix (github.com/yamadashy/repomix).
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import fg from 'fast-glob';
import { projectRoot, ensureDir } from '../utils/fs.js';
import { SECRET_PATTERNS, EXCLUDED_DIRS } from '../scanners/security.js';

/** File extensions to include as readable source */
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rb', '.rs', '.java', '.kt', '.swift',
  '.sql', '.graphql', '.gql',
  '.css', '.scss', '.sass', '.less',
  '.html', '.svelte', '.vue',
  '.json', '.yaml', '.yml', '.toml', '.env.example',
  '.md', '.mdx', '.txt',
  '.sh', '.bash', '.zsh',
]);

/** Patterns for secrets — redact matching lines */
const REDACT_LINE_PATTERNS: RegExp[] = [
  ...SECRET_PATTERNS.map(([r]) => r),
  /^\s*(export\s+)?(const|let|var)?\s*[A-Z_]{4,}\s*=\s*["'][^"']{8,}["']/,
  /^\s*[A-Z_]{4,}\s*=.+/m,
];

const MAX_FILE_BYTES = 100 * 1024; // 100 KB — skip huge files

export interface PackOptions {
  outputPath?: string;
  /** Additional glob patterns to exclude */
  extraExclude?: string[];
  /** Include test files */
  includeTests?: boolean;
}

export interface PackResult {
  outputPath: string;
  fileCount: number;
  redactedCount: number;
  totalBytes: number;
  skippedBinary: number;
}

function redactLine(line: string): string {
  for (const pattern of REDACT_LINE_PATTERNS) {
    if (pattern.test(line)) {
      // Keep the variable name, redact the value
      return line.replace(/=\s*["'][^"']+["']/, '= "[REDACTED by vibe-harness]"')
        .replace(/:\s*["'][^"']{8,}["']/, ': "[REDACTED by vibe-harness]"');
    }
  }
  return line;
}

function sanitiseContent(content: string): { sanitised: string; redacted: number } {
  const lines = content.split('\n');
  let redacted = 0;
  const sanitised = lines.map((line) => {
    const clean = redactLine(line);
    if (clean !== line) redacted++;
    return clean;
  }).join('\n');
  return { sanitised, redacted };
}

async function getArchitectureSummary(): Promise<string> {
  const root = projectRoot();
  const lines: string[] = ['## Project Architecture Summary\n'];

  // Package.json summary
  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const raw = await readFile(pkgPath, 'utf8');
      const pkg = JSON.parse(raw) as {
        name?: string;
        version?: string;
        description?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      lines.push(`**Project:** ${pkg.name ?? 'unknown'} v${pkg.version ?? '?'}`);
      if (pkg.description) lines.push(`**Description:** ${pkg.description}`);
      const deps = Object.keys(pkg.dependencies ?? {}).join(', ');
      if (deps) lines.push(`**Runtime deps:** ${deps}`);
    } catch { /* skip */ }
  }

  // .vibe/SPEC.md summary (first 50 lines)
  const specPath = join(root, '.vibe', 'SPEC.md');
  if (existsSync(specPath)) {
    const spec = await readFile(specPath, 'utf8');
    const preview = spec.split('\n').slice(0, 50).join('\n');
    lines.push('\n---\n\n## Project Spec (from .vibe/SPEC.md)\n\n' + preview);
  }

  // .vibe/CONSTITUTION.md
  const constPath = join(root, '.vibe', 'CONSTITUTION.md');
  if (existsSync(constPath)) {
    const constitution = await readFile(constPath, 'utf8');
    lines.push('\n---\n\n## Architecture Laws (from .vibe/CONSTITUTION.md)\n\n' + constitution);
  }

  return lines.join('\n');
}

export async function packContext(opts: PackOptions = {}): Promise<PackResult> {
  const root = projectRoot();
  const outputPath = opts.outputPath ?? join(root, '.vibe', 'CONTEXT.md');
  await ensureDir(join(root, '.vibe'));

  const testExcludes = opts.includeTests
    ? []
    : ['**/*.test.*', '**/*.spec.*', '**/__tests__/**', '**/tests/**'];

  const excludePatterns = [
    ...EXCLUDED_DIRS.map((d) => `**/${d}/**`),
    '**/.env',
    '**/.env.local',
    '**/.env.*.local',
    '**/*.lock',
    '**/package-lock.json',
    '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg',
    '**/*.woff', '**/*.woff2', '**/*.ttf', '**/*.eot',
    '**/*.ico', '**/*.webp', '**/*.mp4', '**/*.mp3',
    '**/*.pdf', '**/*.zip', '**/*.tar', '**/*.gz',
    '.vibe/CONTEXT.md',
    ...(opts.extraExclude ?? []),
    ...testExcludes,
  ];

  const allFiles = await fg('**/*', {
    cwd: root,
    ignore: excludePatterns,
    dot: false,
    absolute: true,
    suppressErrors: true,
  });

  const sections: string[] = [];
  let fileCount = 0;
  let redactedCount = 0;
  let totalBytes = 0;
  let skippedBinary = 0;

  const archSummary = await getArchitectureSummary();
  sections.push(archSummary);

  sections.push('\n---\n\n## Source Files\n');

  for (const filePath of allFiles) {
    const ext = extname(filePath).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) {
      skippedBinary++;
      continue;
    }

    let fileStat;
    try {
      fileStat = await stat(filePath);
    } catch {
      continue;
    }
    if (fileStat.size > MAX_FILE_BYTES) {
      sections.push(`\n### ${relative(root, filePath)}\n> ⚠️ File skipped — too large (${Math.round(fileStat.size / 1024)} KB)\n`);
      continue;
    }

    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    const { sanitised, redacted } = sanitiseContent(raw);
    redactedCount += redacted;
    totalBytes += Buffer.byteLength(sanitised, 'utf8');
    fileCount++;

    const relPath = relative(root, filePath);
    const lang = ext.replace('.', '') || 'text';
    sections.push(`\n### ${relPath}\n\`\`\`${lang}\n${sanitised}\n\`\`\`\n`);
  }

  const header = `# VibeHarness Context Pack
> Generated: ${new Date().toISOString()}
> Files included: ${fileCount} | Secrets redacted: ${redactedCount} | Binary skipped: ${skippedBinary}
> ⚠️  Paste this file into your AI assistant. Do NOT share it publicly.

`;

  await writeFile(outputPath, header + sections.join('\n'), 'utf8');

  return { outputPath, fileCount, redactedCount, totalBytes, skippedBinary };
}
