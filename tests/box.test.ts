import chalk from 'chalk';
import { visualWidth, padEndVisual, box, footer, wrapVisual } from '../src/ui/box.js';

describe('visualWidth', () => {
  it('counts ASCII as 1 column per char', () => {
    expect(visualWidth('hello')).toBe(5);
    expect(visualWidth('')).toBe(0);
  });

  it('ignores ANSI escape sequences', () => {
    const styled = chalk.red.bold('hello');
    expect(visualWidth(styled)).toBe(5);
  });

  it('counts emoji as 2 columns', () => {
    expect(visualWidth('🛡️')).toBe(2);
    expect(visualWidth('a🚀b')).toBe(4);
  });

  it('counts CJK characters as 2 columns', () => {
    expect(visualWidth('中文')).toBe(4);
  });

  it('folds regional indicator pairs (country flags) into one 2-col glyph', () => {
    // 🇧🇷 flag = two regional indicators — terminals render it 2 columns wide.
    expect(visualWidth('🇧🇷')).toBe(2);
    expect(visualWidth('a🇧🇷b')).toBe(4);
  });
});

describe('padEndVisual', () => {
  it('pads plain text to the visual width', () => {
    expect(padEndVisual('ab', 5)).toBe('ab   ');
  });

  it('accounts for emoji width when padding', () => {
    const padded = padEndVisual('🚀', 4);
    expect(visualWidth(padded)).toBe(4);
    expect(padded.endsWith('  ')).toBe(true);
  });

  it('does not truncate overlong strings', () => {
    expect(padEndVisual('abcdef', 3)).toBe('abcdef');
  });
});

describe('box', () => {
  it('renders rounded corners', () => {
    const rendered = box(['hello']);
    expect(rendered.startsWith('╭')).toBe(true);
    expect(rendered.endsWith('╯')).toBe(true);
    expect(rendered).toContain('│');
    expect(rendered).toContain('hello');
  });

  it('keeps left and right borders aligned with emoji content', () => {
    const rendered = box(['🚀 rocket', 'plain']);
    const lines = rendered.split('\n');
    const width = (l: string) => visualWidth(l);
    expect(width(lines[0])).toBe(width(lines[1]));
    expect(width(lines[1])).toBe(width(lines[2]));
  });

  it('embeds the title in the top border', () => {
    const rendered = box(['body'], { title: '🧭 Onde você está' });
    const top = rendered.split('\n')[0];
    expect(top).toContain('🧭 Onde você está');
    expect(top.startsWith('╭─')).toBe(true);
  });

  it('respects minWidth for short content', () => {
    const narrow = box(['hi']);
    const wide = box(['hi'], { minWidth: 60 });
    expect(visualWidth(wide.split('\n')[0])).toBeGreaterThan(
      visualWidth(narrow.split('\n')[0])
    );
  });
});

describe('wrapVisual', () => {
  it('splits long lines into chunks of the target visual width', () => {
    const lines = wrapVisual('abcdefghij', 4);
    expect(lines).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('never breaks an emoji or flag across lines', () => {
    const lines = wrapVisual('🚀🚀🚀🚀', 6);
    expect(lines).toEqual(['🚀🚀🚀', '🚀']);
    const flags = wrapVisual('🇧🇷🇧🇷🇧🇷', 4);
    expect(flags).toEqual(['🇧🇷🇧🇷', '🇧🇷']);
  });

  it('keeps ANSI escapes zero-width so styling survives wrapping', () => {
    const styled = chalk.red('abcdefgh');
    const lines = wrapVisual(styled, 4);
    expect(visualWidth(lines[0])).toBe(4);
    expect(lines.join('')).toContain('abcd');
    expect(lines.join('')).toContain('efgh');
  });
});

describe('footer', () => {
  it('renders every hint with its key', () => {
    const rendered = footer([
      ['↵ Enter', 'Copiar'],
      ['V', 'Validar'],
    ]);
    expect(rendered).toContain('[↵ Enter]');
    expect(rendered).toContain('Copiar');
    expect(rendered).toContain('[V]');
    expect(rendered).toContain('Validar');
  });

  it('separates hints with a divider', () => {
    const rendered = footer([['Q', 'Sair'], ['A', 'Audit']]);
    expect(rendered).toContain('│');
  });
});
