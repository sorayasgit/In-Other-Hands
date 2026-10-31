import type { Card } from '../data/types';

/**
 * Sample image cards have no real photo, so they are drawn as an abstract composition from their
 * palette (deterministic per card). A real library would show the saved image here.
 */

function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export function CardArt({ card, ratio = 0.72 }: { card: Card; ratio?: number }) {
  const p = card.palette ?? ['#d9d2c3', '#b7ad9a', '#8a8170'];
  const r = rng(card.id);
  const h = 100 * ratio;
  const shapes = Array.from({ length: 5 }, (_, i) => {
    const color = p[(i + 1) % p.length];
    const kind = r();
    const x = r() * 100;
    const y = r() * h;
    const s = 18 + r() * 46;
    if (kind < 0.4) return <circle key={i} cx={x} cy={y} r={s / 2} fill={color} opacity={0.9} />;
    if (kind < 0.75) return <rect key={i} x={x - s / 2} y={y - s / 3} width={s} height={s * 0.66} fill={color} opacity={0.88} />;
    return <rect key={i} x={0} y={y} width={100} height={4 + r() * 12} fill={color} opacity={0.7} />;
  });
  return (
    <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="xMidYMid slice" style={{ display: 'block', width: '100%', height: '100%' }} role="img" aria-label={card.caption ?? card.title}>
      <rect width="100" height={h} fill={p[0]} />
      {shapes}
    </svg>
  );
}

const TYPE_GLYPH: Record<string, string> = {
  article: 'Aa',
  quote: '“',
  note: '✎',
  link: '↗',
  book: '❡',
  podcast: '◉',
  video: '▸',
  highlight: '❝',
};

export function CardThumb({ card }: { card: Card }) {
  if (card.type === 'image') return <CardArt card={card} ratio={1} />;
  return <span aria-hidden>{TYPE_GLYPH[card.type] ?? '·'}</span>;
}
