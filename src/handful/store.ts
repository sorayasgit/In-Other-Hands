import { useSyncExternalStore } from 'react';
import { removeItemFromAllCanvases } from '../canvas/store';
import communityJson from '../data/community.json';
import { library } from '../data/store';
import type { TrailEntry } from '../data/types';
import { borrowedCardId, emptyState, localDay, passedOn, pickHandful, pieceToCard, versionOf, type HandfulState, type Piece } from './handful';

const KEY = 'ioh.handful.v1';
export const community = communityJson as Piece[];

function read(): HandfulState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...emptyState(), ...JSON.parse(raw) };
  } catch {
    /* private mode or corrupt: start fresh */
  }
  return emptyState();
}

let state = read();
const listeners = new Set<() => void>();

function commit(next: HandfulState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota: keep in memory */
  }
  listeners.forEach((l) => l());
}

export const today = () => localDay(new Date(), state.dayOffset);

/** Recording helpers: ?day=N shows the handful N days ahead (0 clears); ?reset=1 forgets the handful only. */
export function applyUrlFlags(params: URLSearchParams) {
  if (params.get('reset') === '1') {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    commit(emptyState());
  }
  const day = params.get('day');
  if (day !== null && Number.isFinite(Number(day))) commit({ ...state, dayOffset: Math.max(0, Math.round(Number(day))), snapshot: undefined });
}

export const handful = {
  state: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  /** Today's 20 piece ids: the day's fixed set if there is one, else a fresh pick. */
  todayIds(): string[] {
    const day = today();
    return state.snapshot?.day === day ? state.snapshot.ids : pickHandful(community, state, day).map((p) => p.id);
  },

  /** Fix today's set so keeping or returning doesn't reshuffle it (call outside render). */
  settleToday() {
    const day = today();
    if (state.snapshot?.day !== day) commit({ ...state, snapshot: { day, ids: handful.todayIds() } });
  },

  piece(id: string): Piece | undefined {
    return versionOf(id, community, state, today());
  },

  isHeld: (id: string) => state.held.includes(id),
  returnedToday: (id: string) => state.outbox.some((e) => e.piece.id === id && e.returnedOn === today()),

  /** Copy the piece into the library as a borrowed card. Recall indexes it like any other card. */
  keep(id: string) {
    const piece = handful.piece(id);
    if (!piece || state.held.includes(id)) return;
    const { id: cardId, savedAt, ...card } = pieceToCard(piece, today());
    library.add(card, { id: cardId, savedAt });
    commit({ ...state, held: [...state.held, id] });
  },

  addPending(id: string, entry: TrailEntry) {
    if (!state.held.includes(id) || (!entry.text && !entry.imageDataUrl)) return;
    commit({ ...state, pending: { ...state.pending, [id]: [...(state.pending[id] ?? []), entry] } });
  },

  removePending(id: string, entryId: string) {
    const rest = (state.pending[id] ?? []).filter((e) => e.id !== entryId);
    const { [id]: _, ...others } = state.pending;
    commit({ ...state, pending: rest.length ? { ...others, [id]: rest } : others });
  },

  /**
   * The one action that sends anything out. Appends your additions, adds a hand, and puts the piece
   * in the outbox; the borrowed card leaves the library, its canvases and its collections.
   */
  returnPiece(id: string) {
    const piece = handful.piece(id);
    if (!piece || !state.held.includes(id)) return;
    const { [id]: pending = [], ...otherPending } = state.pending;
    // SIMULATED: replace outbox with a server call
    const outbox = [...state.outbox, { piece: passedOn(piece, pending), returnedOn: today() }];
    commit({ ...state, held: state.held.filter((h) => h !== id), pending: otherPending, outbox });
    const cardId = borrowedCardId(id);
    removeItemFromAllCanvases(cardId);
    library.remove(cardId);
  },
};

export function useHandful(): HandfulState {
  return useSyncExternalStore(handful.subscribe, handful.state);
}
