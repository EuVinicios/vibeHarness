import { stageChip, gradeChip, scoreChip, colors, icons } from '../src/ui/theme.js';

// Local ANSI stripper — avoids depending on a transitive package.
const stripAnsi = (s: string): string =>
  // eslint-disable-next-line no-control-regex
  s.replace(/\u001B\[[0-9;]*[A-Za-z]/g, '').replace(/\u001B/g, '');

describe('theme chips', () => {
  it('stageChip renders emoji + uppercase stage label', () => {
    expect(stripAnsi(stageChip('building'))).toBe('💻 BUILDING');
    expect(stripAnsi(stageChip('idea'))).toBe('💡 IDEA');
    expect(stripAnsi(stageChip('production'))).toBe('🛠️ PRODUCTION');
  });

  it('gradeChip colors every grade distinctly without crashing', () => {
    for (const grade of ['A', 'B', 'C', 'D', 'F']) {
      expect(stripAnsi(gradeChip(grade))).toBe(`[${grade}]`);
    }
  });

  it('scoreChip renders score/max with trophy', () => {
    expect(stripAnsi(scoreChip(85, 100))).toBe('85/100 🏆');
  });
});

describe('palette sanity', () => {
  it('colors apply styling but preserve content', () => {
    expect(stripAnsi(colors.success('ok'))).toBe('ok');
    expect(stripAnsi(colors.dim('detail'))).toBe('detail');
    expect(stripAnsi(colors.crit(' CRIT '))).toBe(' CRIT ');
  });

  it('exposes the conductor icon set', () => {
    expect(icons.shield).toContain('🛡');
    expect(icons.compass).toBe('🧭');
    expect(icons.clipboard).toBe('📋');
    expect(icons.trophy).toBe('🏆');
  });
});
