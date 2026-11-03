import { beforeAll, describe, expect, it } from 'vitest';
import communityJson from '../data/community.json';
import { ALLOWED_KEYS, emptyState, HANDFUL_SIZE, newEntry, pickHandful, pool, shiftDay, type HandfulState, type Piece } from './handful';

// The stores persist to localStorage; give Node an in-memory one before they load.
const mem = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
} as Storage;

const community = communityJson as Piece[];
type Stores = {
  handful: typeof import('./store').handful;
  today: typeof import('./store').today;
  library: typeof import('../data/store').library;
  engine: typeof import('../search/searchService').engine;
  canvas: typeof import('../canvas/store');
};
let s: Stores;

beforeAll(async () => {
  const [h, lib, search, canvas] = await Promise.all([import('./store'), import('../data/store'), import('../search/searchService'), import('../canvas/store')]);
  s = { handful: h.handful, today: h.today, library: lib.library, engine: search.engine, canvas };
});

describe("today's handful", () => {
  it('1. same date → same 20; different date → different set; always exactly 20', () => {
    const st = emptyState();
    const a = pickHandful(community, st, '2026-10-31').map((p) => p.id);
    const b = pickHandful(community, st, '2026-10-31').map((p) => p.id);
    const c = pickHandful(community, st, '2026-11-01').map((p) => p.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(HANDFUL_SIZE);
    expect(c).toHaveLength(HANDFUL_SIZE);
    expect([...c].sort()).not.toEqual([...a].sort());
    for (let i = 0; i < 30; i++) expect(pickHandful(community, st, shiftDay('2026-10-31', i))).toHaveLength(HANDFUL_SIZE);
  });

  it('2. Keep adds a borrowed card that Recall finds by a phrase from its body', async () => {
    s.handful.keep('p13');
    const card = s.library.get('b-p13');
    expect(card).toMatchObject({ origin: 'borrowed', pieceId: 'p13', hands: 6 });
    expect(card?.trail).toHaveLength(2);
    const r = await s.engine.search({ query: 'whether clouds have weight' });
    expect(r.results[0]?.card.id).toBe('b-p13');
  });

  it('3. Return removes it from library, canvases and collections; outbox gets hands + 1 and the trail', () => {
    s.handful.keep('p05');
    const cardId = 'b-p05';
    const doc = s.canvas.createCanvas('Test');
    s.canvas.placeOnCanvas(doc.id, cardId);
    expect(Object.values(s.canvas.loadCanvas(doc.id)!.nodes).some((n) => n.kind === 'card' && n.itemId === cardId)).toBe(true);
    s.library.setInCollection(cardId, 'Cooking', true);
    s.handful.addPending('p05', newEntry('note', 'Tried it with chickpeas.', s.today()));

    s.handful.returnPiece('p05');

    expect(s.library.get(cardId)).toBeUndefined();
    expect(Object.values(s.canvas.loadCanvas(doc.id)!.nodes).some((n) => n.kind === 'card' && n.itemId === cardId)).toBe(false);
    expect(s.library.collections().find((c) => c.name === 'Cooking')?.cardIds ?? []).not.toContain(cardId);
    const sent = s.handful.state().outbox.find((e) => e.piece.id === 'p05')!;
    expect(sent.returnedOn).toBe(s.today());
    expect(sent.piece.hands).toBe(7);
    expect(sent.piece.trail.at(-1)?.text).toBe('Tried it with chickpeas.');
    expect(s.handful.state().held).not.toContain('p05');
    expect(s.handful.state().pending.p05).toBeUndefined();
  });

  it('4. a piece returned today is in the pool on day +1, not on day 0', () => {
    const day0 = '2026-10-31';
    const original = community.find((p) => p.id === 'p11')!;
    const st: HandfulState = { ...emptyState(), outbox: [{ piece: { ...original, hands: original.hands + 1 }, returnedOn: day0 }] };
    expect(pool(community, st, day0).some((p) => p.id === 'p11')).toBe(false);
    const tomorrow = pool(community, st, shiftDay(day0, 1)).find((p) => p.id === 'p11');
    expect(tomorrow?.hands).toBe(original.hands + 1);
    // …and tomorrow's handful includes it.
    expect(pickHandful(community, st, shiftDay(day0, 1)).some((p) => p.id === 'p11')).toBe(true);
  });

  it('5. anonymity: stored objects hold only whitelisted keys, no person, no time finer than a day', () => {
    s.handful.keep('p22');
    s.handful.addPending('p22', newEntry('song', 'A song — https://example.com/x', s.today()));
    const borrowed = s.library.get('b-p22')!;
    s.handful.returnPiece('p22');
    const stored = JSON.parse(mem.get('ioh.handful.v1')!);

    const DAY = /^\d{4}-\d{2}-\d{2}$/;
    const only = (obj: object, allowed: readonly string[], where: string) =>
      Object.keys(obj).forEach((k) => expect(allowed, `${where}.${k}`).toContain(k));
    const checkTrail = (t: object[]) =>
      t.forEach((e) => {
        only(e, ALLOWED_KEYS.trail, 'trail');
        expect((e as { addedOn: string }).addedOn).toMatch(DAY);
      });
    const checkPiece = (p: Piece) => {
      only(p, ALLOWED_KEYS.piece, 'piece');
      checkTrail(p.trail);
    };

    only(stored, ALLOWED_KEYS.state, 'state');
    if (stored.snapshot) only(stored.snapshot, ALLOWED_KEYS.snapshot, 'snapshot');
    for (const e of stored.outbox) {
      only(e, ALLOWED_KEYS.outbox, 'outbox');
      expect(e.returnedOn).toMatch(DAY);
      checkPiece(e.piece);
    }
    Object.values(stored.pending as Record<string, object[]>).forEach(checkTrail);
    community.forEach(checkPiece);
    only(borrowed, ALLOWED_KEYS.borrowedCard, 'borrowedCard');
    expect(borrowed.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    checkTrail(borrowed.trail!);

    // Belt and braces: no key anywhere that could name or locate a person.
    const forbidden = /^(author|name|user|userid|user_id|owner|by|from|device|deviceid|ip|email|handle|timestamp|time|createdat|location|gps|filename)$/i;
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v)) {
          expect(k).not.toMatch(forbidden);
          walk(x);
        }
    };
    walk(stored);
    walk(community);
    walk(borrowed);
  });
});
