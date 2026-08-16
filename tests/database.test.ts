import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { scanDatabase } from '../src/scanners/database.js';

const originalCwd = process.cwd;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'vibe-db-test-'));
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = originalCwd;
  await rm(tmpDir, { recursive: true, force: true });
});

describe('scanDatabase — db push + missing migrations (double penalty)', () => {
  it('emits ONE combined finding when db push is detected and no migrations exist', async () => {
    await mkdir(join(tmpDir, 'prisma'), { recursive: true });
    await writeFile(
      join(tmpDir, 'prisma', 'schema.prisma'),
      'datasource db { provider = "postgresql" }\n',
      'utf8'
    );
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'app', scripts: { 'db:deploy': 'prisma db push' } }),
      'utf8'
    );
    const result = await scanDatabase();
    const high = result.findings.filter((f) => f.severity === 'high');
    expect(high).toHaveLength(1);
    expect(high[0].message).toContain('db push');
    expect(high[0].message).toContain('migration');
  });

  it('keeps separate findings when migrations exist (db push still flagged)', async () => {
    await mkdir(join(tmpDir, 'prisma', 'migrations', '20260101_init'), { recursive: true });
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'app', scripts: { 'db:deploy': 'prisma db push' } }),
      'utf8'
    );
    const result = await scanDatabase();
    const pushFindings = result.findings.filter((f) => f.message.includes('package.json'));
    expect(pushFindings).toHaveLength(1);
    expect(
      result.findings.some((f) => f.message.includes('no versioned migration directory'))
    ).toBe(false);
  });
});

describe('scanDatabase — db push detection sources', () => {
  it('detects drizzle-kit push in package.json', async () => {
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'app', scripts: { push: 'drizzle-kit push' } }),
      'utf8'
    );
    const result = await scanDatabase();
    expect(
      result.findings.some((f) => f.severity === 'high' && f.message.includes('db push'))
    ).toBe(true);
  });

  it('detects prisma db push in GitHub Actions workflows', async () => {
    await mkdir(join(tmpDir, '.github', 'workflows'), { recursive: true });
    await writeFile(
      join(tmpDir, '.github', 'workflows', 'deploy.yml'),
      'name: Deploy\njobs:\n  deploy:\n    steps:\n      - run: npx prisma db push\n',
      'utf8'
    );
    const result = await scanDatabase();
    const pushFindings = result.findings.filter((f) =>
      f.message.toLowerCase().includes('db push')
    );
    expect(pushFindings.length).toBeGreaterThan(0);
    expect(pushFindings.some((f) => f.file?.includes('deploy.yml'))).toBe(true);
  });

  it('detects db push in Dockerfiles', async () => {
    await writeFile(
      join(tmpDir, 'Dockerfile'),
      'FROM node:22\nRUN npx prisma db push\n',
      'utf8'
    );
    const result = await scanDatabase();
    const pushFindings = result.findings.filter((f) =>
      f.message.toLowerCase().includes('db push')
    );
    expect(pushFindings.length).toBeGreaterThan(0);
    expect(pushFindings.some((f) => f.file === 'Dockerfile')).toBe(true);
  });
});

describe('scanDatabase — migration directories', () => {
  it('is clean for prisma projects with prisma/migrations', async () => {
    await mkdir(join(tmpDir, 'prisma', 'migrations', '20260101_init'), { recursive: true });
    await writeFile(
      join(tmpDir, 'prisma', 'schema.prisma'),
      'datasource db { provider = "postgresql" }\n',
      'utf8'
    );
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'app', dependencies: { '@prisma/client': '^6.0.0' } }),
      'utf8'
    );
    const result = await scanDatabase();
    expect(result.findings).toHaveLength(0);
    expect(result.score).toBe(result.maxScore);
  });

  it('does NOT count a stray drizzle FILE as a migrations directory', async () => {
    await writeFile(join(tmpDir, 'drizzle'), 'not a directory\n', 'utf8');
    await writeFile(join(tmpDir, 'drizzle.config.ts'), 'export default {};\n', 'utf8');
    const result = await scanDatabase();
    expect(
      result.findings.some((f) => f.message.includes('no versioned migration directory'))
    ).toBe(true);
  });

  it('accepts src/migrations as a migrations directory', async () => {
    await mkdir(join(tmpDir, 'src', 'migrations'), { recursive: true });
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'app', dependencies: { knex: '^3.0.0' } }),
      'utf8'
    );
    const result = await scanDatabase();
    expect(result.findings).toHaveLength(0);
  });
});

describe('scanDatabase — other ORMs', () => {
  it.each(['typeorm', 'sequelize', 'kysely', 'knex'])(
    'flags %s dependency without migrations',
    async (dep) => {
      await writeFile(
        join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'app', dependencies: { [dep]: '^1.0.0' } }),
        'utf8'
      );
      const result = await scanDatabase();
      expect(
        result.findings.some(
          (f) => f.severity === 'high' && f.message.includes('no versioned migration directory')
        )
      ).toBe(true);
    }
  );

  it('detects ORM deps in devDependencies too', async () => {
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'app', devDependencies: { typeorm: '^0.3.0' } }),
      'utf8'
    );
    const result = await scanDatabase();
    expect(
      result.findings.some((f) => f.message.includes('no versioned migration directory'))
    ).toBe(true);
  });
});
