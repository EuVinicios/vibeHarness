import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { scanAccessibility } from '../src/scanners/accessibility.js';

const originalCwd = process.cwd;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'vibe-a11y-test-'));
  process.cwd = () => tmpDir;
});

afterEach(async () => {
  process.cwd = originalCwd;
  await rm(tmpDir, { recursive: true, force: true });
});

describe('scanAccessibility — inputs', () => {
  it('flags an input with id but NO matching <label for> in the file', async () => {
    await writeFile(
      join(tmpDir, 'form.tsx'),
      `export const Form = () => (\n  <form>\n    <input id="email" type="email" />\n  </form>\n);\n`,
      'utf8'
    );
    const result = await scanAccessibility();
    expect(result.findings.some((f) => f.message.includes('<input>'))).toBe(true);
  });

  it('accepts <label for="id"> in the same file as a valid label', async () => {
    await writeFile(
      join(tmpDir, 'form.tsx'),
      `export const Form = () => (\n  <form>\n    <label for="email">Email</label>\n    <input id="email" type="email" />\n  </form>\n);\n`,
      'utf8'
    );
    const result = await scanAccessibility();
    expect(result.findings.some((f) => f.message.includes('<input>'))).toBe(false);
  });

  it('accepts JSX htmlFor="id" in the same file as a valid label', async () => {
    await writeFile(
      join(tmpDir, 'form.tsx'),
      `export const Form = () => (\n  <form>\n    <label htmlFor="email">Email</label>\n    <input id="email" type="email" />\n  </form>\n);\n`,
      'utf8'
    );
    const result = await scanAccessibility();
    expect(result.findings.some((f) => f.message.includes('<input>'))).toBe(false);
  });

  it('flags an input when the <label for> points to a different id', async () => {
    await writeFile(
      join(tmpDir, 'form.tsx'),
      `export const Form = () => (\n  <form>\n    <label for="username">User</label>\n    <input id="email" type="email" />\n  </form>\n);\n`,
      'utf8'
    );
    const result = await scanAccessibility();
    expect(result.findings.some((f) => f.message.includes('<input>'))).toBe(true);
  });

  it('does NOT accept title as a label for inputs', async () => {
    await writeFile(
      join(tmpDir, 'form.tsx'),
      `export const Form = () => (\n  <form>\n    <input title="Email address" />\n  </form>\n);\n`,
      'utf8'
    );
    const result = await scanAccessibility();
    expect(result.findings.some((f) => f.message.includes('<input>'))).toBe(true);
  });

  it('accepts aria-label / aria-labelledby on inputs', async () => {
    await writeFile(
      join(tmpDir, 'form.tsx'),
      `export const Form = () => (\n  <form>\n    <input aria-label="Email address" />\n    <input aria-labelledby="name-label" />\n  </form>\n);\n`,
      'utf8'
    );
    const result = await scanAccessibility();
    expect(result.findings.some((f) => f.message.includes('<input>'))).toBe(false);
  });
});

describe('scanAccessibility — buttons', () => {
  it('flags a button labelled only with title', async () => {
    await writeFile(
      join(tmpDir, 'toolbar.tsx'),
      `export const Toolbar = () => (\n  <button title="Close dialog" onClick={close}></button>\n);\n`,
      'utf8'
    );
    const result = await scanAccessibility();
    expect(result.findings.some((f) => f.message.includes('<button>'))).toBe(true);
  });

  it('accepts aria-label or visible text on buttons', async () => {
    await writeFile(
      join(tmpDir, 'toolbar.tsx'),
      `export const Toolbar = () => (\n  <div>\n    <button aria-label="Close dialog"></button>\n    <button>Save changes</button>\n  </div>\n);\n`,
      'utf8'
    );
    const result = await scanAccessibility();
    expect(result.findings.some((f) => f.message.includes('<button>'))).toBe(false);
  });
});

describe('scanAccessibility — images (img and next/image)', () => {
  it('flags next/image <Image> tags without alt', async () => {
    await writeFile(
      join(tmpDir, 'hero.tsx'),
      `import Image from 'next/image';\nexport const Hero = () => (\n  <Image src="/hero.png" width={800} height={400} />\n);\n`,
      'utf8'
    );
    const result = await scanAccessibility();
    expect(result.findings.some((f) => f.message.includes('alt'))).toBe(true);
  });

  it('does NOT flag <Image> with alt or <img> with alt', async () => {
    await writeFile(
      join(tmpDir, 'hero.tsx'),
      `import Image from 'next/image';\nexport const Hero = () => (\n  <div>\n    <Image src="/hero.png" alt="Product hero" />\n    <img src="/logo.png" alt="Logo" />\n  </div>\n);\n`,
      'utf8'
    );
    const result = await scanAccessibility();
    expect(result.findings.some((f) => f.message.includes('alt'))).toBe(false);
  });

  it('still flags plain <img> without alt', async () => {
    await writeFile(
      join(tmpDir, 'hero.tsx'),
      `export const Hero = () => (\n  <img src="/hero.png" />\n);\n`,
      'utf8'
    );
    const result = await scanAccessibility();
    expect(result.findings.some((f) => f.message.includes('alt'))).toBe(true);
  });
});

describe('scanAccessibility — .vibe/auditignore', () => {
  it('ignores files matched by .vibe/auditignore', async () => {
    await mkdir(join(tmpDir, '.vibe'), { recursive: true });
    await writeFile(join(tmpDir, '.vibe', 'auditignore'), 'fixtures/**\n', 'utf8');
    await mkdir(join(tmpDir, 'fixtures'), { recursive: true });
    await writeFile(
      join(tmpDir, 'fixtures', 'bad.tsx'),
      `export const X = () => (\n  <button title="x"></button>\n);\n`,
      'utf8'
    );
    const result = await scanAccessibility();
    expect(result.findings.some((f) => f.category === 'accessibility')).toBe(false);
    expect(result.score).toBe(result.maxScore);
  });
});
