import { beforeAll, describe, expect, it } from 'vitest';
import { deriveCollections } from '../data/collections';
import library from '../data/library.json';
import vectorsFile from '../data/library-vectors.json';
import type { Card } from '../data/types';
import { SearchEngine, type CardVectors } from './engine';
import { localEmbedder } from './model';
import { parseRefinement } from './understand';
import { decodeInt8 } from './vectors';

// Real model, real library: these are the searches from the brief.
const NOW = Date.parse('2026-10-31T12:00:00Z');
let engine: SearchEngine;

const rank = async (query: string, id: string, extra: Parameters<SearchEngine['search']>[0] = { query }) => {
  const r = await engine.search({ now: NOW, ...extra, query });
  return { pos: r.results.findIndex((x) => x.card.id === id), r };
};

beforeAll(() => {
  const vecs = new Map<string, CardVectors>();
  for (const [id, v] of Object.entries(vectorsFile.cards)) {
    vecs.set(id, { doc: decodeInt8(v.doc), passages: v.passages.map(decodeInt8) });
  }
  engine = new SearchEngine(library as Card[], vecs, localEmbedder);
}, 120_000);

describe('find the thing, however you remember it', () => {
  const cases: [string, string, number][] = [
    ['That article I read about how good design is invisible.', 'c01', 1],
    ['Something about creativity being more important than productivity.', 'c02', 3],
    ['The image I saved with the orange and brown color palette.', 'c03', 3],
    ['That quote about how children learn through curiosity.', 'c04', 1],
    ['Something I saved a few months ago about the relationship between technology and human behavior.', 'c05', 1],
    ['The article that made me think differently about the internet.', 'c06', 2],
    ["That idea about collecting things without knowing what you'll use them for.", 'c07', 2],
  ];
  for (const [q, id, within] of cases) {
    it(`${q} → ${id} in top ${within}`, async () => {
      const { pos, r } = await rank(q, id);
      if (pos < 0 || pos >= within) console.log(q, r.understanding, r.results.slice(0, 5).map((x) => [x.card.id, x.card.title, x.score.toFixed(3)]));
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThan(within);
    });
  }

  it('reads memory cues as soft hints, not filters', async () => {
    const r = await engine.search({ query: 'the quote I saved a few months ago about teaching', now: NOW });
    expect(r.understanding.types).toContain('quote');
    expect(r.understanding.time?.label).toBe('a few months ago');
    expect(r.results.some((x) => x.card.type !== 'quote' && x.card.type !== 'highlight')).toBe(true);
  });

  it('finds a card by where it was used', async () => {
    const { pos } = await rank('the packaging pitch for that food brand', 'c41');
    expect(pos).toBeLessThan(2);
  });

  it('finds an image by text inside it', async () => {
    const { pos } = await rank('poster that said painted desert', 'c10');
    expect(pos).toBe(0);
  });

  it('admits when nothing matches well', async () => {
    const r = await engine.search({ query: 'quantum chromodynamics lattice gauge', now: NOW });
    expect(r.confident).toBe(false);
  });
});

describe('refining without a conversation', () => {
  it('"no, it was more about design" pulls design to the top', async () => {
    const q = 'something about attention';
    const before = await engine.search({ query: q, now: NOW });
    const after = await engine.search({ query: q, refinements: parseRefinement('no, it was more about design', NOW), now: NOW });
    const designIn = (rs: typeof before) => rs.results.slice(0, 3).filter((x) => x.card.tags?.includes('design')).length;
    expect(designIn(after)).toBeGreaterThan(designIn(before));
  });

  it('"I think it was a quote" prefers quotes', async () => {
    const r = await engine.search({ query: 'learning', refinements: parseRefinement('I think it was a quote', NOW), now: NOW });
    expect(['quote', 'highlight']).toContain(r.results[0].card.type);
  });

  it('"it had something to do with creativity" narrows to creativity', async () => {
    const refs = parseRefinement('It had something to do with creativity', NOW);
    expect(refs[0]).toMatchObject({ kind: 'more', text: 'creativity' });
  });

  it('"show me things saved around the same time" centres on the anchor', async () => {
    const r = await engine.search({ query: 'kiln room', refinements: parseRefinement('show me things saved around the same time', NOW), anchorId: 'c03', now: NOW });
    const ids = r.results.slice(0, 5).map((x) => x.card.id);
    expect(ids).toEqual(expect.arrayContaining(['c36', 'c41']));
  });

  it('"not about productivity" demotes productivity', async () => {
    const r = await engine.search({ query: 'how to work well', refinements: parseRefinement('not about productivity', NOW), now: NOW });
    const top3 = r.results.slice(0, 3).map((x) => x.card.id);
    expect(top3).not.toContain('c15');
    expect(top3).not.toContain('c32');
  });
});

describe('collections as contexts of return', () => {
  it('searches inside one collection only', async () => {
    const within = new Set((library as Card[]).filter((c) => c.collections?.includes('My Canon')).map((c) => c.id));
    const r = await engine.search({ query: 'design', within, now: NOW });
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results.every((x) => within.has(x.card.id))).toBe(true);
  });

  it('finds cards by why their collection exists', async () => {
    const purposes = deriveCollections(library as Card[], {});
    const purposeOf = new Map(purposes.map((c) => [c.name, c.purpose ?? '']));
    const vecs = new Map<string, CardVectors>();
    for (const [id, v] of Object.entries(vectorsFile.cards)) vecs.set(id, { doc: decodeInt8(v.doc), passages: v.passages.map(decodeInt8) });
    const withContext = new SearchEngine(library as Card[], vecs, localEmbedder, (c) => (c.collections ?? []).map((n) => purposeOf.get(n) ?? '').join(' '));
    const r = await withContext.search({ query: 'references for packaging and print', now: NOW });
    const top = r.results.slice(0, 5).map((x) => x.card);
    expect(top.filter((c) => c.collections?.includes('Colour')).length).toBeGreaterThanOrEqual(3);
  });
});

describe('connections', () => {
  it('related to the magpie essay finds other collecting cards', () => {
    const ids = engine.related('c07', 5).map((r) => r.card.id);
    expect(ids.filter((id) => ['c23', 'c22', 'c29', 'c37', 'c54', 'c35'].includes(id)).length).toBeGreaterThanOrEqual(3);
  });

  it('bridges between a craft book and a learning quote are about learning by doing', () => {
    const b = engine.bridges(['c13', 'c04'], 5).map((r) => r.card.id);
    expect(b.some((id) => ['c20', 'c38', 'c48', 'c14', 'c31'].includes(id))).toBe(true);
  });
});
