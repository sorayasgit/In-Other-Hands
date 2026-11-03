/**
 * Hole-punch layouts, in unit coordinates (0–1 across each half), so they don't depend on the
 * picture's size. Every layout is laid out once for the most holes allowed and then cut to the
 * count asked for, so dragging the slider (or holding the punch) adds holes without moving the
 * ones already made.
 */

export const MAX_HOLES = 120;

export interface Point {
  x: number;
  y: number;
}

/** A punched hole and the circle it left: where it was cut, where it landed, and how it turned. */
export interface Punch {
  hole: Point;
  dot: Point;
  turn: number;
}

/** Small, fast, seeded. */
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Holes spread evenly over the photo, never overlapping: each is the best of a few random tries,
 * the one farthest from the holes already made. `r` is the radius as a share of the half's width;
 * `aspect` is the half's height over its width.
 */
export function holes(seed: number, r: number, aspect: number, n = MAX_HOLES): Point[] {
  const rand = rng(seed);
  const out: Point[] = [];
  const mx = r * 1.2;
  const my = (r * 1.2) / aspect;
  for (let i = 0; i < n; i++) {
    let best: Point | undefined;
    let bestD = -1;
    // A dozen tries for an even spread, then more only if none of them is clear of the others.
    for (let k = 0; k < 60 && (k < 12 || bestD < 2.3 * r); k++) {
      const p = { x: mx + rand() * (1 - 2 * mx), y: my + rand() * (1 - 2 * my) };
      const d = Math.min(Infinity, ...out.map((q) => Math.hypot(p.x - q.x, (p.y - q.y) * aspect)));
      if (d > bestD) [best, bestD] = [p, d];
    }
    out.push(best!);
  }
  return out;
}

/**
 * Where the cut circles land on the paper: a loose heap a little above the middle, overlapping
 * here and there, with a few strays further out.
 */
export function heap(seed: number, r: number, aspect: number, n = MAX_HOLES): Point[] {
  const rand = rng(seed ^ 0x9e3779b9);
  const gauss = () => {
    const u = Math.max(rand(), 1e-6);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const mx = r * 1.1;
  const my = (r * 1.1) / aspect;
  const clamp = (v: number, m: number) => Math.min(1 - m, Math.max(m, v));
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const stray = rand() < 0.12;
    // The heap grows outward as it fills, so the first circles sit in the middle.
    const spread = stray ? 0.27 : 0.075 + 0.085 * Math.min(1, i / 60);
    let p = { x: 0.5 + gauss() * spread, y: 0.4 + (gauss() * spread * 0.7) / aspect };
    // Nudge off a circle it would almost entirely cover.
    for (let k = 0; k < 6 && out.some((q) => Math.hypot(p.x - q.x, (p.y - q.y) * aspect) < r * 0.9); k++) {
      p = { x: p.x + (rand() - 0.5) * r * 2.4, y: p.y + ((rand() - 0.5) * r * 2.4) / aspect };
    }
    out.push({ x: clamp(p.x, mx), y: clamp(p.y, my) });
  }
  return out;
}

export function punches(seed: number, count: number, r: number, photoAspect: number, paperAspect: number): Punch[] {
  const h = holes(seed, r, photoAspect);
  const d = heap(seed, r, paperAspect);
  const turn = rng(seed ^ 0x51ed27);
  return h.slice(0, Math.max(0, Math.min(MAX_HOLES, Math.round(count)))).map((hole, i) => ({ hole, dot: d[i], turn: (turn() - 0.5) * Math.PI }));
}
