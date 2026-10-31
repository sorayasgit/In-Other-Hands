import { useSyncExternalStore } from 'react';
import { addCard, addEdge, addFrame, addNote, CARD_W, emptyCanvas, type Camera, type CanvasDoc } from './model';

/**
 * Canvas persistence in localStorage: an index of canvases plus one key per document and one per
 * camera (where you were looking is remembered, but isn't part of undo history).
 */

const INDEX = 'ioh.canvases.v1';
const docKey = (id: string) => `ioh.canvas.v1.${id}`;
const camKey = (id: string) => `ioh.camera.v1.${id}`;

export interface CanvasSummary {
  id: string;
  title: string;
  updatedAt: string;
  itemIds: string[];
  nodeCount: number;
}

function readIndex(): CanvasSummary[] | undefined {
  try {
    const raw = localStorage.getItem(INDEX);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

let index: CanvasSummary[] = readIndex() ?? seed();
const listeners = new Set<() => void>();

function writeIndex() {
  try {
    localStorage.setItem(INDEX, JSON.stringify(index));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function summarize(doc: CanvasDoc): CanvasSummary {
  const nodes = Object.values(doc.nodes);
  return {
    id: doc.id,
    title: doc.title,
    updatedAt: doc.updatedAt,
    itemIds: nodes.flatMap((n) => (n.kind === 'card' ? [n.itemId] : [])),
    nodeCount: nodes.length,
  };
}

export function loadCanvas(id: string): CanvasDoc | undefined {
  try {
    const raw = localStorage.getItem(docKey(id));
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function saveCanvas(doc: CanvasDoc) {
  // Never let a broken load wipe a canvas: refuse to replace a non-empty saved canvas with an empty
  // one unless the empty one was deliberately cleared (it will have a newer updatedAt and an index).
  const prev = loadCanvas(doc.id);
  const isEmpty = !Object.keys(doc.nodes).length && !Object.keys(doc.frames).length;
  if (prev && isEmpty && Object.keys(prev.nodes).length > 1 && doc.updatedAt <= prev.updatedAt) return;
  try {
    localStorage.setItem(docKey(doc.id), JSON.stringify(doc));
  } catch {
    return;
  }
  const s = summarize(doc);
  index = index.some((c) => c.id === doc.id) ? index.map((c) => (c.id === doc.id ? s : c)) : [s, ...index];
  writeIndex();
}

export function loadCamera(id: string): Camera | undefined {
  try {
    const raw = localStorage.getItem(camKey(id));
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function saveCamera(id: string, cam: Camera) {
  try {
    localStorage.setItem(camKey(id), JSON.stringify(cam));
  } catch {
    /* ignore */
  }
}

export function createCanvas(title?: string): CanvasDoc {
  const doc = emptyCanvas(title);
  saveCanvas(doc);
  return doc;
}

export function deleteCanvas(id: string) {
  localStorage.removeItem(docKey(id));
  localStorage.removeItem(camKey(id));
  index = index.filter((c) => c.id !== id);
  writeIndex();
}

/** A canvas that starts from a collection: its cards laid out in a loose grid inside a group. */
export function createCanvasFromCollection(name: string, itemIds: string[]): CanvasDoc {
  let doc = emptyCanvas(name);
  const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(itemIds.length))));
  itemIds.forEach((itemId, i) => {
    [doc] = addCard(doc, itemId, (i % cols) * (CARD_W + 50), Math.floor(i / cols) * 400);
  });
  const rows = Math.ceil(itemIds.length / cols);
  if (itemIds.length) [doc] = addFrame(doc, [{ x: 0, y: 0, w: cols * (CARD_W + 50) - 50, h: rows * 400 - 60 }], name);
  saveCanvas(doc);
  return doc;
}

/** Put a library card on a canvas (from outside the canvas view), to the right of what's there. */
export function placeOnCanvas(canvasId: string, itemId: string) {
  const doc = loadCanvas(canvasId);
  if (!doc) return;
  const xs = Object.values(doc.nodes).map((n) => n.x + (n.kind === 'card' ? CARD_W * n.scale : n.w));
  const x = xs.length ? Math.max(...xs) + 60 : 0;
  const [next] = addCard(doc, itemId, x, 0);
  saveCanvas(next);
}

export function useCanvasList(): CanvasSummary[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => index,
  );
}

/** First run: one canvas already in progress, so the space is never a blank slate. */
function seed(): CanvasSummary[] {
  let doc = emptyCanvas('Warmth, for Harvest Co.');
  const ids: Record<string, string> = {};
  const place = (key: string, itemId: string, x: number, y: number, scale = 1) => {
    const [d, id] = addCard(doc, itemId, x, y, scale);
    doc = d;
    ids[key] = id;
  };
  place('kiln', 'c03', 0, 0, 1.15);
  place('tiles', 'c55', 370, 40);
  place('market', 'c21', 0, 420);
  place('poster', 'c10', 370, 420);
  place('brief', 'c41', 880, 200);
  place('morris', 'c26', 880, 520);
  const [d1, note] = addNote(doc, 1260, 200, 'What does “late sun on clay” feel like when you open a box?');
  doc = d1;
  doc = addEdge(doc, ids.kiln, ids.brief, 'the light');
  doc = addEdge(doc, ids.brief, note);
  doc = addEdge(doc, ids.poster, ids.brief, 'flat shapes, same heat');
  const [d2] = addFrame(
    doc,
    [
      { x: 0, y: 0, w: CARD_W * 1.15, h: 350 },
      { x: 370, y: 420, w: CARD_W, h: 330 },
    ],
    'Palette references',
  );
  doc = d2;
  const s = summarize(doc);
  try {
    localStorage.setItem(docKey(doc.id), JSON.stringify(doc));
    localStorage.setItem(INDEX, JSON.stringify([s]));
  } catch {
    /* ignore */
  }
  return [s];
}
