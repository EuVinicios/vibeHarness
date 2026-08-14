/** Node.js major version → End-of-Life date (https://nodejs.org/en/about/previous-releases) */
export const NODE_EOL: Record<number, string> = {
  16: '2023-09-11',
  18: '2025-04-30',
  20: '2026-04-30',
  22: '2027-04-30',
  24: '2028-04-30',
};

export function nodeEolStatus(major: number, now = new Date()): 'eol' | 'active' | 'unknown' {
  const eol = NODE_EOL[major];
  if (!eol) return 'unknown';
  return now.getTime() > new Date(eol).getTime() ? 'eol' : 'active';
}
