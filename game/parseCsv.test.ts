import { describe, it, expect } from 'vitest';
import { parseCsv } from './parseCsv';

describe('parseCsv', () => {
  it('parses simple comma-separated rows', () => {
    const text = 'a,b,c\n1,2,3\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted fields containing commas', () => {
    const text = 'name,note\n"Hey, Are You An Angel?",steal a card\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'note'],
      ['Hey, Are You An Angel?', 'steal a card'],
    ]);
  });

  it('handles escaped double quotes inside quoted fields', () => {
    const text = 'name,note\n"Big Bee","has ""b"" in name"\n';
    expect(parseCsv(text)).toEqual([
      ['name', 'note'],
      ['Big Bee', 'has "b" in name'],
    ]);
  });

  it('ignores trailing blank lines', () => {
    const text = 'a,b\n1,2\n\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});
