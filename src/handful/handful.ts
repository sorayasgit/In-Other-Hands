import type { Card, TrailEntry } from '../data/types';
import { seededShuffle, seedFrom } from '../data/shuffle';

/**
 * Today's handful: a small, finite set of pieces from other people. Keep one, add something to it,
 * return it so it goes back out carrying your addition.
 *
 * ANONYMITY BY CONSTRUCTION. Nothing here may carry an author, name, user/device id, address, or any
 * time finer than a day. The shapes below are the whole vocabulary; `ALLOWED_KEYS` is enforced by a
 * test against everything that gets stored.
 */

export type PieceKind = 'book' | 'note' | 'quote' | 'song' | 'recipe' | 'photo';

export interface Piece {
  id: string;
  kind: PieceKind;
  title: string;
  body: string;
  tags: string[];
  /** Filename in /public/handful/, or a path from /public (starting with '/'). */
  image?: string;
  hands: number;
  trail: TrailEntry[];
}

export interface OutboxEntry {
  piece: Piece;
  /** YYYY-MM-DD */
  returnedOn: string;
}

export interface HandfulState {
  held: string[];
  pending: Record<string, TrailEntry[]>;
  outbox: OutboxEntry[];
  /** Days ahead of the real date (a demo helper; 0 normally). */
  dayOffset: number;
  /** Today's 20, fixed the first time the day is seen, so keeping or returning doesn't reshuffle it. */
  snapshot?: { day: string; ids: string[] };
}

export const HANDFUL_SIZE = 20;

export const ALLOWED_KEYS = {
  state: ['held', 'pending', 'outbox', 'dayOffset', 'snapshot'],
  snapshot: ['day', 'ids'],
  outbox: ['piece', 'returnedOn'],
  piece: ['id', 'kind', 'title', 'body', 'tags', 'image', 'hands', 'trail'],
  trail: ['id', 'kind', 'text', 'imageDataUrl', 'addedOn'],
  borrowedCard: ['id', 'type', 'title', 'body', 'quote', 'caption', 'palette', 'cover', 'tags', 'origin', 'pieceId', 'hands', 'trail', 'savedAt', 'collections', 'note'],
} as const;

export const emptyState = (): HandfulState => ({ held: [], pending: {}, outbox: [], dayOffset: 0 });

// ── Days ────────────────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD, optionally shifted by whole days. */
export function localDay(date = new Date(), offset = 0): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shiftDay(day: string, by: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d), by);
}

export function daysBetween(from: string, to: string): number {
  const [a, b] = [from, to].map((s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}

export function agoLabel(day: string, today: string): string {
  const n = daysBetween(day, today);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 14) return `${n} days ago`;
  if (n < 60) return `${Math.round(n / 7)} weeks ago`;
  return `${Math.round(n / 30)} months ago`;
}

// ── Selection ───────────────────────────────────────────────────────────────────────────────────

/** The newest version of a piece that is out in the world on `today`. */
function latestOut(outbox: OutboxEntry[], today: string): Map<string, OutboxEntry> {
  const out = new Map<string, OutboxEntry>();
  for (const e of outbox) {
    if (e.returnedOn >= today) continue;
    const prev = out.get(e.piece.id);
    if (!prev || e.returnedOn >= prev.returnedOn) out.set(e.piece.id, e);
  }
  return out;
}

/**
 * Everything that could be handed to you today: the community's pieces plus pieces you returned
 * before today (in their newer, longer form), minus whatever you're holding. A piece returned today
 * is still travelling and isn't in the pool until tomorrow.
 */
export function pool(community: Piece[], state: HandfulState, today: string): Piece[] {
  const byId = new Map(community.map((p) => [p.id, p]));
  for (const [id, e] of latestOut(state.outbox, today)) byId.set(id, e.piece);
  const travelling = new Set(state.outbox.filter((e) => e.returnedOn >= today).map((e) => e.piece.id));
  const held = new Set(state.held);
  return [...byId.values()].filter((p) => !held.has(p.id) && !travelling.has(p.id));
}

/**
 * Exactly 20 pieces, the same all day, different tomorrow (seeded by the date with the same shuffle
 * Wander uses). A piece that arrived back from its travels today is always among them.
 */
export function pickHandful(community: Piece[], state: HandfulState, today: string): Piece[] {
  const p = pool(community, state, today);
  const yesterday = shiftDay(today, -1);
  const arrived = new Set(state.outbox.filter((e) => e.returnedOn === yesterday).map((e) => e.piece.id));
  const seed = seedFrom(today);
  const chosen = [...p.filter((x) => arrived.has(x.id)), ...seededShuffle(p.filter((x) => !arrived.has(x.id)), seed)].slice(0, HANDFUL_SIZE);
  return seededShuffle(chosen, seed);
}

/** Resolve a piece id to the version that was handed out today (before any return today). */
export function versionOf(id: string, community: Piece[], state: HandfulState, today: string): Piece | undefined {
  return latestOut(state.outbox, today).get(id)?.piece ?? community.find((p) => p.id === id);
}

// ── Keep / add / return ─────────────────────────────────────────────────────────────────────────

export const borrowedCardId = (pieceId: string) => `b-${pieceId}`;

const PHOTO_PALETTE = ['#E3D6B8', '#8A8B5C', '#6E7148', '#9C7350', '#6B4A33'];

/** A kept piece as a library card. Day-level date only; no author, no source. */
export const pieceImageSrc = (image: string) => (image.startsWith('/') ? image : `/handful/${image}`);

export function pieceToCard(piece: Piece, today: string): Card {
  const base = {
    id: borrowedCardId(piece.id),
    title: piece.title,
    tags: piece.tags,
    origin: 'borrowed' as const,
    pieceId: piece.id,
    hands: piece.hands,
    trail: piece.trail,
    savedAt: `${today}T00:00:00.000Z`,
    ...(piece.image && { cover: pieceImageSrc(piece.image) }),
  };
  switch (piece.kind) {
    case 'quote':
      return { ...base, type: 'quote', quote: piece.body };
    case 'photo':
      return { ...base, type: 'image', caption: piece.body, palette: PHOTO_PALETTE };
    default:
      return { ...base, type: piece.kind, body: piece.body };
  }
}

function randomId(): string {
  // Random, not derived from time, device or person.
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 2 ** 32).toString(16).padStart(8, '0')).join('-');
}

export function newEntry(kind: TrailEntry['kind'], text: string, today: string, imageDataUrl?: string): TrailEntry {
  return { id: randomId(), kind, text: text.trim(), ...(imageDataUrl ? { imageDataUrl } : {}), addedOn: today };
}

/** The piece as it goes back out: your additions appended, one more hand. */
export function passedOn(piece: Piece, pending: TrailEntry[]): Piece {
  return { ...piece, hands: piece.hands + 1, trail: [...piece.trail, ...pending] };
}
