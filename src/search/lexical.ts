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
const FIELDS: [keyof Card | 'author' | 'sourceName', number][] = [
  ['title', 3],
  ['note', 2],
  ['quote', 2],
  ['caption', 1.6],
  ['description', 1.4],
  ['context', 1.4],
  ['ocr', 1.2],
  ['body', 1],
  ['tags', 1.5],
  ['author', 1.5],
  ['sourceName', 1],
];

function fieldText(card: Card, f: (typeof FIELDS)[number][0]): string {
  if (f === 'author') return card.source?.author ?? '';
  if (f === 'sourceName') return card.source?.name ?? '';
  if (f === 'tags') return (card.tags ?? []).join(' ');
  const v = card[f as keyof Card];
  return typeof v === 'string' ? v : '';
}

interface Doc {
  tf: Map<string, number>;
  len: number;
}

/** BM25 with per-field weights folded into term frequency. */
export class LexicalIndex {
  private docs = new Map<string, Doc>();
  private df = new Map<string, number>();
  private avgLen = 1;

  constructor(cards: Card[]) {
    for (const c of cards) this.add(c);
  }

  add(card: Card) {
    this.remove(card.id);
    const tf = new Map<string, number>();
    let len = 0;
    for (const [f, w] of FIELDS) {
      for (const t of tokens(fieldText(card, f))) {
        tf.set(t, (tf.get(t) ?? 0) + w);
        len += w;
      }
    }
    this.docs.set(card.id, { tf, len });
    for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.recomputeAvg();
  }

  remove(id: string) {
    const d = this.docs.get(id);
    if (!d) return;
    for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) ?? 1) - 1);
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
