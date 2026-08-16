import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import { projectRoot } from '../utils/fs.js';
import { loadAuditIgnores } from '../utils/audit-ignore.js';
import type { Finding, AuditSectionResult } from '../core/types.js';
import { EXCLUDED_DIRS } from './security.js';
import { stripLineComments } from './lgpd.js';

/**
 * Accessibility heuristic scanner.
 * Knowledge base: WCAG 2.1 (W3C) — see docs/ferramentas-validadas.md §6.
 * Local regex heuristics only; for a full audit use axe-core in CI.
 */

/** Input types that carry their own accessible semantics — no <label> needed. */
const SELF_LABELLING_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset']);

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
      // Commented-out example markup (JSDoc samples, <!-- old code -->) is
      // not real UI and must not be scored.
      content = stripLineComments(await readFile(file, 'utf8'));
    } catch {
      continue;
    }

    // Match full button elements (opening tag + content + closing tag)
    const buttonElements = content.match(/<button[^>]*>[\s\S]*?<\/button\s*>/gi) ?? [];
    for (const btn of buttonElements) {
      const openTag = btn.match(/<button[^>]*>/i)?.[0] ?? '';
      // `title` is NOT an acceptable accessible label — assistive tech support
      // is inconsistent (WCAG 2.1). Only aria-label/aria-labelledby or visible
      // text content count.
      const hasAttrLabel = /aria-label|aria-labelledby/i.test(openTag);
      // JSX expressions ({icon}, {loading && <Spinner/>}) may render nothing
      // textual — strip them before looking for visible text.
      const withoutExpressions = btn.replace(/\{[\s\S]*?\}/g, '');
      const hasTextContent = />[^<\s][^<]*</.test(withoutExpressions);
      if (!hasAttrLabel && !hasTextContent) buttonsWithoutLabel++;
    }
    // Self-closing icon buttons (<button onClick={x} />) escape the
    // paired-tag regex above — count them separately.
    const selfClosingButtons = content.match(/<button\b[^>]*\/>/gi) ?? [];
    for (const btn of selfClosingButtons) {
      if (!/aria-label|aria-labelledby/i.test(btn)) buttonsWithoutLabel++;
    }

    const imgMatches = content.match(/<img\b[^>]*>/gi) ?? [];
    for (const img of imgMatches) {
      if (!/\balt\s*=/i.test(img)) imagesWithoutAlt++;
    }

    // next/image: <Image> requires alt exactly like <img>. Case-SENSITIVE on
    // purpose: SVG <image> elements match the /i variant, double-counting and
    // demanding an `alt` attribute SVG does not use.
    const nextImageMatches = content.match(/<Image\b[^>]*>/g) ?? [];
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

    // Implicit association: an <input> wrapped inside <label>…</label> is
    // labelled — flagging it contradicts the scanner's own fix guidance.
    const labelSpans: [number, number][] = [];
    const labelSpanRe = /<label[^>]*>[\s\S]*?<\/label\s*>/gi;
    let ls: RegExpExecArray | null;
    while ((ls = labelSpanRe.exec(content)) !== null) {
      labelSpans.push([ls.index, ls.index + ls[0].length]);
    }

    const inputRe = /<input\b[^>]*>/gi;
    let im: RegExpExecArray | null;
    while ((im = inputRe.exec(content)) !== null) {
      const inp = im[0];
      if (/aria-label|aria-labelledby/i.test(inp)) continue;
      // Inputs that carry their own semantics need no external label.
      const typeMatch = inp.match(/(?:^|\s)type\s*=\s*["']([^"']+)["']/i);
      const type = typeMatch?.[1]?.toLowerCase();
      if (type && SELF_LABELLING_INPUT_TYPES.has(type)) continue;
      // type="image" is a graphical submit button — it needs alt, not a label.
      if (type === 'image') {
        if (!/\balt\s*=/i.test(inp)) inputsWithoutLabel++;
        continue;
      }
      // `id=` only counts as labelled when a matching <label for="id"> exists
      // in the same file; `title` is not an acceptable label for inputs.
      const idMatch = inp.match(/(?:^|\s)id\s*=\s*["']([^"']+)["']/i);
      if (idMatch && labelForIds.has(idMatch[1].toLowerCase())) continue;
      if (labelSpans.some(([start, end]) => im!.index > start && im!.index < end)) continue;
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
