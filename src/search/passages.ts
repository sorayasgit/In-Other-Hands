import type { Card } from '../data/types';

export type PassageField = 'quote' | 'body' | 'description' | 'note' | 'caption' | 'ocr' | 'context' | 'title';

export interface Passage {
  field: PassageField;
  text: string;
}

const FIELD_ORDER: PassageField[] = ['quote', 'note', 'description', 'body', 'caption', 'ocr', 'context'];

/** Everything about a card, as one block of text for the whole-card vector. */
export function cardDocument(card: Card): string {
  const parts = [
    card.title,
    card.quote,
    card.description,
    card.body,
    card.caption,
    card.ocr,
    card.note,
    card.context,
    card.source?.author,
    card.source?.name,
    card.tags?.join(', '),
  ];
  return parts.filter(Boolean).join('. ');
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"'“‘(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Split a card into short passages (one to three sentences, ≤ ~45 words) so a single remembered
 * line can surface a long piece, and so we can show the line that matched.
 */
export function cardPassages(card: Card): Passage[] {
  const out: Passage[] = [];
  for (const field of FIELD_ORDER) {
    const text = card[field as keyof Card];
    if (typeof text !== 'string' || !text.trim()) continue;
    let buf: string[] = [];
    let words = 0;
    for (const s of sentences(text)) {
      const w = s.split(' ').length;
      if (buf.length && (words + w > 45 || buf.length >= 3)) {
        out.push({ field, text: buf.join(' ') });
        buf = [];
        words = 0;
      }
      buf.push(s);
      words += w;
    }
    if (buf.length) out.push({ field, text: buf.join(' ') });
  }
  return out;
}
