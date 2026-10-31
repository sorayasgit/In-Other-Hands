import { useSyncExternalStore } from 'react';
import { cleanName, deriveCollections, retitle, toggled, type Collection, type CollectionMeta } from './collections';
import sample from './library.json';
import type { Card } from './types';

/**
 * The library: sample cards plus whatever the user keeps or edits, persisted in localStorage.
 * Canvases reference cards by id, so every edit here shows up on every canvas.
 */

const KEY = 'ioh.library.v1';

interface Persisted {
  added: Card[];
  edited: Record<string, Partial<Card>>;
  removed: string[];
  collections: Record<string, CollectionMeta>;
}

function read(): Persisted {
  const empty: Persisted = { added: [], edited: {}, removed: [], collections: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty, ...JSON.parse(raw) };
  } catch {
    /* private mode or corrupt: start fresh */
  }
  return empty;
}

let state = read();
let cards = build();
let collections = deriveCollections(cards, state.collections);
const listeners = new Set<() => void>();

function build(): Card[] {
  const removed = new Set(state.removed);
  return [...(sample as Card[]), ...state.added]
    .filter((c) => !removed.has(c.id))
    .map((c) => (state.edited[c.id] ? { ...c, ...state.edited[c.id] } : c));
}

function commit(next: Persisted) {
  state = next;
  cards = build();
  collections = deriveCollections(cards, state.collections);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota: keep in memory */
  }
  listeners.forEach((l) => l());
}

/** Apply several card patches as one change. */
function patched(base: Persisted, patches: { id: string; patch: Partial<Card> }[]): Persisted {
  const added = [...base.added];
  const edited = { ...base.edited };
  for (const { id, patch } of patches) {
    const i = added.findIndex((c) => c.id === id);
    if (i >= 0) added[i] = { ...added[i], ...patch };
    else edited[id] = { ...edited[id], ...patch };
  }
  return { ...base, added, edited };
}

export const library = {
  all: () => cards,
  get: (id: string) => cards.find((c) => c.id === id),
  collections: () => collections,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  add(card: Omit<Card, 'id' | 'savedAt'>): Card {
    const full: Card = { ...card, id: `u${Date.now().toString(36)}`, savedAt: new Date().toISOString() };
    commit({ ...state, added: [...state.added, full] });
    return full;
  },
  update(id: string, patch: Partial<Card>) {
    commit(patched(state, [{ id, patch }]));
  },
  remove(id: string) {
    commit({ ...state, added: state.added.filter((c) => c.id !== id), removed: [...state.removed, id] });
  },

  // ── Collections ─────────────────────────────────────────────────────────────────────────────
  createCollection(name: string, purpose?: string): string | undefined {
    const n = cleanName(name);
    if (!n || collections.some((c) => c.name.toLowerCase() === n.toLowerCase())) return undefined;
    commit({ ...state, collections: { ...state.collections, [n]: { purpose: purpose?.trim() || undefined, createdAt: new Date().toISOString() } } });
    return n;
  },
  setPurpose(name: string, purpose: string) {
    const prev = state.collections[name] ?? { createdAt: new Date().toISOString() };
    commit({ ...state, collections: { ...state.collections, [name]: { ...prev, purpose: purpose.trim() || undefined } } });
  },
  /** Rename everywhere. Returns the new name, or undefined if it would clash. */
  renameCollection(from: string, to: string): string | undefined {
    const n = cleanName(to);
    if (!n || n === from) return n ? from : undefined;
    if (collections.some((c) => c.name.toLowerCase() === n.toLowerCase())) return undefined;
    const { [from]: meta, ...rest } = state.collections;
    const purpose = meta?.purpose ?? collections.find((c) => c.name === from)?.purpose;
    const next = patched(state, retitle(cards, from, n).map(({ id, collections }) => ({ id, patch: { collections } })));
    commit({ ...next, collections: { ...rest, [n]: { purpose, createdAt: meta?.createdAt ?? new Date().toISOString() } } });
    return n;
  },
  /** Delete the collection. Its cards stay in the library. */
  deleteCollection(name: string) {
    const { [name]: _gone, ...rest } = state.collections;
    const next = patched(state, retitle(cards, name, undefined).map(({ id, collections }) => ({ id, patch: { collections } })));
    commit({ ...next, collections: rest });
  },
  setInCollection(cardId: string, name: string, on: boolean) {
    const card = library.get(cardId);
    if (!card) return;
    const next = patched(state, [{ id: cardId, patch: { collections: toggled(card, name, on) } }]);
    // Keep an emptied collection alive: it still names a context you meant to return to.
    const meta = next.collections[name] ? next.collections : { ...next.collections, [name]: { createdAt: new Date().toISOString(), purpose: collections.find((c) => c.name === name)?.purpose } };
    commit({ ...next, collections: meta });
  },
};

export function useLibrary(): Card[] {
  return useSyncExternalStore(library.subscribe, library.all);
}

export function useCard(id: string | undefined): Card | undefined {
  const all = useLibrary();
  return id ? all.find((c) => c.id === id) : undefined;
}

export function useCollections(): Collection[] {
  return useSyncExternalStore(library.subscribe, library.collections);
}

export type { Collection };
