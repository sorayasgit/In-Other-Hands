import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { seedFrom } from '../data/shuffle';
import { pieceImageSrc, type Piece } from '../handful/handful';
import { Picture } from './Picture';
import { boxOf, dip, flyInto } from './collections/motion';
import { lamp } from './lamp';

/**
 * Today's handful as a board of paper cards. Masonry via CSS grid: each pin spans as many 4px rows as its measured
 * height, and `grid-auto-flow: dense` drops each one into the shortest column — row-major, so DOM
 * and focus order match reading order. Heights are read in a ResizeObserver callback (no forced
 * layout, nothing scroll-linked); hover only uses transforms, so nothing reflows.
 */

const ROW = 4;
const GAP = 16;

/** Cover proportions for books without a cover image, chosen per piece. */
const PORTRAIT = ['3 / 4', '4 / 5', '2 / 3'] as const;

export interface PinStatus {
  kept: boolean;
  passed: boolean;
}

interface Props {
  pieces: Piece[];
  status: (id: string) => PinStatus;
  onOpen: (id: string) => void;
  onKeep: (id: string) => void;
}

export function HandfulBoard({ pieces, status, onOpen, onKeep }: Props) {
  const [spans, setSpans] = useState<Record<string, number>>({});
  const ro = useRef<ResizeObserver>();
  const els = useRef(new Set<HTMLElement>());

  // Pins register their elements as they mount; the observer (re)attaches to all of them whenever
  // the board mounts, which also survives React's development double-mount.
  useEffect(() => {
    const o = new ResizeObserver((entries) => {
      setSpans((prev) => {
        let next = prev;
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.pin!;
          const height = e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height;
          const span = Math.ceil((height + GAP) / ROW);
          if (next[id] !== span) next = { ...next, [id]: span };
        }
        return next;
      });
    });
    ro.current = o;
    els.current.forEach((el) => o.observe(el));
    return () => {
      o.disconnect();
      ro.current = undefined;
    };
  }, []);

  const observe = (el: HTMLElement | null) => {
    if (!el) return;
    els.current.add(el);
    ro.current?.observe(el);
  };

  return (
    <ol className="board" aria-label="Today's pieces">
      {pieces.map((p, i) => (
        <li key={p.id} style={{ gridRowEnd: `span ${spans[p.id] ?? 60}` }}>
          <div ref={observe} data-pin={p.id} className="pin-wrap" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
            <Pin piece={p} index={i} status={status(p.id)} onOpen={onOpen} onKeep={onKeep} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Keeping copies a piece into your library, so a small copy of it flies up to the Library tab.
 * `from` is what to copy: the picture if there is one, otherwise the card itself.
 */
export function flyToLibrary(from: Element | null) {
  const tab = document.querySelector<HTMLElement>('.home-tabs a[href="#/library"]');
  if (!from || !tab) return;
  const media = from.matches('img, video') ? (from as HTMLImageElement | HTMLVideoElement) : from.querySelector<HTMLImageElement | HTMLVideoElement>('img, video');
  const ghost = document.createElement('div');
  ghost.className = 'kept-ghost';
  if (media) {
    const img = document.createElement('img');
    img.src = media instanceof HTMLVideoElement ? media.poster || '' : media.currentSrc || media.src;
    img.alt = '';
    if (img.src) ghost.append(img);
  }
  void flyInto(ghost, boxOf(from), boxOf(tab)).then(() => {
    tab.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)' }, { transform: 'translateY(0)' }], { duration: 380, easing: 'ease-out' });
  });
}

/** How many people held a piece before it reached you. */
const HANDS_SHOWN = 4;
export const handsLabel = (n: number) => `${n} ${n === 1 ? 'hand' : 'hands'} before yours`;

const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const tagLabel = (tag?: string) => (tag ? tag[0].toUpperCase() + tag.slice(1) : undefined);

const Pin = memo(function Pin({ piece, index, status, onOpen, onKeep }: { piece: Piece; index: number; status: PinStatus; onOpen: (id: string) => void; onKeep: (id: string) => void }) {
  const seed = seedFrom(piece.id);
  const [words, cite] = piece.kind === 'quote' ? piece.body.split(' — ') : [piece.body];
  // A quote is credited to whoever said it; everything else came from no one in particular.
  const by = cite ? cite.split(',')[0] : 'Anonymous';
  const excerpt = piece.kind === 'quote' ? `“${words}”` : piece.body;
  const visual = Visual({ piece, seed });
  // Day-level only: the last time someone added to it.
  const lastAdded = piece.trail.at(-1)?.addedOn;
  const meta = [tagLabel(piece.tags[0]), lastAdded && dayLabel(lastAdded)].filter(Boolean);
  // Only worth mentioning once a piece has really travelled.
  const hands = piece.hands >= HANDS_SHOWN && <span className="pin-hands">{handsLabel(piece.hands)}</span>;

  return (
    <article className={`pin k-${piece.kind} ${visual ? 'has-visual' : 'is-text'} ${status.kept ? 'is-kept' : ''}`} {...lamp()}>
      <span className="pin-num">[{String(index + 1).padStart(2, '0')}.]</span>
      {!visual && hands}
      {visual && (
        <button className="pin-visual" onClick={() => onOpen(piece.id)} aria-label={`${piece.title}, ${handsLabel(piece.hands)}`}>
          {visual}
          {hands}
        </button>
      )}
      <h3 className="pin-title">{piece.title}</h3>
      {by !== 'Anonymous' && <p className="pin-by">by {by}</p>}
      {!visual && meta.length > 0 && (
        <p className="pin-meta">
          {meta.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </p>
      )}
      <p className="pin-excerpt">{excerpt}</p>
      <div className="pin-actions">
        <button className="pin-btn" onClick={() => onOpen(piece.id)} aria-label={`More info about ${piece.title}`}>More Info</button>
        {status.passed ? (
          <span className="pin-btn is-solid is-on">Passed along</span>
        ) : status.kept ? (
          <span className="pin-btn is-solid is-on">Kept ✓</span>
        ) : (
          <button
            className="pin-btn is-solid"
            onClick={(e) => {
              const pin = e.currentTarget.closest<HTMLElement>('.pin')!;
              dip(pin);
              flyToLibrary(pin.querySelector('.pin-visual') ?? pin);
              onKeep(piece.id);
            }}
          >
            Keep
          </button>
        )}
      </div>
    </article>
  );
});

// ── Visuals: only pieces that have something to look at get one ───────────────────────────────

function Visual({ piece, seed }: { piece: Piece; seed: number }): ReactNode {
  if (piece.image) return <Picture className="pin-img" src={pieceImageSrc(piece.image)} alt={piece.body} lazy />;
  if (piece.kind === 'song') {
    return (
      <span className="pin-vinyl-stage" style={{ aspectRatio: seed % 2 ? '1 / 1' : '4 / 5' }}>
        <Vinyl />
      </span>
    );
  }
  if (piece.kind === 'book') {
    return (
      <span className="pin-book" style={{ aspectRatio: PORTRAIT[seed % PORTRAIT.length] }}>
        <span className="pin-book-title">{piece.title}</span>
      </span>
    );
  }
  return null;
}

function Vinyl() {
  return (
    <svg className="pin-vinyl" viewBox="0 0 200 200" aria-hidden>
      <circle cx="100" cy="100" r="96" className="v-disc" />
      {[88, 80, 72, 64, 56, 48].map((r) => (
        <circle key={r} cx="100" cy="100" r={r} className="v-groove" />
      ))}
      <circle cx="100" cy="100" r="36" className="v-ring" />
      <circle cx="100" cy="100" r="32" className="v-label" />
      <path d="M58 52 a62 62 0 0 1 46 -16" className="v-glint" />
      <circle cx="100" cy="100" r="4" className="v-hole" />
    </svg>
  );
}
