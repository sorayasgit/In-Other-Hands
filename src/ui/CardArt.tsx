import type { Card } from '../data/types';
import { Picture } from './Picture';

/**
 * Sample image cards have no real photo, so they are drawn as an abstract composition from their
 * palette (deterministic per card). Cards with a real picture (`cover`) show that instead.
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
  if (card.cover) return <Picture src={card.cover} alt={card.caption ?? card.title} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />;
  const p = card.palette ?? ['#d9d2c3', '#b7ad9a', '#8a8170'];
  const r = rng(card.id);
  const h = 100 * ratio;
  if (card.tags?.includes('pattern')) return <Halftone palette={p} h={h} seed={r} label={card.caption ?? card.title} />;
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

/** Pattern studies: a halftone field whose dots swell toward a couple of soft centres. */
function Halftone({ palette, h, seed, label }: { palette: string[]; h: number; seed: () => number; label: string }) {
  const centres = [0, 1].map(() => ({ x: 20 + seed() * 60, y: h * (0.2 + seed() * 0.6) }));
  const inks = palette.slice(1);
  const dots = [];
  for (let y = 3; y < h; y += 6) {
    for (let x = 3 + ((y / 6) % 2) * 3; x < 100; x += 6) {
      const near = Math.max(...centres.map((c) => 1 - Math.hypot(x - c.x, y - c.y) / 45));
      const r = Math.max(0, near) * 2.9;
      if (r < 0.35) continue;
      dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={inks[Math.floor((x + y) / 18) % inks.length]} />);
    }
  }
  return (
    <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="xMidYMid slice" style={{ display: 'block', width: '100%', height: '100%' }} role="img" aria-label={label}>
      <rect width="100" height={h} fill={palette[0]} />
      {dots}
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
  song: '♪',
  recipe: '❦',
};

export function CardThumb({ card }: { card: Card }) {
  if (card.type === 'image' || card.cover) return <CardArt card={card} ratio={1} />;
  return <span aria-hidden>{TYPE_GLYPH[card.type] ?? '·'}</span>;
}
