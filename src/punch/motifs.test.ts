import { describe, expect, it } from 'vitest';
import { MOTIFS, motif } from './motifs';

describe('pixel ornaments', () => {
  it('are whole grids of filled and empty cells', () => {
    for (const m of MOTIFS) {
      expect(m.rows.length).toBeGreaterThan(4);
      expect(m.rows.every((r) => r.length === m.rows[0].length && /^[#.]+$/.test(r))).toBe(true);
      expect(m.rows.join('')).toMatch(/#/);
    }
  });

  it('finds one by id, and falls back to the first', () => {
    expect(motif('roses').name).toBe('Roses');
    expect(motif('nope')).toBe(MOTIFS[0]);
  });
});
