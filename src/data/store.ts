import { useSyncExternalStore } from 'react';
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
}

function read(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* private mode or corrupt: start fresh */
  }
  return { added: [], edited: {}, removed: [] };
}

let state = read();
let cards = build();
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
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota: keep in memory */
  }
  listeners.forEach((l) => l());
}

export const library = {
  all: () => cards,
  get: (id: string) => cards.find((c) => c.id === id),
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
    const isAdded = state.added.some((c) => c.id === id);
    commit(
      isAdded
        ? { ...state, added: state.added.map((c) => (c.id === id ? { ...c, ...patch } : c)) }
        : { ...state, edited: { ...state.edited, [id]: { ...state.edited[id], ...patch } } },
    );
  },
  remove(id: string) {
    commit({ ...state, added: state.added.filter((c) => c.id !== id), removed: [...state.removed, id] });
  },
};

export function useLibrary(): Card[] {
  return useSyncExternalStore(library.subscribe, library.all);
}

export function useCard(id: string | undefined): Card | undefined {
  const all = useLibrary();
  return id ? all.find((c) => c.id === id) : undefined;
}
