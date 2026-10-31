import type { Card, CardType } from '../data/types';
import { paletteMatch } from './colors';
import { LexicalIndex, stem, tokens } from './lexical';
import type { Embedder } from './model';
import { cardPassages, type Passage, type PassageField } from './passages';
import { understand, type Refinement, type TimeWindow, type Understanding } from './understand';
import { blend, centroid, dot, type Vec } from './vectors';

export interface CardVectors {
  doc: Vec;
  passages: Vec[];
}

export interface SearchRequest {
  query: string;
  refinements?: Refinement[];
  /** Hint ids the user dismissed ("not a quote, actually"). */
  ignoredHints?: ReadonlySet<string>;
  /** For "around the same time": the card to centre on. Defaults to the current top result. */
  anchorId?: string;
  now?: number;
  limit?: number;
}

export interface SearchResult {
  card: Card;
  score: number;
  /** The passage that best matches, for display. */
  passage?: Passage;
  /** Stemmed query terms that appear in the card — used to highlight. */
  matched: string[];
  /** One or two short reasons this surfaced. */
  why: string[];
}

export interface SearchResponse {
  understanding: Understanding;
  results: SearchResult[];
  /** False when nothing is a strong match; the UI says so instead of pretending. */
  confident: boolean;
  semantic: boolean;
}

const DAY = 86_400_000;

// Calibrated for bge-small cosine similarity on this kind of text: unrelated ≈ 0.45–0.55,
// clearly related ≈ 0.65+, near-paraphrase ≈ 0.8+.
const SEM_FLOOR = 0.5;
const SEM_SPAN = 0.3;
const W_SEM = 0.62;
const W_LEX = 0.28;

const FIELD_WHY: Partial<Record<PassageField, string>> = {
  note: 'matched your note',
  caption: 'from what’s in the image',
  ocr: 'from text in the image',
  context: 'from where you used it',
  quote: 'in the quote itself',
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const time = (c: Card) => Date.parse(c.savedAt);
const typeMatches = (card: CardType, wanted: CardType) =>
  card === wanted || (wanted === 'quote' && card === 'highlight') || (wanted === 'highlight' && card === 'quote');

function timeBoost(t: number, w: TimeWindow, inside: number) {
  if (t >= w.from && t <= w.to) return inside;
  const dist = t < w.from ? w.from - t : t - w.to;
  return inside * Math.exp(-dist / (21 * DAY)) - 0.04;
}

const monthYear = (t: number) => new Date(t).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export class SearchEngine {
  private cards = new Map<string, Card>();
  private passages = new Map<string, Passage[]>();
  private vectors = new Map<string, CardVectors>();
  private lexical: LexicalIndex;

  constructor(cards: Card[], vectors: Map<string, CardVectors>, private embedder?: Embedder) {
    for (const c of cards) {
      this.cards.set(c.id, c);
      this.passages.set(c.id, cardPassages(c));
    }
    this.vectors = vectors;
    this.lexical = new LexicalIndex(cards);
  }

  setEmbedder(e: Embedder | undefined) {
    this.embedder = e;
  }

  get semanticReady() {
    return !!this.embedder;
  }

  upsert(card: Card, vecs?: CardVectors) {
    this.cards.set(card.id, card);
    this.passages.set(card.id, cardPassages(card));
    this.lexical.add(card);
    if (vecs) this.vectors.set(card.id, vecs);
    else this.vectors.delete(card.id);
  }

  remove(id: string) {
    this.cards.delete(id);
    this.passages.delete(id);
    this.vectors.delete(id);
    this.lexical.remove(id);
  }

  vectorOf(id: string): Vec | undefined {
    return this.vectors.get(id)?.doc;
  }

  async search(req: SearchRequest): Promise<SearchResponse> {
    const now = req.now ?? Date.now();
    const refinements = req.refinements ?? [];
    const u = understand(req.query, now, req.ignoredHints);

    // Fold refinements into the understanding.
    let types = [...u.types];
    const colors = [...u.colors];
    let window = u.time;
    const more: string[] = [];
    const less: string[] = [];
    let nearTime = false;
    let shift: 'older' | 'newer' | undefined;
    for (const r of refinements) {
      if (r.kind === 'type') types = [r.type];
      else if (r.kind === 'more') more.push(r.text);
      else if (r.kind === 'less') less.push(r.text);
      else if (r.kind === 'time') window = r.window;
      else if (r.kind === 'color') colors.push(...r.colors.filter((c) => !colors.includes(c)));
      else if (r.kind === 'near-time') nearTime = true;
      else shift = r.kind;
    }
    if (colors.length && !types.includes('image')) types.push('image');

    const lexQuery = [u.focus ?? u.core, ...more].join(' ').trim();
    const semText = u.core || (more.length ? '' : '');
    const useSem = !!this.embedder && (semText.length > 0 || more.length > 0);

    let q: Vec | undefined;
    const lessVecs: Vec[] = [];
    let sides: [Vec, Vec] | undefined;
    if (useSem && this.embedder) {
      const [base, ...extra] = await Promise.all([
        semText ? this.embedder.embedQuery(semText) : Promise.resolve(undefined),
        ...more.map((m) => this.embedder!.embedQuery(m)),
      ]);
      q = base;
      for (const e of extra) if (e) q = q ? blend(q, e, 0.7) : e;
      for (const l of less) lessVecs.push(await this.embedder.embedQuery(l));
      if (u.focus && u.contrast) sides = [await this.embedder.embedQuery(u.focus), await this.embedder.embedQuery(u.contrast)];
    }

    const lex = lexQuery ? this.lexical.score(lexQuery) : new Map();
    const hasTextQuery = !!lexQuery || !!q;

    type Scored = { card: Card; base: number; sem: number; lex: number; best?: Passage; bestSem: number; matched: string[]; why: string[] };
    const scored: Scored[] = [];

    for (const card of this.cards.values()) {
      const vecs = this.vectors.get(card.id);
      const ps = this.passages.get(card.id) ?? [];
      let sem = 0;
      let best: Passage | undefined;
      let bestSem = -1;
      if (q && vecs) {
        sem = dot(q, vecs.doc);
        vecs.passages.forEach((pv, i) => {
          const s = dot(q!, pv);
          if (s > bestSem) {
            bestSem = s;
            best = ps[i];
          }
        });
        sem = Math.max(sem, bestSem);
      }
      const l = lex.get(card.id);
      const lexN = l ? 1 - Math.exp(-l.score / 4) : 0;
      const semN = q ? clamp01((sem - SEM_FLOOR) / SEM_SPAN) : 0;

      let base = hasTextQuery ? (q ? W_SEM * semN + W_LEX * lexN : 0.9 * lexN) : 0;
      const why: string[] = [];

      for (const lv of lessVecs) if (vecs) base -= 0.9 * Math.max(0, dot(lv, vecs.doc) - SEM_FLOOR);
      // "A over B" is about the tension between them: reward cards that engage both sides.
      if (sides && vecs) base += 0.25 * clamp01((Math.min(dot(sides[0], vecs.doc), dot(sides[1], vecs.doc)) - SEM_FLOOR) / 0.2);

      if (types.length) {
        // A remembered kind ("that quote") is usually right, so it counts — but a strong match of
        // another kind can still outrank it.
        if (types.some((t) => typeMatches(card.type, t))) base += hasTextQuery ? 0.26 : 0.3;
        else base -= 0.14;
      }
      if (colors.length) {
        const pm = paletteMatch(card.palette, colors);
        base += pm * 0.4;
        if (pm > 0.45) why.push(`palette: ${colors.join(', ')}`);
      }
      if (window) {
        const tb = timeBoost(time(card), window, hasTextQuery ? 0.1 : 0.3);
        base += tb;
        if (tb > 0.08) why.push(`saved ${monthYear(time(card))}`);
      }

      // If no passage won semantically, prefer one containing a matched word.
      const matched = l?.matched ?? [];
      if (!best && matched.length) best = ps.find((p) => tokens(p.text).some((t) => matched.includes(t)));
      // For an image found by colour or kind, what's *in* it is the recognisable part.
      if (!best && card.type === 'image') best = ps.find((p) => p.field === 'caption');
      if (best && FIELD_WHY[best.field] && (bestSem > SEM_FLOOR + 0.1 || matched.length)) why.unshift(FIELD_WHY[best.field]!);
      if (q && semN > 0.45 && lexN < 0.15) why.push('same idea, different words');

      scored.push({ card, base, sem: semN, lex: lexN, best, bestSem, matched, why });
    }

    // Second pass: refinements that depend on what the first pass found.
    if (nearTime || shift) {
      const ranked = [...scored].sort((a, b) => b.base - a.base);
      const anchor = (req.anchorId && scored.find((s) => s.card.id === req.anchorId)) || ranked[0];
      const at = anchor ? time(anchor.card) : now;
      for (const s of scored) {
        const t = time(s.card);
        if (nearTime) {
          const d = Math.abs(t - at) / DAY;
          s.base = 0.35 * s.base + 0.6 * Math.exp(-d / 12);
          if (d <= 14 && s !== anchor) s.why.unshift(`saved ${d < 1 ? 'the same day' : `${Math.round(d)} days ${t < at ? 'before' : 'after'}`}`);
        } else if (shift === 'older') s.base += t < at - 7 * DAY ? 0.12 : -0.1;
        else if (shift === 'newer') s.base += t > at + 7 * DAY ? 0.12 : -0.1;
      }
    }

    const sorted = hasTextQuery || types.length || colors.length || window || nearTime
      ? scored.sort((a, b) => b.base - a.base)
      : scored.sort((a, b) => time(b.card) - time(a.card));

    const limit = req.limit ?? 24;
    const top = sorted[0]?.base ?? 0;
    // Keep the list honest: drop the long tail once results are clearly weaker than the best.
    const cutoff = hasTextQuery ? Math.max(0.12, top * 0.42) : -Infinity;
    const results = sorted
      .filter((s, i) => i < 3 || s.base >= cutoff)
      .slice(0, limit)
      .map((s) => ({ card: s.card, score: s.base, passage: s.best, matched: s.matched, why: [...new Set(s.why)].slice(0, 2) }));

    return {
      understanding: { ...u, types, colors, time: window },
      results,
      confident: !hasTextQuery || top >= 0.42,
      semantic: !!q,
    };
  }

  /** Nearest cards to a card or a vector, by meaning. */
  related(seed: string | Vec, k = 8, exclude: ReadonlySet<string> = new Set()): { card: Card; sim: number }[] {
    const v = typeof seed === 'string' ? this.vectorOf(seed) : seed;
    if (!v) return [];
    const out: { card: Card; sim: number }[] = [];
    for (const [id, vecs] of this.vectors) {
      if (id === seed || exclude.has(id)) continue;
      const card = this.cards.get(id);
      if (card) out.push({ card, sim: dot(v, vecs.doc) });
    }
    return out.sort((a, b) => b.sim - a.sim).slice(0, k);
  }

  /** Cards close to *all* of the given cards — possible bridges between ideas. */
  bridges(ids: string[], k = 6, exclude: ReadonlySet<string> = new Set()): { card: Card; sim: number }[] {
    const vs = ids.map((id) => this.vectorOf(id)).filter((v): v is Vec => !!v);
    if (vs.length < 2) return [];
    const out: { card: Card; sim: number }[] = [];
    for (const [id, vecs] of this.vectors) {
      if (ids.includes(id) || exclude.has(id)) continue;
      const card = this.cards.get(id);
      if (card) out.push({ card, sim: Math.min(...vs.map((v) => dot(v, vecs.doc))) });
    }
    return out.sort((a, b) => b.sim - a.sim).slice(0, k);
  }

  /** Neither obvious nor random: things at a middle distance from the seed. */
  unexpected(ids: string[], k = 4, exclude: ReadonlySet<string> = new Set()): { card: Card; sim: number }[] {
    const c = centroid(ids.map((id) => this.vectorOf(id)).filter((v): v is Vec => !!v));
    if (!c) return [];
    const all = this.related(c, this.vectors.size, new Set([...exclude, ...ids]));
    const mid = all.filter((r) => r.sim > 0.55 && r.sim < 0.66);
    return (mid.length >= k ? mid : all.slice(Math.floor(all.length / 3))).slice(0, k);
  }

  /** Pairs among the given cards that are close in meaning — candidate links. */
  affinities(ids: string[], threshold = 0.7): { a: string; b: string; sim: number }[] {
    const out: { a: string; b: string; sim: number }[] = [];
    for (let i = 0; i < ids.length; i++) {
      const va = this.vectorOf(ids[i]);
      if (!va) continue;
      for (let j = i + 1; j < ids.length; j++) {
        const vb = this.vectorOf(ids[j]);
        if (!vb) continue;
        const sim = dot(va, vb);
        if (sim >= threshold) out.push({ a: ids[i], b: ids[j], sim });
      }
    }
    return out.sort((x, y) => y.sim - x.sim);
  }
}

/** Split text into runs, marking words whose stem is in `matched`, for highlighting. */
export function highlightRuns(text: string, matched: string[]): { text: string; hit: boolean }[] {
  if (!matched.length) return [{ text, hit: false }];
  const set = new Set(matched);
  return text.split(/(\b[\w']+\b)/).map((part) => ({ text: part, hit: /\w/.test(part) && set.has(stem(part.toLowerCase().replace(/'s$/, ''))) }));
}
