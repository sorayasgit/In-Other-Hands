import { describe, expect, it } from 'vitest';
import { heap, holes, MAX_HOLES, punches } from './punch';

describe('hole punch layouts', () => {
  it('adds holes without moving the ones already made', () => {
    const few = punches(7, 10, 0.04, 0.75, 0.75);
    const more = punches(7, 40, 0.04, 0.75, 0.75);
    expect(more).toHaveLength(40);
    expect(more.slice(0, 10)).toEqual(few);
  });

  it('keeps holes inside the photo and apart from each other', () => {
    const r = 0.035;
    const aspect = 0.8;
    const pts = holes(3, r, aspect, 60);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(r);
      expect(p.x).toBeLessThanOrEqual(1 - r);
      expect(p.y).toBeGreaterThanOrEqual(r / aspect);
      expect(p.y).toBeLessThanOrEqual(1 - r / aspect);
    }
    let overlaps = 0;
    pts.forEach((p, i) => pts.slice(i + 1).forEach((q) => Math.hypot(p.x - q.x, (p.y - q.y) * aspect) < 2 * r && overlaps++));
    expect(overlaps).toBe(0);
  });

  it('heaps the cut circles on the paper, within its edges', () => {
    const pts = heap(11, 0.04, 1, MAX_HOLES);
    expect(pts.every((p) => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1)).toBe(true);
    const near = pts.filter((p) => Math.hypot(p.x - 0.5, p.y - 0.4) < 0.3).length;
    expect(near / pts.length).toBeGreaterThan(0.6);
  });

  it('is the same every time for the same seed, and different for another', () => {
    expect(punches(5, 20, 0.04, 1, 1)).toEqual(punches(5, 20, 0.04, 1, 1));
    expect(punches(6, 20, 0.04, 1, 1)).not.toEqual(punches(5, 20, 0.04, 1, 1));
  });
});
