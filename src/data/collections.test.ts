import { describe, expect, it } from 'vitest';
import { deriveCollections, retitle, SAMPLE_PURPOSES, toggled } from './collections';
import library from './library.json';
import type { Card } from './types';

const cards = library as Card[];

describe('collections', () => {
  it('derives every collection named on a card, with its purpose', () => {
    const cs = deriveCollections(cards, {});
    const names = cs.map((c) => c.name);
    for (const n of Object.keys(SAMPLE_PURPOSES)) expect(names).toContain(n);
    expect(cs.find((c) => c.name === 'Colour')?.purpose).toMatch(/packaging/);
  });

  it('one card in several collections is still one card', () => {
    const cs = deriveCollections(cards, {});
    const inBoth = cs.find((c) => c.name === 'My Canon')!.cardIds.filter((id) => cs.find((c) => c.name === 'Design Inspiration')!.cardIds.includes(id));
    expect(inBoth).toContain('c26');
    expect(cards.filter((c) => c.id === 'c26')).toHaveLength(1);
  });

  it('keeps a collection that has a purpose but no cards yet', () => {
    const cs = deriveCollections(cards, { 'Essay: slow tools': { purpose: 'for the essay', createdAt: '2026-10-31T00:00:00Z' } });
    expect(cs.find((c) => c.name === 'Essay: slow tools')).toMatchObject({ cardIds: [], purpose: 'for the essay' });
  });

  it('a stored purpose overrides the sample one', () => {
    const cs = deriveCollections(cards, { Colour: { purpose: 'mine now', createdAt: '2026-01-01T00:00:00Z' } });
    expect(cs.find((c) => c.name === 'Colour')?.purpose).toBe('mine now');
  });

  it('toggles membership without duplicates', () => {
    const c = cards.find((x) => x.id === 'c03')!;
    expect(toggled(c, 'Colour', true)).toEqual(c.collections);
    expect(toggled(c, 'Colour', false)).not.toContain('Colour');
    expect(toggled(c, 'Harvest', true)).toContain('Harvest');
  });

  it('renaming and deleting touch only member cards', () => {
    const renamed = retitle(cards, 'Colour', 'Palettes');
    expect(renamed.length).toBe(cards.filter((c) => c.collections?.includes('Colour')).length);
    expect(renamed.every((p) => p.collections.includes('Palettes') && !p.collections.includes('Colour'))).toBe(true);
    const deleted = retitle(cards, 'Colour', undefined);
    expect(deleted.every((p) => !p.collections.includes('Colour'))).toBe(true);
  });
});
