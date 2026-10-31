import { useSyncExternalStore } from 'react';
import vectorsFile from '../data/library-vectors.json';
import { library } from '../data/store';
import type { Card } from '../data/types';
import { SearchEngine, type CardVectors } from './engine';
import type { Embedder } from './model';
import { cardDocument, cardPassages } from './passages';
import { decodeInt8, type Vec } from './vectors';

/**
 * One engine for the whole app. It starts with keyword + context search immediately, then turns on
 * meaning-based search as soon as the model has loaded in the worker (a one-time ~33 MB download,
 * cached by the browser afterwards).
 */

type Status = 'loading' | 'ready' | 'unavailable';

const precomputed = new Map<string, CardVectors>();
for (const [id, v] of Object.entries((vectorsFile as { cards: Record<string, { doc: string; passages: string[] }> }).cards)) {
  precomputed.set(id, { doc: decodeInt8(v.doc), passages: v.passages.map(decodeInt8) });
}

/** A card is also known by why its collections exist ("for the packaging pitch"). */
const purposes = () => new Map(library.collections().map((c) => [c.name, c.purpose ?? '']));
let purposeOf = purposes();
const contextOf = (card: Card) => (card.collections ?? []).map((n) => purposeOf.get(n) ?? '').join(' ');

export const engine = new SearchEngine(library.all(), precomputed, undefined, contextOf);

let status: Status = 'loading';
let snapshot: { status: Status; revision: number } = { status, revision: 0 };
const listeners = new Set<() => void>();
const notify = () => {
  snapshot = { status, revision: snapshot.revision + 1 };
  listeners.forEach((l) => l());
};
const setStatus = (s: Status) => {
  status = s;
  notify();
};

let seq = 0;
const pending = new Map<number, { resolve: (v: Vec[]) => void; reject: (e: unknown) => void }>();
let worker: Worker | undefined;

function call(msg: { op: 'warm' } | { op: 'query'; text: string } | { op: 'docs'; texts: string[] }): Promise<Vec[]> {
  if (!worker) return Promise.reject(new Error('no worker'));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, ...msg });
  });
}

const workerEmbedder: Embedder = {
  embedQuery: async (text) => (await call({ op: 'query', text }))[0],
  embedDocs: (texts) => call({ op: 'docs', texts }),
};

export function startSemanticSearch() {
  if (worker || typeof Worker === 'undefined') return;
  worker = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.vecs ?? []);
    else p.reject(new Error(e.data.error));
  };
  call({ op: 'warm' })
    .then(async () => {
      engine.setEmbedder(workerEmbedder);
      setStatus('ready');
      // Cards kept or edited since the vectors were built need their own vectors.
      for (const card of library.all()) if (!precomputed.has(card.id) || editedSinceBuild(card)) await reindex(card);
    })
    .catch(() => setStatus('unavailable'));
}

const edited = new Set<string>();
const editedSinceBuild = (c: Card) => edited.has(c.id);

const currentVectors = (id: string) => engine.vectorsOf(id);

async function reindex(card: Card) {
  const passages = cardPassages(card).map((p) => p.text);
  try {
    const [doc, ...pv] = await workerEmbedder.embedDocs([cardDocument(card), ...passages]);
    engine.upsert(card, { doc, passages: pv });
    notify();
  } catch {
    /* keep lexical-only for this card */
  }
}

// Keep the engine in step with the library.
let known = new Map(library.all().map((c) => [c.id, c]));
library.subscribe(() => {
  const next = new Map(library.all().map((c) => [c.id, c]));
  const nextPurposes = purposes();
  const changedPurpose = new Set([...nextPurposes].filter(([n, p]) => purposeOf.get(n) !== p).map(([n]) => n));
  purposeOf = nextPurposes;
  for (const [id, card] of next) {
    if (known.get(id) === card) {
      // Only its collections' purpose changed: words to match, not meaning to re-embed.
      if (card.collections?.some((n) => changedPurpose.has(n))) engine.upsert(card, currentVectors(id));
      continue;
    }
    edited.add(id);
    // Words now; keep the old overall meaning until new vectors arrive. Old passage vectors would no
    // longer line up with the edited text, so they're dropped.
    const old = currentVectors(id);
    engine.upsert(card, old && { doc: old.doc, passages: [] });
    if (status === 'ready') void reindex(card);
  }
  for (const id of known.keys()) if (!next.has(id)) engine.remove(id);
  known = next;
  notify();
});

/** Semantic status plus a revision that bumps whenever the engine's contents change. */
export function useSearchService(): { status: Status; revision: number } {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}
