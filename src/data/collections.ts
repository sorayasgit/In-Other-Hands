import type { Card } from './types';

/**
 * A collection answers "in what context will I want this again?" rather than "what is it about?".
 * Cards hold collection names; a card in three collections is still one card. The purpose — the
 * context of return — is kept alongside, so a collection can exist before anything is in it.
 */

export interface CollectionMeta {
  purpose?: string;
  createdAt: string;
}

export interface Collection {
  name: string;
  purpose?: string;
  cardIds: string[];
  /** Most recent activity: newest member's save date, or creation if empty. */
  updatedAt: string;
}

/** Purposes for the sample library's collections, written as contexts of return. */
export const SAMPLE_PURPOSES: Record<string, string> = {
  'My Canon': 'The ideas I keep coming back to — for when I need to remember what I believe.',
  'Design Inspiration': 'For the start of any new visual brief.',
  'On Collecting': 'Material for the essay on why we gather things before we know why.',
  'Working notes': 'My own half-formed thoughts, to mine when I’m stuck.',
  'Reading list': 'Pieces to read properly on a slow Sunday.',
  Listening: 'Episodes worth a second listen on a long walk.',
  Colour: 'Palette references for packaging and print.',
  'Fold space': 'Research for the folding-furniture installation.',
};

export function deriveCollections(cards: Card[], meta: Record<string, CollectionMeta>): Collection[] {
  const byName = new Map<string, Collection>();
  const ensure = (name: string, createdAt: string) => {
    let c = byName.get(name);
    if (!c) {
      c = { name, purpose: meta[name]?.purpose ?? SAMPLE_PURPOSES[name], cardIds: [], updatedAt: createdAt };
      byName.set(name, c);
    }
    return c;
  };
  for (const [name, m] of Object.entries(meta)) ensure(name, m.createdAt);
  for (const card of cards) {
    for (const name of card.collections ?? []) {
      const c = ensure(name, card.savedAt);
      c.cardIds.push(card.id);
      if (card.savedAt > c.updatedAt) c.updatedAt = card.savedAt;
    }
  }
  return [...byName.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** The card's collections with `name` added or removed. */
export function toggled(card: Card, name: string, on: boolean): string[] {
  const now = card.collections ?? [];
  if (on) return now.includes(name) ? now : [...now, name];
  return now.filter((n) => n !== name);
}

/** Collection patches for every card affected by renaming (to) or deleting (to = undefined). */
export function retitle(cards: Card[], from: string, to: string | undefined): { id: string; collections: string[] }[] {
  return cards
    .filter((c) => c.collections?.includes(from))
    .map((c) => {
      const rest = c.collections!.filter((n) => n !== from);
      return { id: c.id, collections: to && !rest.includes(to) ? [...rest, to] : rest };
    });
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, 60);
}
