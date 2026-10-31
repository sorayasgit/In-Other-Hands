import type { Card } from '../data/types';
import { TYPE_LABEL } from '../data/types';

export function savedLabel(card: Card, now = Date.now()): string {
  const t = Date.parse(card.savedAt);
  const days = Math.round((now - t) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: t < now - 300 * 86_400_000 ? 'numeric' : undefined });
}

export function byline(card: Card): string {
  const parts = [TYPE_LABEL[card.type]];
  if (card.source?.author) parts.push(card.source.author);
  else if (card.source?.name) parts.push(card.source.name);
  return parts.join(' · ');
}

/** The single most recognisable piece of text on a card. */
export function gist(card: Card): string {
  return card.quote ?? card.note ?? card.description ?? card.body ?? card.caption ?? '';
}
