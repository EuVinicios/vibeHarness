import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import { projectRoot } from '../utils/fs.js';
import { loadAuditIgnores } from '../utils/audit-ignore.js';
import type { Finding, AuditSectionResult } from '../core/types.js';
import { EXCLUDED_DIRS } from './security.js';

/**
 * Accessibility heuristic scanner.
 * Knowledge base: WCAG 2.1 (W3C) — see docs/ferramentas-validadas.md §6.
 * Local regex heuristics only; for a full audit use axe-core in CI.
 */
export async function scanAccessibility(): Promise<AuditSectionResult> {
  const findings: Finding[] = [];

  const uiFiles = await fg('**/*.{jsx,tsx,html,svelte,vue}', {
    cwd: projectRoot(),
    ignore: [...EXCLUDED_DIRS.map((d) => `**/${d}/**`), ...await loadAuditIgnores()],
    absolute: true,
    suppressErrors: true,
  });

  let buttonsWithoutLabel = 0;
  let imagesWithoutAlt = 0;
  let inputsWithoutLabel = 0;

  for (const file of uiFiles) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue;
    }

    // Match full button elements (opening tag + content + closing tag)
    const buttonElements = content.match(/<button[^>]*>[\s\S]*?<\/button>/gi) ?? [];
    for (const btn of buttonElements) {
      const openTag = btn.match(/<button[^>]*>/i)?.[0] ?? '';
      // `title` is NOT an acceptable accessible label — assistive tech support
      // is inconsistent (WCAG 2.1). Only aria-label/aria-labelledby or visible
      // text content count.
      const hasAttrLabel = /aria-label|aria-labelledby/i.test(openTag);
      // Check for text content between tags without stripping HTML (avoids regex sanitization pitfalls)
      // Matches any non-whitespace, non-tag characters between > and < (i.e., text nodes)
      const hasTextContent = />[^<\s][^<]*</.test(btn);
      if (!hasAttrLabel && !hasTextContent) buttonsWithoutLabel++;
    }

    const imgMatches = content.match(/<img[^>]*>/gi) ?? [];
    for (const img of imgMatches) {
      if (!/\balt\s*=/i.test(img)) imagesWithoutAlt++;
    }

    // next/image: <Image> requires alt exactly like <img>.
    // (/<Image[^>]*>/gi cannot match <img — the fifth character must be 'e'.)
    const nextImageMatches = content.match(/<Image[^>]*>/gi) ?? [];
    for (const img of nextImageMatches) {
      if (!/\balt\s*=/i.test(img)) imagesWithoutAlt++;
    }

    // Collect the ids referenced by <label for="…"> (also matches JSX
    // htmlFor="…", since `for=` is a substring) in THIS file.
    const labelForIds = new Set<string>();
    const labelTags = content.match(/<label[^>]*>/gi) ?? [];
    for (const label of labelTags) {
      const forMatch = label.match(/for\s*=\s*["']([^"']+)["']/i);
      if (forMatch) labelForIds.add(forMatch[1].toLowerCase());
    }

    const inputMatches = content.match(/<input[^>]*>/gi) ?? [];
    for (const inp of inputMatches) {
      if (/aria-label|aria-labelledby/i.test(inp)) continue;
      // `id=` only counts as labelled when a matching <label for="id"> exists
      // in the same file; `title` is not an acceptable label for inputs.
      const idMatch = inp.match(/(?:^|\s)id\s*=\s*["']([^"']+)["']/i);
      if (idMatch && labelForIds.has(idMatch[1].toLowerCase())) continue;
      inputsWithoutLabel++;
    }
  }

  if (buttonsWithoutLabel > 0) {
    findings.push({
      severity: 'medium',
      category: 'accessibility',
      message: `${buttonsWithoutLabel} <button> element(s) with no accessible label`,
      fix: 'Add `aria-label="Descriptive label"` or place visible text inside the button. Ask AI: "Add aria-label to all icon-only buttons in this component."',
    });
  }
  if (imagesWithoutAlt > 0) {
    findings.push({
      severity: 'medium',
      category: 'accessibility',
      message: `${imagesWithoutAlt} <img> element(s) missing alt attribute`,
      fix: 'Add `alt="descriptive text"` to every <img>. Decorative images should use `alt=""`. Ask AI: "Add meaningful alt attributes to all images in this file."',
    });
  }
  if (inputsWithoutLabel > 0) {
    findings.push({
      severity: 'low',
      category: 'accessibility',
      message: `${inputsWithoutLabel} <input> element(s) without an associated label`,
      fix: 'Wrap inputs in a <label> or add `aria-label`. Ask AI: "Add accessible labels to all form inputs in this file per WCAG 2.1 AA."',
    });
  }

  const maxScore = 10;
  const deductions = findings.reduce(
    (acc, f) => acc + (f.severity === 'medium' ? 3 : 1),
    0
  );
  return { score: Math.max(0, maxScore - deductions), maxScore, findings };
}
