import type { Card } from '../data/types';

const STOP = new Set(
  'a an and are as at be been but by for from has have he her his i if in into is it its me my of on or our she so than that the their them then there these they this to was we were what when where which who why will with you your about just very really also'.split(
    ' ',
  ),
);

/** Light suffix stripping so "designing", "designed" and "designs" meet at "design". */
export function stem(w: string): string {
  if (w.length <= 4) return w;
  return w
    .replace(/(ational|tional)$/, 'tion')
    .replace(/(ness|ment|ful|less|ably|ibly)$/, '')
    .replace(/(ies)$/, 'y')
    .replace(/(ing|ed|ers|er|es|ly|s)$/, '')
    .replace(/(e)$/, '');
}

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? [])
    .map((t) => t.replace(/'s$/, ''))
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

/** Field weights: what people remember best (titles, their own notes) counts most. */
const FIELDS: [keyof Card | 'author' | 'sourceName' | 'purpose', number][] = [
  ['title', 3],
  ['note', 2],
  ['quote', 2],
  ['caption', 1.6],
  ['description', 1.4],
  ['context', 1.4],
  ['ocr', 1.2],
  ['body', 1],
  ['tags', 1.5],
  ['collections', 0.8],
  ['purpose', 0.8],
  ['author', 1.5],
  ['sourceName', 1],
];

/** Extra text a card is known by that isn't on the card itself (its collections' purposes). */
export type ContextOf = (card: Card) => string;

function fieldText(card: Card, f: (typeof FIELDS)[number][0], contextOf?: ContextOf): string {
  if (f === 'purpose') return contextOf?.(card) ?? '';
  if (f === 'author') return card.source?.author ?? '';
  if (f === 'sourceName') return card.source?.name ?? '';
  if (f === 'tags') return (card.tags ?? []).join(' ');
  if (f === 'collections') return (card.collections ?? []).join(' ');
  const v = card[f as keyof Card];
  return typeof v === 'string' ? v : '';
}

/** Fields that describe where a card lives, not what it says. They add matches but don't make a word
 * look common: otherwise a collection called "Design Inspiration" would dilute "design" everywhere. */
const CONTEXT_FIELDS = new Set(['collections', 'purpose']);

interface Doc {
  tf: Map<string, number>;
  /** Terms from the card's own content: the ones counted for document frequency. */
  own: Set<string>;
  len: number;
}

/** BM25 with per-field weights folded into term frequency. */
export class LexicalIndex {
  private docs = new Map<string, Doc>();
  private df = new Map<string, number>();
  private avgLen = 1;

  constructor(cards: Card[], private contextOf?: ContextOf) {
    for (const c of cards) this.add(c);
  }

  add(card: Card) {
    this.remove(card.id);
    const tf = new Map<string, number>();
    const own = new Set<string>();
    let len = 0;
    for (const [f, w] of FIELDS) {
      for (const t of tokens(fieldText(card, f, this.contextOf))) {
        tf.set(t, (tf.get(t) ?? 0) + w);
        if (!CONTEXT_FIELDS.has(f)) {
          own.add(t);
          len += w;
        }
      }
    }
    this.docs.set(card.id, { tf, own, len });
    for (const t of own) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.recomputeAvg();
  }

  remove(id: string) {
    const d = this.docs.get(id);
    if (!d) return;
    for (const t of d.own) this.df.set(t, (this.df.get(t) ?? 1) - 1);
    this.docs.delete(id);
    this.recomputeAvg();
  }

  private recomputeAvg() {
    let total = 0;
    for (const d of this.docs.values()) total += d.len;
    this.avgLen = this.docs.size ? total / this.docs.size : 1;
  }

  /** Raw BM25 per card id, plus which query terms each card matched. */
  score(query: string): Map<string, { score: number; matched: string[] }> {
    const q = [...new Set(tokens(query))];
    const n = this.docs.size;
    const out = new Map<string, { score: number; matched: string[] }>();
    const k1 = 1.2;
    const b = 0.75;
    for (const [id, d] of this.docs) {
      let s = 0;
      const matched: string[] = [];
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / this.avgLen)));
        matched.push(t);
      }
      if (s > 0) out.set(id, { score: s, matched });
    }
    return out;
  }
}
