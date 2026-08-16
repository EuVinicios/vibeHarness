import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import fg from 'fast-glob';
import { projectRoot } from '../utils/fs.js';
import type { Finding, AuditSectionResult } from '../core/types.js';

/** Commands that sync the schema bypassing migration history. */
const DB_PUSH_RE = /(prisma )?db push|drizzle-kit push/i;

/** SQL ORMs/query builders (package.json deps) that support versioned migrations. */
const ORM_DEPS = ['typeorm', 'sequelize', 'kysely', 'knex', 'mikro-orm', 'objection', '@nestjs/typeorm'];

/** `#` comment stripper for YAML/Dockerfile/shell content — a commented-out
 * `npx prisma db push` (e.g. "legacy, removed 2026-05") is not a live command. */
function stripHashComments(src: string): string {
  return src.replace(/(^|[\s])#[^\n]*/g, '$1');
}

/** True only when the path exists AND is a directory (a stray file named
 * e.g. `drizzle` is not a migrations directory). */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export async function scanDatabase(): Promise<AuditSectionResult> {
  const findings: Finding[] = [];
  const root = projectRoot();

  const hasMigrations =
    isDirectory(join(root, 'migrations')) ||
    isDirectory(join(root, 'db', 'migrations')) ||
    isDirectory(join(root, 'prisma', 'migrations')) ||
    isDirectory(join(root, 'src', 'migrations')) ||
    isDirectory(join(root, 'drizzle'));

  const hasPrisma = existsSync(join(root, 'prisma', 'schema.prisma'));
  const hasDrizzle = existsSync(join(root, 'drizzle.config.ts'));

  // Every package.json in the tree (monorepo workspaces included) — a
  // `prisma db push` script inside packages/api used to be invisible when
  // only the root manifest was read.
  const pkgFiles = await fg('**/package.json', {
    cwd: root,
    ignore: ['**/node_modules/**', '**/.git/**'],
    absolute: true,
    suppressErrors: true,
  });

  let allDeps: Record<string, string> = {};
  const dbPushLocations: string[] = [];
  for (const pkgPath of pkgFiles) {
    let pkgRaw: string;
    try {
      pkgRaw = await readFile(pkgPath, 'utf8');
    } catch {
      continue;
    }
    if (pkgRaw.includes('db push') || pkgRaw.includes('drizzle-kit push')) {
      dbPushLocations.push(pkgPath.replace(root + '/', ''));
    }
    try {
      const pkg = JSON.parse(pkgRaw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      allDeps = { ...allDeps, ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    } catch {
      // invalid package.json — dependency detection unavailable for this one
    }
  }

  const ormDepsFound = ORM_DEPS.filter((dep) => dep in allDeps);
  const hasOrm = hasPrisma || hasDrizzle || ormDepsFound.length > 0;

  /* `db push` detection — CI workflows, Dockerfiles (any depth, any casing)
   * and compose files. Comments are stripped first so a commented-out legacy
   * command never fires the finding. */
  const buildFileSet = new Set<string>([
    ...(await fg('.github/workflows/*.{yml,yaml}', {
      cwd: root,
      suppressErrors: true,
      absolute: true,
    })),
    ...(await fg('**/Dockerfile*', {
      cwd: root,
      ignore: ['**/node_modules/**'],
      suppressErrors: true,
      absolute: true,
    })),
    ...(await fg('**/dockerfile*', {
      cwd: root,
      ignore: ['**/node_modules/**'],
      suppressErrors: true,
      absolute: true,
    })),
    ...(await fg('**/*.dockerfile', {
      cwd: root,
      ignore: ['**/node_modules/**'],
      suppressErrors: true,
      absolute: true,
    })),
    ...(await fg('**/{docker-compose,compose}*.{yml,yaml}', {
      cwd: root,
      ignore: ['**/node_modules/**'],
      suppressErrors: true,
      absolute: true,
    })),
  ]);
  for (const file of buildFileSet) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    if (DB_PUSH_RE.test(stripHashComments(content))) {
      dbPushLocations.push(file.replace(root + '/', ''));
    }
  }

  if (dbPushLocations.length > 0 && !hasMigrations) {
    // ONE combined finding — `db push` and a missing migration directory are
    // the same root problem; emitting both would double-penalise the project.
    findings.push({
      severity: 'high',
      category: 'database',
      message: `\`db push\` detected (${dbPushLocations.join(', ')}) and no versioned migration directory found — schema changes bypass migration history entirely`,
      file: dbPushLocations[0],
      fix: 'Replace `db push` with versioned migrations: generate them (`prisma migrate dev --name init`, `drizzle-kit generate`, or your ORM equivalent) and deploy with `prisma migrate deploy` / `drizzle-kit migrate` in CI/CD. `db push` bypasses migration history and can cause irreversible data loss.',
    });
  } else {
    if (dbPushLocations.includes('package.json')) {
      findings.push({
        severity: 'high',
        category: 'database',
        message: '`db push` found in package.json scripts — unsafe for production',
        fix: 'Replace `prisma db push` with `prisma migrate deploy` in your CI/CD pipeline. `db push` bypasses migration history and can cause irreversible data loss.',
      });
    }
    for (const location of dbPushLocations) {
      if (location === 'package.json') continue;
      findings.push({
        severity: 'high',
        category: 'database',
        message: '`db push` found in CI/build file — unsafe for production',
        file: location,
        fix: 'Replace `db push` with `prisma migrate deploy` (or your ORM migration runner) in your CI/CD pipeline. `db push` bypasses migration history and can cause irreversible data loss.',
      });
    }
    if (!hasMigrations && hasOrm) {
      findings.push({
        severity: 'high',
        category: 'database',
        message: 'Database ORM detected but no versioned migration directory found',
        fix: 'Use migrations instead of `db push`: run `prisma migrate dev --name init`, `drizzle-kit generate`, or generate versioned migrations for your ORM (`typeorm migration:generate`, `knex migrate:make`, `sequelize-cli migration:create`). Migrations keep schema history auditable and reversible.',
      });
    }
  }

  const maxScore = 10;
  const deductions = findings.reduce(
    (acc, f) => acc + (f.severity === 'high' ? 8 : 4),
    0
  );
  return { score: Math.max(0, maxScore - deductions), maxScore, findings };
}
