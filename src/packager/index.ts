/**
 * Context Packager — generates a clean, sanitised .vibe/CONTEXT.md
 * for feeding into LLMs without leaking secrets or noise.
 *
 * Inspired by Repomix (github.com/yamadashy/repomix).
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, extname, resolve, dirname, sep } from 'node:path';
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
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.mdx', '.txt',
  '.sh', '.bash', '.zsh',
]);

/** Multiline PEM private-key blocks — redacted as a whole before line processing. */
const PEM_BLOCK_PATTERN =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;

const REDACTED = '[REDACTED by vibe-harness]';

/** Generic assignment forms the curated SECRET_PATTERNS don't already cover. */
const GENERIC_ASSIGN_PATTERNS: RegExp[] = [
  // env-style, unquoted: DB_PASSWORD=sup3rs3cret (8+ chars, no spaces)
  /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_?KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIALS?)[A-Za-z0-9_]*\s*=\s*)(["']?)[^\s"']{8,}\2\s*$/,
  // YAML-style, quoted or bare: password: sup3rs3cret / api_key: "value"
  /^(\s*-?\s*[A-Za-z_][A-Za-z0-9_-]*(?:password|secret|token|api[_-]?key|access[_-]?key)[A-Za-z0-9_-]*\s*:\s+)(?:"[^"]{8,}"|'[^']{8,}'|[^\s#]{8,})\s*$/,
  // generic UPPER_CASE var with quoted value: const STRIPE_KEY = "sk_..."
  /^(\s*(?:export\s+)?(?:const|let|var)?\s*[A-Z_][A-Z0-9_]{3,}\s*=\s*)(["'])[^"']{8,}\2/,
];

/**
 * Values that look secret-ish but are known-safe — never redact.
 * Guards the generic fallbacks only; curated high-precision patterns
 * (sk_live_…, AKIA…, ghp_…) always win.
 */
const SAFE_VALUE_PATTERNS: RegExp[] = [
  // git commit SHAs & content hashes — CI action pins, integrity checksums
  /^["']?[0-9a-fA-F]{7,64}["']?$/,
  // shell command substitution: $(mktemp), $(date …)
  /^["']?\$\(/,
  // regex alternation lists (secret *prefixes*, not secrets): sk_live_|sk-ant-
  /\|/,
  // our own redaction marker (source of the packager itself)
  /^["']?\[REDACTED by vibe-harness\]["']?$/,
];

function isSafeValue(value: string): boolean {
  return SAFE_VALUE_PATTERNS.some((p) => p.test(value));
}

function redactLine(line: string): string {
  // Replace the secret substring itself — works for any format the curated
  // patterns match (quoted, JSON, bare, URI-embedded), not just `= "..."`.
  // Global: minified bundles put several secrets on one line; without `g`
  // only the first occurrence per pattern would be redacted. The shared
  // SECRET_PATTERNS stay flag-free (stateful `.test()` elsewhere), so the
  // global variant is built here.
  let out = line;
  for (const [pattern] of SECRET_PATTERNS) {
    const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
    out = out.replace(new RegExp(pattern.source, flags), REDACTED);
  }
  // Generic fallbacks — keep the identifier, redact only the value. Loops so
  // several assignments on one (minified) line are all handled; stops early
  // on a known-safe value (SHA/substitution), matching the pre-0.8.3 contract.
  for (const pattern of GENERIC_ASSIGN_PATTERNS) {
    let match = out.match(pattern);
    while (match) {
      // match[1] is always the kept prefix (identifier/assignment) — the rest is the value.
      const value = match[0].slice(match[1].length).trim();
      if (isSafeValue(value)) break;
      out = out.replace(pattern, `$1${REDACTED}`);
      match = out.match(pattern);
    }
  }
  return out;
}

function sanitiseContent(content: string): { sanitised: string; redacted: number } {
  let working = content;
  // Redact full PEM blocks first — line-based redaction cannot handle them.
  working = working.replace(PEM_BLOCK_PATTERN, `-----BEGIN PRIVATE KEY----- ${REDACTED} -----END PRIVATE KEY-----`);

  const lines = working.split('\n');
  let redacted = 0;
  const sanitised = lines.map((line) => {
    const clean = redactLine(line);
    if (clean !== line) redacted++;
    return clean;
  }).join('\n');
  return { sanitised, redacted: redacted };
}

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
  // Output stays inside the project: this action can be driven by an AI
  // agent over MCP, so the requested path is not trusted input.
  const requested = resolve(root, opts.outputPath ?? join(root, '.vibe', 'CONTEXT.md'));
  const outputPath = (requested + sep).startsWith(root + sep)
    ? requested
    : join(root, '.vibe', 'CONTEXT.md');
  await ensureDir(dirname(outputPath));

  const testExcludes = opts.includeTests
    ? []
    : ['**/*.test.*', '**/*.spec.*', '**/__tests__/**', '**/tests/**'];

  const excludePatterns = [
    ...EXCLUDED_DIRS.map((d) => `**/${d}/**`),
    // All env files (defense in depth — dot:true globs could reintroduce them)
    '**/.env',
    '**/.env.*',
    '**/env.*',
    '**/*.lock',
    '**/package-lock.json',
    '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg',
    '**/*.woff', '**/*.woff2', '**/*.ttf', '**/*.eot',
    '**/*.ico', '**/*.webp', '**/*.mp4', '**/*.mp3',
    '**/*.pdf', '**/*.zip', '**/*.tar', '**/*.gz',
    // Key material & credential files — never leave the machine
    '**/*.pem', '**/*.key', '**/*.p12', '**/*.pfx', '**/*.kdbx',
    '**/id_rsa*', '**/id_ed25519*', '**/known_hosts*',
    '**/credentials*', '**/secrets/**',
    '**/*.tfstate', '**/service-account*.json',
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
> ⚠️  REVIEW BEFORE SHARING. Secret redaction is best-effort (pattern-based), not a guarantee.
> ⚠️  Never publish this file or paste it into untrusted services — it contains your source code.

`;

  await writeFile(outputPath, header + sections.join('\n'), 'utf8');

  return { outputPath, fileCount, redactedCount, totalBytes, skippedBinary };
}
