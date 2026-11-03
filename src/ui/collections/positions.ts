/**
 * Where folders sit on the Collections page, Finder-style: wherever they were dropped, kept on this
 * device only. Folders that were never moved fill in the first free spots of an even grid.
 */

const KEY = 'ioh.collections.positions.v1';

export const FOLDER_W = 168;
export const FOLDER_H = Math.round((FOLDER_W * 1000) / 680);
const MIN_GAP_X = 72;
const GAP_Y = 96;

export interface Point {
  x: number;
  y: number;
}

export function loadPositions(): Record<string, Point> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function savePositions(p: Record<string, Point>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable: positions last until reload.
  }
}

export const clampX = (x: number, width: number) => Math.round(Math.min(Math.max(0, x), Math.max(0, width - FOLDER_W)));
export const clampY = (y: number) => Math.round(Math.max(0, y));

/** Positions for every name (saved ones kept, the rest in free grid slots), one extra free slot, and the height needed. */
export function placeFolders(names: string[], saved: Record<string, Point>, width: number) {
  const cols = Math.max(1, Math.floor((width + MIN_GAP_X) / (FOLDER_W + MIN_GAP_X)));
  const stepX = cols > 1 ? (width - FOLDER_W) / (cols - 1) : 0;
  const slot = (i: number): Point => ({ x: Math.round((i % cols) * stepX), y: Math.floor(i / cols) * (FOLDER_H + GAP_Y) });

  const out = new Map<string, Point>();
  const taken: Point[] = [];
  for (const n of names) {
    const s = saved[n];
    if (s) {
      const p = { x: clampX(s.x, width), y: clampY(s.y) };
      out.set(n, p);
      taken.push(p);
    }
  }
  const free = (p: Point) => taken.every((t) => Math.abs(t.x - p.x) > FOLDER_W - 24 || Math.abs(t.y - p.y) > FOLDER_H - 24);
  let i = 0;
  const next = () => {
    while (!free(slot(i))) i++;
    const p = slot(i++);
    taken.push(p);
    return p;
  };
  for (const n of names) if (!out.has(n)) out.set(n, next());
  const spare = next();
  const height = Math.max(...taken.map((p) => p.y)) + FOLDER_H + 48;
  return { at: out, spare, height };
}
