/**
 * Canvas document. Card nodes hold only a reference (`itemId`) into the library — never a copy —
 * so a card can appear on many canvases (or twice on one) and edits in the library show everywhere.
 * All operations are pure: they return a new document, which is what makes undo/redo trivial.
 */

export interface Camera {
  x: number;
  y: number;
  z: number;
}

export interface CardNode {
  id: string;
  kind: 'card';
  itemId: string;
  x: number;
  y: number;
  /** Cards scale like a print rather than reflowing. */
  scale: number;
}

export interface NoteNode {
  id: string;
  kind: 'note';
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** How the note is drawn: plain ink text (default), a filled hub label, a "!" callout, or a big title. */
  style?: 'text' | 'label' | 'callout' | 'title';
  /** Ink colour; absent means the canvas's default ink. */
  color?: string;
  /** Type size multiplier (1 by default), so a note can be drawn as large as the prints around it. */
  scale?: number;
}

export type CanvasNode = CardNode | NoteNode;

export interface Edge {
  id: string;
  from: string;
  to: string;
  label?: string;
  /** Line colour; absent means the canvas's default ink. */
  color?: string;
}

export interface Frame {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 'ink' draws the outline in the link colour, as a loose loop around an idea. */
  tone?: 'ink';
}

export interface CanvasDoc {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  nodes: Record<string, CanvasNode>;
  edges: Record<string, Edge>;
  frames: Record<string, Frame>;
  /** Bumped when a built-in sample's layout changes, so older saved copies can be updated once. */
  layoutVersion?: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CARD_W = 280;
export const NOTE_W = 220;
export const NOTE_H = 140;

let n = 0;
export const uid = (p: string) => `${p}${Date.now().toString(36)}${(n++).toString(36)}`;

const touch = (doc: CanvasDoc, patch: Partial<CanvasDoc>): CanvasDoc => ({ ...doc, ...patch, updatedAt: new Date().toISOString() });

export function emptyCanvas(title = 'Untitled canvas'): CanvasDoc {
  const now = new Date().toISOString();
  return { id: uid('k'), title, createdAt: now, updatedAt: now, nodes: {}, edges: {}, frames: {} };
}

export function addCard(doc: CanvasDoc, itemId: string, x: number, y: number, scale = 1): [CanvasDoc, string] {
  const id = uid('n');
  return [touch(doc, { nodes: { ...doc.nodes, [id]: { id, kind: 'card', itemId, x, y, scale } } }), id];
}

export function addNote(doc: CanvasDoc, x: number, y: number, text = ''): [CanvasDoc, string] {
  const id = uid('n');
  return [touch(doc, { nodes: { ...doc.nodes, [id]: { id, kind: 'note', text, x, y, w: NOTE_W, h: NOTE_H } } }), id];
}

export function updateNode(doc: CanvasDoc, id: string, patch: Partial<CardNode> | Partial<NoteNode>): CanvasDoc {
  const node = doc.nodes[id];
  if (!node) return doc;
  return touch(doc, { nodes: { ...doc.nodes, [id]: { ...node, ...patch } as CanvasNode } });
}

export function updateFrame(doc: CanvasDoc, id: string, patch: Partial<Frame>): CanvasDoc {
  const f = doc.frames[id];
  if (!f) return doc;
  return touch(doc, { frames: { ...doc.frames, [id]: { ...f, ...patch } } });
}

/** Move nodes and frames to absolute positions. */
export function placeAll(doc: CanvasDoc, positions: Map<string, { x: number; y: number }>): CanvasDoc {
  const nodes = { ...doc.nodes };
  const frames = { ...doc.frames };
  for (const [id, p] of positions) {
    if (nodes[id]) nodes[id] = { ...nodes[id], x: p.x, y: p.y };
    else if (frames[id]) frames[id] = { ...frames[id], x: p.x, y: p.y };
  }
  return touch(doc, { nodes, frames });
}

/** Remove from the canvas only. Library items are never touched here. */
export function removeItems(doc: CanvasDoc, ids: Iterable<string>): CanvasDoc {
  const gone = new Set(ids);
  const nodes = Object.fromEntries(Object.entries(doc.nodes).filter(([id]) => !gone.has(id)));
  const frames = Object.fromEntries(Object.entries(doc.frames).filter(([id]) => !gone.has(id)));
  const edges = Object.fromEntries(
    Object.entries(doc.edges).filter(([id, e]) => !gone.has(id) && !gone.has(e.from) && !gone.has(e.to)),
  );
  return touch(doc, { nodes, frames, edges });
}

export function addEdge(doc: CanvasDoc, from: string, to: string, label?: string): CanvasDoc {
  if (from === to) return doc;
  const exists = Object.values(doc.edges).some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from));
  if (exists) return doc;
  const id = uid('e');
  return touch(doc, { edges: { ...doc.edges, [id]: { id, from, to, label } } });
}

export function setEdgeLabel(doc: CanvasDoc, id: string, label: string): CanvasDoc {
  const e = doc.edges[id];
  if (!e) return doc;
  return touch(doc, { edges: { ...doc.edges, [id]: { ...e, label: label.trim() || undefined } } });
}

export const NOTE_SCALE = { min: 0.5, max: 4, step: 1.2 };

/**
 * Make notes' text larger (`steps` > 0) or smaller, growing the box with it so nothing is clipped.
 * Anything other than a note among `ids` is left alone.
 */
export function stepNoteSize(doc: CanvasDoc, ids: string[], steps: number): CanvasDoc {
  const nodes = { ...doc.nodes };
  let changed = false;
  for (const id of ids) {
    const n = nodes[id];
    if (n?.kind !== 'note') continue;
    const from = n.scale ?? 1;
    const to = Math.round(Math.min(NOTE_SCALE.max, Math.max(NOTE_SCALE.min, from * NOTE_SCALE.step ** steps)) * 100) / 100;
    if (to === from) continue;
    const k = to / from;
    nodes[id] = { ...n, scale: to, w: Math.round(n.w * k), h: Math.round(n.h * k) };
    changed = true;
  }
  return changed ? touch(doc, { nodes }) : doc;
}

/** Recolour notes and links (anything else among `ids` is left alone). Passing no colour resets to the default ink. */
export function setInk(doc: CanvasDoc, ids: string[], color?: string): CanvasDoc {
  const nodes = { ...doc.nodes };
  const edges = { ...doc.edges };
  let changed = false;
  for (const id of ids) {
    const n = nodes[id];
    if (n?.kind === 'note' && n.color !== color) {
      nodes[id] = { ...n, color };
      changed = true;
    }
    const e = edges[id];
    if (e && e.color !== color) {
      edges[id] = { ...e, color };
      changed = true;
    }
  }
  return changed ? touch(doc, { nodes, edges }) : doc;
}

export function addFrame(doc: CanvasDoc, around: Rect[], title = 'Untitled group'): [CanvasDoc, string] {
  const pad = 36;
  const b = bounds(around) ?? { x: 0, y: 0, w: 400, h: 300 };
  const id = uid('f');
  const frame: Frame = { id, title, x: b.x - pad, y: b.y - pad - 18, w: b.w + pad * 2, h: b.h + pad * 2 + 18 };
  return [touch(doc, { frames: { ...doc.frames, [id]: frame } }), id];
}

export function bounds(rects: Rect[]): Rect | undefined {
  if (!rects.length) return undefined;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const contains = (outer: Rect, inner: Rect) =>
  inner.x + inner.w / 2 >= outer.x && inner.x + inner.w / 2 <= outer.x + outer.w && inner.y + inner.h / 2 >= outer.y && inner.y + inner.h / 2 <= outer.y + outer.h;

export const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Point where the segment from a's centre toward b's centre leaves rect a. */
export function exitPoint(a: Rect, b: Rect): { x: number; y: number } {
  const cx = a.x + a.w / 2;
  const cy = a.y + a.h / 2;
  const dx = b.x + b.w / 2 - cx;
  const dy = b.y + b.h / 2 - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx ? a.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy ? a.h / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

// ── History ────────────────────────────────────────────────────────────────────────────────────

export interface History {
  past: CanvasDoc[];
  present: CanvasDoc;
  future: CanvasDoc[];
}

const LIMIT = 200;

export const history = {
  init: (doc: CanvasDoc): History => ({ past: [], present: doc, future: [] }),
  /** A finished change: one undo step. */
  commit: (h: History, doc: CanvasDoc, base = h.present): History =>
    doc === base ? { ...h, present: doc } : { past: [...h.past, base].slice(-LIMIT), present: doc, future: [] },
  /** A change in progress (mid-drag): shown, not yet an undo step. */
  preview: (h: History, doc: CanvasDoc): History => ({ ...h, present: doc }),
  undo: (h: History): History =>
    h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h,
  redo: (h: History): History =>
    h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h,
};
