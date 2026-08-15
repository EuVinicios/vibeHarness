import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import { projectRoot } from '../utils/fs.js';
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
    ignore: EXCLUDED_DIRS.map((d) => `**/${d}/**`),
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
      const hasAttrLabel = /aria-label|aria-labelledby|title/i.test(openTag);
      // Check for text content between tags without stripping HTML (avoids regex sanitization pitfalls)
      // Matches any non-whitespace, non-tag characters between > and < (i.e., text nodes)
      const hasTextContent = />[^<\s][^<]*</.test(btn);
      if (!hasAttrLabel && !hasTextContent) buttonsWithoutLabel++;
    }

    const imgMatches = content.match(/<img[^>]*>/gi) ?? [];
    for (const img of imgMatches) {
      if (!/\balt\s*=/i.test(img)) imagesWithoutAlt++;
    }

    const inputMatches = content.match(/<input[^>]*>/gi) ?? [];
    for (const inp of inputMatches) {
      if (!/aria-label|aria-labelledby|id\s*=/i.test(inp)) inputsWithoutLabel++;
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
