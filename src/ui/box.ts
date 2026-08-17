import { colors } from './theme.js';

/**
 * Rounded UTF-8 box renderer (╭─╮ │ ╰─╯) with emoji-aware width so borders
 * never look crooked. ANSI escape sequences are measured as zero-width.
 */

// eslint-disable-next-line no-control-regex
const ANSI_RE = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;

/** Code point width: 0 = zero-width (selectors, ZWJ), 2 = wide (emoji, CJK). */
function codePointWidth(cp: number): 0 | 1 | 2 {
  if (
    (cp >= 0x200b && cp <= 0x200f) || // zero-width spaces + ZWJ
    cp === 0x2028 || cp === 0x2029 ||
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
    (cp >= 0x1f3fb && cp <= 0x1f3ff) || // emoji skin-tone modifiers
    (cp >= 0x20d0 && cp <= 0x20ff) // combining marks
  ) {
    return 0;
  }
  if (
    (cp >= 0x1f300 && cp <= 0x1faff) || // emoji blocks
    (cp >= 0x1100 && cp <= 0x115f) ||
    cp === 0x2329 || cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    cp >= 0x20000 // CJK extension planes
  ) {
    return 2;
  }
  return 1;
}

/**
 * Visual width of a string in terminal columns: strips ANSI escapes, counts
 * emoji + wide chars as 2, zero-width joiners/selectors as 0, and folds a
 * pair of regional indicators (country flags like 🇧🇷) into a single 2-col
 * glyph — matching how terminals actually render them.
 */
export function visualWidth(str: string): number {
  const plain = str.replace(ANSI_RE, '');
  let width = 0;
  let prevWasRegional = false;
  for (const ch of plain) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x1f1e6 && cp <= 0x1f1ff) {
      // Regional indicator: the second one of a pair adds no extra width.
      if (prevWasRegional) {
        prevWasRegional = false;
      } else {
        width += 2;
        prevWasRegional = true;
      }
      continue;
    }
    prevWasRegional = false;
    width += codePointWidth(cp);
  }
  return width;
}

/** Pad a string to a visual width, ignoring ANSI codes in the measurement. */
export function padEndVisual(str: string, width: number): string {
  const missing = width - visualWidth(str);
  return missing > 0 ? str + ' '.repeat(missing) : str;
}

interface Cluster {
  text: string;
  width: number;
}

/**
 * Split a string into render clusters (grapheme-ish): regional-indicator
 * pairs (flags) and emoji + trailing selectors stay together. ANSI escapes
 * are kept as zero-width clusters so styling survives.
 */
function clustersOf(str: string): Cluster[] {
  // eslint-disable-next-line no-control-regex
  const ansiLike = /[\u001B\u009B]/;
  const clusters: Cluster[] = [];
  const chars = [...str];
  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i].codePointAt(0)!;
    if (ansiLike.test(chars[i]) && i + 1 < chars.length) {
      // Swallow the whole CSI sequence (until a final byte in @-~).
      let seq = chars[i];
      i++;
      while (i < chars.length && !/[\u0040-\u007E]/.test(chars[i])) seq += chars[i++];
      if (i < chars.length) seq += chars[i];
      clusters.push({ text: seq, width: 0 });
      continue;
    }
    let text = chars[i];
    // Fold regional-indicator pairs (country flags) into one cluster.
    if (cp >= 0x1f1e6 && cp <= 0x1f1ff && i + 1 < chars.length) {
      const next = chars[i + 1].codePointAt(0)!;
      if (next >= 0x1f1e6 && next <= 0x1f1ff) text += chars[++i];
      clusters.push({ text, width: 2 });
      continue;
    }
    // Fold trailing zero-width joiners/selectors into the cluster.
    const width = codePointWidth(cp);
    while (i + 1 < chars.length) {
      const ncp = chars[i + 1].codePointAt(0)!;
      if (codePointWidth(ncp) === 0 && ncp !== 0x200d) {
        text += chars[++i];
      } else if (ncp === 0x200d && i + 2 < chars.length) {
        // ZWJ sequences: keep the joined char with the cluster.
        text += chars[++i] + chars[++i];
      } else break;
    }
    clusters.push({ text, width });
  }
  return clusters;
}

function findLastSpace(clusters: Cluster[]): number {
  for (let i = clusters.length - 1; i >= 0; i--) {
    if (clusters[i].text === ' ') return i;
  }
  return -1;
}

/** Word-wrap a string to a visual width, preserving ANSI escapes. */
export function wrapVisual(str: string, width: number): string[] {
  if (width <= 0) return [str];
  const clusters = clustersOf(str);
  const lines: string[] = [];
  let currentClusters: Cluster[] = [];
  let currentWidth = 0;

  for (const c of clusters) {
    if (c.width > 0 && currentWidth + c.width > width) {
      const spaceIdx = findLastSpace(currentClusters);
      if (spaceIdx > 0) {
        // Break at the last space on current line
        const beforeSpace = currentClusters.slice(0, spaceIdx);
        const afterSpace = currentClusters.slice(spaceIdx + 1);
        lines.push(beforeSpace.map((cl) => cl.text).join(''));
        currentClusters = [...afterSpace, c];
        currentWidth = currentClusters.reduce((acc, cl) => acc + cl.width, 0);
      } else {
        // No space on line, hard-break at boundary
        lines.push(currentClusters.map((cl) => cl.text).join(''));
        currentClusters = [c];
        currentWidth = c.width;
      }
    } else {
      currentClusters.push(c);
      currentWidth += c.width;
    }
  }

  if (currentClusters.length > 0) {
    lines.push(currentClusters.map((cl) => cl.text).join(''));
  }

  return lines;
}

export interface BoxOptions {
  /** Title embedded in the top border (already styled by the caller). */
  title?: string;
  /** Border color function (default: primary cyan). */
  color?: (s: string) => string;
  /** Minimum interior width (default adapts to content & terminal). */
  minWidth?: number;
  /** Left interior padding (default 1). */
  padding?: number;
}

function terminalWidth(): number {
  const w = process.stdout.columns ?? process.env.COLUMNS;
  const n = typeof w === 'string' ? parseInt(w, 10) : (w ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 80;
}

export function box(lines: string[], opts: BoxOptions = {}): string {
  const color = opts.color ?? colors.primary;
  const padding = opts.padding ?? 1;
  const pad = ' '.repeat(padding);

  const contentWidth = Math.max(0, ...lines.map(visualWidth), opts.title ? visualWidth(` ${opts.title} `) : 0);
  const inner = Math.max(opts.minWidth ?? 0, contentWidth);
  // Cap to terminal so long lines never wrap mid-border.
  const capped = Math.min(inner, terminalWidth() - 4 - padding * 2);
  const width = Math.max(20, capped);

  const top = opts.title
    ? color(`╭─ ${opts.title} ${'─'.repeat(Math.max(1, width - visualWidth(` ${opts.title} `) + 1))}╮`)
    : color(`╭${'─'.repeat(width + padding * 2)}╮`);
  const bottom = color(`╰${'─'.repeat(width + padding * 2)}╯`);
  const body = lines
    .flatMap((l) => (visualWidth(l) > width ? wrapVisual(l, width) : [l]))
    .map((l) => color('│') + pad + padEndVisual(l, width) + pad + color('│'));

  return [top, ...body, bottom].join('\n');
}

/** Render a shortcuts footer: `[↵ Enter] 📋 Copiar │ [V] ⚡ Validar` */
export function footer(hints: [string, string][]): string {
  const parts = hints.map(([key, label]) => `${colors.warn(`[${key}]`)} ${label}`);
  const sep = colors.dim('  │  ');
  return colors.dim('  ') + parts.join(sep);
}
