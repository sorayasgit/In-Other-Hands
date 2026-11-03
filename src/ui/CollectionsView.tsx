import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createCanvasFromCollection } from '../canvas/store';
import { library, useCollections, useLibrary, type Collection } from '../data/store';
import type { Card } from '../data/types';
import { handful } from '../handful/store';
import { navigate, type Route } from '../router';
import { engine, useSearchService } from '../search/searchService';
import { centroid, type Vec } from '../search/vectors';
import { CardArt } from './CardArt';
import { Picture } from './Picture';
import { formatBytes, IMAGE_RATIO, useImageFacts } from './collections/derive';
import { clampX, clampY, FOLDER_W, loadPositions, placeFolders, savePositions, type Point } from './collections/positions';
import { markVisited, visitedLabel } from './collections/visited';
import { boxOf, burst, fade, reducedMotion, retract, settle, slideAway, zoomIn, zoomOut, type Box } from './collections/motion';
import './collections.css';

/**
 * Collections as a spatial space: folders on a gray table → a first click scatters a folder's cards
 * beside it, a second opens the board (the scattered cards settle into it) → zoom into a card's
 * detail page. One component owns all three layers so every change of depth can animate:
 * each layer stays mounted until its exit animation has finished, then the route catches up.
 */

const goCollection = (name?: string, params?: Record<string, string | undefined>) =>
  name ? navigate(`/collection/${encodeURIComponent(name)}`, params) : navigate('/collections');

const mono = (d: string | number) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();

export function CollectionsSpace({ route }: { route: Route }) {
  const m = route.path.match(/^\/collection\/(.+)$/);
  const name = m ? decodeURIComponent(m[1]) : undefined;
  const [shown, setShown] = useState(name);
  const [preview, setPreview] = useState<string>();
  const folderFrom = useRef<Box>();
  const scatter = useRef<Scatter>();
  const cardFrom = useRef<Box>();

  // A new collection to show while none is shown: show it now. Otherwise the board animates out
  // first (see BoardLayer `leaving`) and calls back.
  useEffect(() => {
    if (name && !shown) setShown(name);
  }, [name, shown]);

  // Once the board has taken the preview's cards, the preview is over.
  useEffect(() => {
    if (!shown) return;
    setPreview(undefined);
    scatter.current = undefined;
    cardFrom.current = undefined;
  }, [shown]);

  return (
    <>
      <Overview
        receded={!!name}
        hidden={name}
        preview={preview}
        onPreview={setPreview}
        onOpen={(n, folder, card) => {
          scatter.current = collectScatter();
          folderFrom.current = scatter.current.size ? undefined : boxOf(folder);
          cardFrom.current = card && boxOf(card);
          goCollection(n, card ? { open: card.dataset.pv } : undefined);
        }}
      />
      {shown && (
        <BoardLayer
          key={shown}
          name={shown}
          route={route}
          leaving={name !== shown}
          origin={folderFrom.current}
          scatter={scatter.current}
          cardOrigin={cardFrom.current}
          onLeft={() => {
            folderFrom.current = undefined;
            setShown(name);
          }}
        />
      )}
    </>
  );
}

// ── Overview: folders, and one folder's contents scattered beside it ────────────────────────────

function Overview({ receded, hidden, preview, onPreview, onOpen }: {
  receded: boolean;
  hidden?: string;
  preview?: string;
  onPreview: (name?: string) => void;
  onOpen: (name: string, folder: HTMLElement, card?: HTMLElement) => void;
}) {
  const collections = useCollections();
  // The cluster on screen lags `preview` so it can retract before the next one bursts.
  const [pv, setPv] = useState(preview);
  useEffect(() => {
    if (preview && !pv) setPv(preview);
  }, [preview, pv]);
  useEffect(() => {
    if (receded) setPv(undefined);
  }, [receded]);

  const previewing = !receded && !!(preview || pv);
  const active = pv ?? preview;

  useEffect(() => {
    if (!previewing) return;
    const onClick = (e: MouseEvent) => !(e.target as HTMLElement).closest('.cl-folder, .cl-pv-card') && onPreview(undefined);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onPreview(undefined);
    document.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [previewing, onPreview]);

  const folderEl = (n: string) => document.querySelector<HTMLElement>(`.cl-folder[data-folder="${CSS.escape(n)}"]`)!;

  const cards = useLibrary();
  const membersOf = useMemo(() => {
    const by = new Map<string, Card[]>();
    for (const c of [...cards].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))) {
      for (const n of c.collections ?? []) by.set(n, [...(by.get(n) ?? []), c]);
    }
    return (n: string) => by.get(n) ?? [];
  }, [cards]);

  // Folders sit where they were dropped. The area's width sets the grid for folders never moved.
  const area = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const [saved, setSaved] = useState(loadPositions);
  const [dragging, setDragging] = useState<{ name: string } & Point>();
  const grab = useRef<{ name: string; px: number; py: number; from: Point; moved: boolean }>();
  const swallowClick = useRef(false);
  const layout = useMemo(() => placeFolders(collections.map((c) => c.name), saved, width), [collections, saved, width]);
  const place = (name: string, p: Point) =>
    setSaved((s) => {
      const next = { ...s, [name]: { x: clampX(p.x, width), y: clampY(p.y) } };
      savePositions(next);
      return next;
    });

  // The softening follows the request, not the cards: it starts clearing as soon as a preview closes,
  // while the cards are still sliding back.
  return (
    <main className={`cl-overview ${receded ? 'is-receded' : ''} ${!receded && preview ? 'is-previewing' : ''}`} aria-hidden={receded || undefined}>
      <h1>Collections</h1>
      <div ref={area} className="cl-folders" style={{ height: layout.height, '--folder-w': `${FOLDER_W}px` } as CSSProperties}>
        {width > 0 && collections.map((c, i) => {
          const members = membersOf(c.name);
          const at = dragging?.name === c.name ? dragging : layout.at.get(c.name)!;
          // First click spreads the contents out, a second puts them away; only "Open" opens.
          const toggle = () => onPreview(preview === c.name ? undefined : c.name);
          return (
            <div
              key={c.name}
              className={`cl-folder cl-lift ${previewing && active === c.name ? 'is-active' : ''} ${dragging?.name === c.name ? 'is-dragging' : ''}`}
              data-folder={c.name}
              role="button"
              tabIndex={0}
              aria-expanded={preview === c.name}
              aria-label={`${c.name}, ${members.length} ${members.length === 1 ? 'item' : 'items'}. Arrow keys move it.`}
              style={{ left: at.x, top: at.y, visibility: hidden === c.name ? 'hidden' : undefined, animationDelay: `${Math.min(i, 10) * 30}ms` }}
              onClick={() => {
                if (swallowClick.current) return void (swallowClick.current = false);
                toggle();
              }}
              // Drag to move, Finder-style. A press that barely moves is still a click. Folders stay
              // put while one is spread open, so its cards keep their place.
              onPointerDown={(e) => {
                if (e.button !== 0 || preview || (e.target as HTMLElement).closest('.cl-open-chip')) return;
                grab.current = { name: c.name, px: e.clientX, py: e.clientY, from: layout.at.get(c.name)!, moved: false };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const g = grab.current;
                if (!g) return;
                const [dx, dy] = [e.clientX - g.px, e.clientY - g.py];
                if (!g.moved && Math.hypot(dx, dy) < 5) return;
                g.moved = true;
                setDragging({ name: g.name, x: clampX(g.from.x + dx, width), y: clampY(g.from.y + dy) });
              }}
              onPointerUp={(e) => {
                const g = grab.current;
                grab.current = undefined;
                if (!g?.moved) return;
                swallowClick.current = true;
                place(g.name, { x: g.from.x + e.clientX - g.px, y: g.from.y + e.clientY - g.py });
                setDragging(undefined);
              }}
              onPointerCancel={() => {
                grab.current = undefined;
                setDragging(undefined);
              }}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') return void (e.preventDefault(), toggle());
                const step = e.shiftKey ? 48 : 12;
                const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[e.key];
                if (!d || preview) return;
                e.preventDefault();
                place(c.name, { x: at.x + d[0], y: at.y + d[1] });
              }}
            >
              <span className="cl-folder-peek" aria-hidden>
                {members.slice(0, 3).map((m) => (
                  <span key={m.id} className={m.type === 'image' || m.cover ? 'is-picture' : 'is-paper'}>
                    {m.type === 'image' || m.cover ? <CardArt card={m} ratio={1.3} /> : <b>{m.title}</b>}
                  </span>
                ))}
              </span>
              <svg className="cl-folder-shape" viewBox="0 0 680 1000" preserveAspectRatio="none" aria-hidden>
                <path d={FOLDER_PATH} />
              </svg>
              {preview === c.name && !receded && (
                <button
                  className="cl-open-chip"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(c.name, e.currentTarget.closest<HTMLElement>('.cl-folder')!);
                  }}
                >
                  + Open
                </button>
              )}
              <span className="cl-folder-foot">
                <span className="cl-folder-kind">{topTag(members)}</span>
                <b>{c.name}</b>
                <span className="cl-folder-visited">{visitedLabel(c.name)}</span>
              </span>
            </div>
          );
        })}
        {width > 0 && <NewFolder style={{ left: layout.spare.x, top: layout.spare.y }} onCreated={(n) => goCollection(n)} />}
        {pv && !receded && (
          <Cluster
            key={pv}
            name={pv}
            leaving={preview !== pv}
            onLeft={() => setPv(preview)}
            onOpenCard={(el) => onOpen(pv, folderEl(pv), el)}
            onOpenAll={() => onOpen(pv, folderEl(pv))}
          />
        )}
      </div>
    </main>
  );
}

/** A folder with a tab on its right edge, drawn in a 680 × 1000 box (the body is the left 600). */
const FOLDER_PATH =
  'M48,0 H560 C585,0 600,15 600,40 C600,75 612,92 640,108 C668,124 680,142 680,176 V400 C680,432 668,448 640,464 C612,480 600,497 600,532 V952 C600,980 580,1000 552,1000 H48 C20,1000 0,980 0,952 V48 C0,20 20,0 48,0 Z';

/** The word a folder is labelled with: its most common tag. */
function topTag(members: Card[]): string {
  const n = new Map<string, number>();
  for (const c of members) for (const t of c.tags ?? []) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'collection';
}

// The preview's cards, as they lay when the board opened: the board settles each from here.
type Scatter = Map<string, { box: Box; rotate: number }>;

function collectScatter(): Scatter {
  const out: Scatter = new Map();
  document.querySelectorAll<HTMLElement>('.cl-pv-card[data-pv]').forEach((el) => {
    // The unrotated box: same centre as the rotated bounds, the card's own size at the cluster's scale.
    const r = el.getBoundingClientRect();
    const wrap = el.parentElement!;
    const k = wrap.getBoundingClientRect().width / wrap.offsetWidth || 1;
    const [w, h] = [el.offsetWidth * k, el.offsetHeight * k];
    out.set(el.dataset.pv!, { box: { left: r.left + r.width / 2 - w / 2, top: r.top + r.height / 2 - h / 2, width: w, height: h }, rotate: Number(el.dataset.r) });
  });
  return out;
}

type SlotKind = 'image' | 'doc' | 'note' | 'more';
interface Slot { key: string; kind: SlotKind; card?: Card; more?: number; x: number; y: number; w: number; h: number; rotate: number; last: boolean; order: number }

const ROWS = {
  image: { w: 150, h: 262, step: 170, max: 2, indent: 0, gap: 16 },
  doc: { w: 105, h: 146, step: 111, max: 4, indent: 0, gap: 12 },
  note: { w: 84, h: 84, step: 89, max: 4, indent: 4, gap: 0 },
} as const;
/** The two photos differ in size and sit on a shared baseline, as if dropped there. */
const IMAGE_SIZES = [
  [150, 196],
  [166, 262],
] as const;
// Docs and notes land first; photos last, on top.
const BURST_ORDER: Record<SlotKind, number> = { doc: 0, note: 1, more: 1, image: 2 };

/** A stable value in [0, 1) per card and purpose, so a card always lies at the same angle. */
function unit(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function scatterLayout(members: Card[]) {
  const kindOf = (c: Card): Exclude<SlotKind, 'more'> => (c.type === 'image' || c.cover ? 'image' : c.type === 'note' || bodyOf(c).length < 140 ? 'note' : 'doc');
  const groups = { image: [] as Card[], doc: [] as Card[], note: [] as Card[] };
  members.forEach((c) => groups[kindOf(c)].push(c));
  const picked = (['image', 'doc', 'note'] as const).map((k) => ({ k, cards: groups[k].slice(0, ROWS[k].max) }));
  const more = members.length - picked.reduce((n, r) => n + r.cards.length, 0);

  const slots: Slot[] = [];
  let y = 0;
  for (const { k, cards } of picked) {
    const row = ROWS[k];
    const entries: { key: string; kind: SlotKind; card?: Card }[] = cards.map((c) => ({ key: c.id, kind: k, card: c }));
    if (k === 'note' && more > 0) entries.push({ key: '+more', kind: 'more' });
    if (!entries.length) continue;
    entries.forEach((e, i) => {
      const [w, h] = k === 'image' ? IMAGE_SIZES[i] : [row.w, row.h];
      slots.push({
        ...e,
        more: e.kind === 'more' ? more : undefined,
        x: row.indent + i * row.step + (unit(`${e.key}:x`) - 0.5) * 8,
        y: y + (row.h - h) + (unit(`${e.key}:y`) - 0.5) * 14,
        w,
        h,
        rotate: Math.round((unit(`${e.key}:r`) * 8 - 4) * 10) / 10,
        last: i === entries.length - 1,
        order: 0,
      });
    });
    y += row.h + row.gap + 8;
  }
  slots
    .map((s, i) => [s, i] as const)
    .sort((a, b) => BURST_ORDER[a[0].kind] - BURST_ORDER[b[0].kind] || a[1] - b[1])
    .forEach(([s], i) => (s.order = i));
  const width = Math.max(0, ...slots.map((s) => s.x + s.w));
  const height = Math.max(0, ...slots.map((s) => s.y + s.h));
  return { slots, width, height, photos: picked[0].cards.length > 0 };
}

function Cluster({ name, leaving, onLeft, onOpenCard, onOpenAll }: { name: string; leaving: boolean; onLeft: () => void; onOpenCard: (el: HTMLElement) => void; onOpenAll: () => void }) {
  const cards = useLibrary();
  const members = useMemo(
    () => cards.filter((c) => c.collections?.includes(name)).sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt)),
    [cards, name],
  );
  const { slots, width, height, photos } = useMemo(() => scatterLayout(members), [members]);
  const wrap = useRef<HTMLDivElement>(null);
  // Where the cluster sits (in .cl-folders coordinates), whether it fans left, and the folder's centre in cluster coordinates.
  const [place, setPlace] = useState<{ left: number; top: number; scale: number; flip: boolean; fx: number; fy: number; fit: number[] }>();

  useLayoutEffect(() => {
    const folder = document.querySelector<HTMLElement>(`.cl-folder[data-folder="${CSS.escape(name)}"]`);
    if (!folder) return;
    const r = folder.getBoundingClientRect();
    // Tucked against the folder's edge (just behind its tab), so the cards only travel a little.
    const [gap, edge, vw] = [-6, 16, document.documentElement.clientWidth];
    const top = folder.offsetTop + (photos ? -(ROWS.image.h - folder.offsetHeight * 0.3) : folder.offsetHeight * 0.1);
    let p: { left: number; top: number; scale: number; flip: boolean };
    if (r.right + gap + width <= vw - edge) p = { left: folder.offsetLeft + folder.offsetWidth + gap, top, scale: 1, flip: false };
    else if (r.left - gap - width >= edge) p = { left: folder.offsetLeft - gap - width, top, scale: 1, flip: true };
    else {
      // Neither side has room (narrow screens): lay it under the folder, scaled to fit.
      const scale = Math.min(1, (vw - 2 * edge) / width);
      p = { left: edge - (r.left - folder.offsetLeft), top: folder.offsetTop + folder.offsetHeight + 24, scale, flip: false };
    }
    // Closed, every card sits behind the folder's body (the part left of the tab), shrunk to fit.
    const [bw, bh] = [folder.offsetWidth * (600 / 680) * 0.86, folder.offsetHeight * 0.86];
    setPlace({
      ...p,
      fx: (folder.offsetLeft + folder.offsetWidth * (300 / 680) - p.left) / p.scale,
      fy: (folder.offsetTop + folder.offsetHeight / 2 - p.top) / p.scale,
      fit: slots.map((s) => Math.min(1, bw / p.scale / s.w, bh / p.scale / s.h)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const xOf = (s: Slot) => (place?.flip ? width - s.x - s.w : s.x);
  const towardFolder = (s: Slot) => [place!.fx - (xOf(s) + s.w / 2), place!.fy - (s.y + s.h / 2)];
  const els = () => [...(wrap.current?.querySelectorAll<HTMLElement>('[data-slot]') ?? [])];

  useLayoutEffect(() => {
    if (!place || leaving) return;
    els().forEach((el, i) => {
      const s = slots[i];
      const [dx, dy] = towardFolder(s);
      burst(el, dx, dy, s.rotate, s.order * 35, place.fit[i]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place]);

  useEffect(() => {
    if (!leaving) return;
    if (!place) return onLeft();
    const last = slots.length - 1;
    Promise.all(
      els().map((el, i) => {
        const s = slots[i];
        el.getAnimations().forEach((a) => a.cancel());
        const [dx, dy] = towardFolder(s);
        return retract(el, dx, dy, s.rotate, (last - s.order) * 20, place.fit[i]);
      }),
    ).then(onLeft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  if (!place) return null;
  return (
    <div
      ref={wrap}
      className={`cl-cluster ${leaving ? 'is-leaving' : ''}`}
      style={{ left: place.left, top: place.top, width, height, transform: place.scale !== 1 ? `scale(${place.scale})` : undefined }}
    >
      {slots.map((s) => (
        <button
          key={s.key}
          className={`cl-pv-card is-${s.kind}`}
          data-slot
          data-pv={s.card?.id}
          data-r={s.rotate}
          style={{ left: xOf(s), top: s.y, width: s.w, height: s.h, zIndex: s.order + 1, '--r': `${s.rotate}deg` } as CSSProperties}
          onClick={(e) => (s.card ? onOpenCard(e.currentTarget) : onOpenAll())}
          aria-label={s.card ? s.card.title : `${s.more} more`}
          tabIndex={leaving ? -1 : undefined}
        >
          {s.kind === 'image' && s.card && <CardArt card={s.card} ratio={s.h / s.w} />}
          {s.kind === 'doc' && s.card && (
            <>
              <b>{s.card.title}</b>
              <p>{bodyOf(s.card)}</p>
            </>
          )}
          {s.kind === 'note' && s.card && <p>{s.card.title}{bodyOf(s.card) && ` — ${bodyOf(s.card)}`}</p>}
          {s.kind === 'more' && <span>+{s.more}</span>}
          {s.last && <span className="cl-pv-dot" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

function NewFolder({ style, onCreated }: { style?: CSSProperties; onCreated: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [err, setErr] = useState('');
  if (!open) {
    return (
      <button className="cl-folder cl-folder-new" style={style} onClick={() => setOpen(true)}>
        <span className="cl-label">+ New collection</span>
      </button>
    );
  }
  return (
    <form
      className="cl-folder cl-folder-new is-open"
      style={style}
      onSubmit={(e) => {
        e.preventDefault();
        const made = library.createCollection(name, purpose);
        if (made) onCreated(made);
        else setErr(name.trim() ? 'NAME TAKEN' : 'NAME IT FIRST');
      }}
    >
      <span className="cl-label">New collection</span>
      <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} placeholder="Name" aria-label="Collection name" />
      <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="When will you come back to it?" aria-label="Purpose" rows={3} />
      <span className="cl-folder-foot">
        <button className="cl-text-btn" type="submit">Create</button>
        <button className="cl-text-btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
        {err && <span className="cl-label">{err}</span>}
      </span>
    </form>
  );
}

// ── Board: one collection ─────────────────────────────────────────────────────────────────────

type Layout = 'grid' | 'list';

function BoardLayer({ name, route, leaving, origin, scatter, cardOrigin, onLeft }: {
  name: string;
  route: Route;
  leaving: boolean;
  origin?: Box;
  scatter?: Scatter;
  cardOrigin?: Box;
  onLeft: () => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const collections = useCollections();
  const cards = useLibrary();
  const collection = collections.find((c) => c.name === name);
  const open = route.params.get('open') ?? undefined;
  const [shownCard, setShownCard] = useState(open);
  const cardFrom = useRef<Box | undefined>(cardOrigin);
  const [layout, setLayout] = useState<Layout>('grid');
  const [manage, setManage] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const members = useMemo(
    () => cards.filter((c) => c.collections?.includes(name)).sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt)),
    [cards, name],
  );
  const created = members.length ? Math.min(...members.map((c) => Date.parse(c.savedAt))) : Date.now();

  useEffect(() => markVisited(name), [name]);

  useLayoutEffect(() => {
    const el = layer.current;
    if (!el) return;
    if (!scatter?.size) {
      zoomIn(el, origin, [{ borderRadius: '14px' }, { borderRadius: '0px' }]);
      return;
    }
    // From the preview: the gray rises over the canvas, the scattered cards settle into the board.
    // Fade in the layer's own colour (whatever the theme makes it), never a fixed one.
    const bg = getComputedStyle(el).backgroundColor;
    el.animate([{ backgroundColor: bg.replace(/rgba?\(([^,]+),([^,]+),([^,)]+).*\)/, 'rgba($1,$2,$3,0)') }, { backgroundColor: bg }], { duration: 300, easing: 'ease-out' });
    el.querySelectorAll<HTMLElement>('.cl-toolbar, .cl-corner-bl, .cl-corner-br, .cl-edge-count').forEach((c) =>
      c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 150, easing: 'ease-out', fill: 'backwards' }),
    );
    el.querySelectorAll<HTMLElement>('.cl-board [data-card]').forEach((tile) => {
      const from = scatter.get(tile.dataset.card!);
      if (!from) return;
      tile.style.animation = 'none';
      settle(tile, from.box, from.rotate);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!leaving || !layer.current) return;
    // Closing: the whole page slides down and away, uncovering the folders.
    slideAway(layer.current).then(onLeft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  useEffect(() => {
    if (open && !shownCard) setShownCard(open);
  }, [open, shownCard]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || shownCard || (e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return;
      goCollection(undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shownCard]);

  const openCard = (id: string, el: HTMLElement) => {
    if (manage) {
      setPicked((p) => {
        const n = new Set(p);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      });
      return;
    }
    cardFrom.current = boxOf(el);
    goCollection(name, { open: id });
  };

  const toolbar = (
    <Toolbar
      onBack={() => goCollection(undefined)}
      layout={layout}
      manage={manage}
      onLayout={setLayout}
      onManage={() => {
        setManage((v) => !v);
        setPicked(new Set());
      }}
    />
  );

  return (
    <div ref={layer} className="cl-board-layer">
      <div className={`cl-board-scroll ${shownCard ? 'is-receded' : ''}`}>
        {toolbar}
        {!collection ? (
          <p className="cl-empty">There’s no collection called “{name}”.</p>
        ) : (
          <>
            {members.length === 0 && <p className="cl-empty">Nothing here yet.</p>}
            <div className={`cl-board ${layout === 'list' ? 'is-list' : ''} ${manage ? 'is-managing' : ''}`}>
              {members.map((c, i) => (
                <Tile key={c.id} card={c} index={i} layout={layout} hidden={shownCard === c.id} picked={picked.has(c.id)} manage={manage} onOpen={openCard} />
              ))}
            </div>
            {manage && <Suggestions name={name} purpose={collection.purpose} memberIds={members.map((c) => c.id)} />}
          </>
        )}
        <span className="cl-label cl-corner-bl">{name}</span>
        <span className="cl-label cl-corner-br">Created on {mono(created)}</span>
        <span className="cl-label cl-edge-count">{members.length} {members.length === 1 ? 'item' : 'items'}</span>
      </div>

      {manage && collection && <ManageBar collection={collection} picked={picked} onDone={() => setPicked(new Set())} memberIds={members.map((m) => m.id)} />}

      {shownCard && (
        <DetailLayer
          key={shownCard}
          id={shownCard}
          collection={name}
          leaving={open !== shownCard}
          origin={cardFrom.current}
          toolbar={
            <Toolbar
              onBack={() => goCollection(name)}
              layout={layout}
              manage={manage}
              onLayout={(l) => {
                setLayout(l);
                goCollection(name);
              }}
              onManage={() => {
                setManage((v) => !v);
                goCollection(name);
              }}
            />
          }
          onLeft={() => {
            cardFrom.current = undefined;
            setShownCard(open);
          }}
        />
      )}
    </div>
  );
}

function Tile({ card, index, layout, hidden, picked, manage, onOpen }: { card: Card; index: number; layout: Layout; hidden: boolean; picked: boolean; manage: boolean; onOpen: (id: string, el: HTMLElement) => void }) {
  const text = bodyOf(card);
  const short = card.type !== 'image' && !card.cover && text.length < 140;
  const style: CSSProperties = { visibility: hidden ? 'hidden' : undefined, animationDelay: `${Math.min(index, 14) * 25}ms` };
  const check = manage && <span className={`cl-check ${picked ? 'is-on' : ''}`} aria-hidden>{picked ? <IconCheck /> : null}</span>;

  if (layout === 'list') {
    return (
      <button className="cl-row cl-lift" data-card={card.id} style={style} onClick={(e) => onOpen(card.id, e.currentTarget.querySelector<HTMLElement>('[data-hero]')!)} aria-pressed={manage ? picked : undefined}>
        <span className="cl-row-thumb" data-hero>
          {card.type === 'image' || card.cover ? <CardArt card={card} ratio={1} /> : <span className="cl-row-glyph">{card.title[0]}</span>}
        </span>
        <b>{card.title}</b>
        <span className="cl-label">{card.type}</span>
        <span className="cl-label">{mono(card.savedAt)}</span>
        {check}
      </button>
    );
  }

  return (
    <button
      className={`cl-tile cl-lift ${card.cover ? 'is-image is-cover' : card.type === 'image' ? 'is-image' : short ? 'is-mini' : 'is-text'} ${picked ? 'is-picked' : ''}`}
      data-card={card.id}
      data-hero
      style={style}
      onClick={(e) => onOpen(card.id, e.currentTarget)}
      aria-label={card.title}
      aria-pressed={manage ? picked : undefined}
    >
      {card.cover ? (
        // A real picture keeps its own proportions; drawn ones share the board's.
        <Picture src={card.cover} alt="" lazy />
      ) : card.type === 'image' ? (
        <CardArt card={card} ratio={IMAGE_RATIO} />
      ) : (
        <>
          <b>{card.title}</b>
          <p>{text}</p>
        </>
      )}
      {check}
    </button>
  );
}

// ── Detail ────────────────────────────────────────────────────────────────────────────────────

function DetailLayer({ id, collection, leaving, origin, toolbar, onLeft }: { id: string; collection: string; leaving: boolean; origin?: Box; toolbar: ReactNode; onLeft: () => void }) {
  const card = useLibrary().find((c) => c.id === id);
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const bg = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string>();
  const isImage = card?.type === 'image';

  useLayoutEffect(() => {
    if (!bg.current) return;
    if (isImage && hero.current) {
      fade(bg.current, true);
      zoomIn(hero.current, origin, [{ borderRadius: '16px' }, { borderRadius: '4px' }]);
    } else {
      // The small paper card *becomes* the page: grow the sheet, then let the words arrive.
      zoomIn(bg.current, origin, [{ borderRadius: '14px' }, { borderRadius: '0px' }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!leaving || !root.current) return;
    root.current.classList.add('is-leaving');
    const tile = document.querySelector<HTMLElement>(`.cl-board [data-card="${CSS.escape(id)}"]`);
    const target = tile ? boxOf(tile.matches('[data-hero]') ? tile : tile.querySelector('[data-hero]')!) : undefined;
    const done = isImage && hero.current
      ? Promise.all([zoomOut(hero.current, target, [{ borderRadius: '4px' }, { borderRadius: '16px' }]), fade(bg.current!, false, 260)])
      : zoomOut(bg.current!, target, [{ borderRadius: '0px' }, { borderRadius: '14px' }]);
    done.then(onLeft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).closest('input, textarea, [contenteditable]')) goCollection(collection);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collection]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  if (!card) {
    return (
      <div ref={root} className="cl-detail is-text">
        <div ref={bg} className="cl-detail-bg" />
        <div ref={hero} />
      </div>
    );
  }

  return (
    <div ref={root} className={`cl-detail ${isImage ? 'is-image' : 'is-text'}`} role="dialog" aria-label={card.title}>
      <div ref={bg} className="cl-detail-bg" />
      <div className="cl-detail-chrome">{toolbar}</div>
      <span className="cl-label cl-corner-tr">{collection}</span>
      {isImage ? <ImageDetail card={card} hero={hero} /> : <TextDetail card={card} />}
      <ActionPill card={card} collection={collection} onToast={setToast} />
      {toast && <span className="cl-label cl-toast">{toast}</span>}
    </div>
  );
}

function ImageDetail({ card, hero }: { card: Card; hero: React.RefObject<HTMLDivElement> }) {
  const facts = useImageFacts(card);
  const [vw, vh] = [window.innerWidth, window.innerHeight];
  const ratio = facts ? facts.height / facts.width : IMAGE_RATIO;
  const h = Math.round(Math.min(vh * 0.6, Math.min(760, vw - 2 * (28 + 36 + 200 + 40)) * ratio));
  const w = Math.round(h / ratio);
  const palette = facts?.palette ?? [];
  const text = [card.caption, card.note, card.description].filter(Boolean) as string[];

  return (
    <div className="cl-img-detail" style={{ gridTemplateColumns: `28px ${w}px 200px` }}>
      <div className="cl-dots" aria-label="Palette">
        {palette.map((c, i) => (
          <span key={c} title={c} style={{ background: c, animationDelay: `${380 + i * 60}ms` }} />
        ))}
      </div>
      <div ref={hero} className="cl-hero" style={{ width: w, height: h }}>
        <CardArt card={card} ratio={ratio} />
      </div>
      <dl className="cl-meta">
        {facts && <Meta k="Resolution" v={`${facts.width} × ${facts.height}`} />}
        {facts && <Meta k="Size" v={formatBytes(facts.bytes)} />}
        <Meta k="Date" v={mono(card.savedAt)} />
        {facts && <Meta k="Color profile" v={facts.colorProfile} />}
      </dl>
      <div className="cl-caption" style={{ maxWidth: w }}>
        <b className="cl-caption-title">{card.title}</b>
        {text.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
      </div>
    </div>
  );
}

const Meta = ({ k, v }: { k: string; v: string }) => (
  <div>
    <dt className="cl-label">{k}</dt>
    <dd className="cl-label cl-dark">{v}</dd>
  </div>
);

function TextDetail({ card }: { card: Card }) {
  const editable = card.type === 'note' && card.origin !== 'borrowed';
  const titleRef = useRef<HTMLHeadingElement>(null);
  const full = bodyOf(card);
  const [intro, ...restSentences] = full.split(/(?<=[.!?])\s+/);
  const rest = restSentences.join(' ');
  const lines = rest.split('\n');
  const [checks, setChecks] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(lines.map((l, i) => [i, /^\s*[-*•]\s*\[x\]/i.test(l)] as const)),
  );

  // Editable notes put the caret at the start of the title once the sheet has arrived.
  useEffect(() => {
    if (!editable) return;
    const t = setTimeout(() => {
      const el = titleRef.current;
      if (!el) return;
      el.focus();
      const sel = getSelection();
      sel?.collapse(el.firstChild ?? el, 0);
    }, reducedMotion() ? 0 : 520);
    return () => clearTimeout(t);
  }, [editable]);

  return (
    <article className="cl-note">
      {card.cover && <Picture className="cl-note-cover" src={card.cover} alt={`Cover of ${card.title}`} />}
      <h1
        ref={titleRef}
        contentEditable={editable}
        suppressContentEditableWarning
        spellCheck={false}
        onBlur={(e) => editable && e.currentTarget.textContent !== card.title && library.update(card.id, { title: e.currentTarget.textContent?.trim() || card.title })}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
      >
        {card.title}
      </h1>
      {intro && <p className="cl-intro">{intro}</p>}
      {lines.map((line, i) => {
        const item = line.match(/^\s*[-*•]\s*(?:\[( |x)\]\s*)?(.*)$/i);
        if (item) {
          return (
            <label key={i} className="cl-check-line">
              <input type="checkbox" checked={!!checks[i]} onChange={(e) => setChecks((c) => ({ ...c, [i]: e.target.checked }))} />
              <span>{item[2]}</span>
            </label>
          );
        }
        return line.trim() ? <p key={i}>{line}</p> : null;
      })}
      {card.source?.author && <p className="cl-label cl-byline">{card.source.author}{card.source.name ? ` · ${card.source.name}` : ''}</p>}
    </article>
  );
}

function ActionPill({ card, collection, onToast }: { card: Card; collection: string; onToast: (t: string) => void }) {
  const facts = useImageFacts(card);
  const borrowed = card.origin === 'borrowed' && card.pieceId;
  const plain = `${card.title}\n\n${bodyOf(card)}`;

  const copy = async () => {
    try {
      if (facts && 'ClipboardItem' in window) await navigator.clipboard.write([new ClipboardItem({ 'image/png': facts.blob })]);
      else await navigator.clipboard.writeText(plain);
      onToast('Copied');
    } catch {
      onToast('Copy blocked');
    }
  };
  const save = () => {
    const blob = facts?.file ?? facts?.blob ?? new Blob([plain], { type: 'text/plain' });
    const ext = facts ? (blob.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg') : 'txt';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${card.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    onToast('Saved');
  };
  const remove = () => {
    if (borrowed) {
      if (!confirm('Return this piece? It leaves your library and goes back out with what you added. No name goes with it.')) return;
      handful.returnPiece(card.pieceId!);
    } else {
      if (!confirm(`Remove “${card.title}” from ${collection}? It stays in your library.`)) return;
      library.setInCollection(card.id, collection, false);
    }
    goCollection(collection);
  };

  return (
    <div className="cl-pill" role="toolbar" aria-label="Card actions">
      <button onClick={copy} title="Copy" aria-label="Copy"><IconCopy /></button>
      <button onClick={save} title="Save a copy" aria-label="Save a copy"><IconDownload /></button>
      <button onClick={remove} title={borrowed ? 'Return' : 'Remove from collection'} aria-label={borrowed ? 'Return' : 'Remove from collection'}><IconTrash /></button>
    </div>
  );
}

// ── Manage mode (the check button): rename, purpose, remove, canvas, suggestions ──────────────

function ManageBar({ collection, picked, onDone, memberIds }: { collection: Collection; picked: Set<string>; onDone: () => void; memberIds: string[] }) {
  const [title, setTitle] = useState(collection.name);
  const [purpose, setPurpose] = useState(collection.purpose ?? '');
  return (
    <div className="cl-manage" onKeyDown={(e) => e.stopPropagation()}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (title.trim() === collection.name) return;
          const next = library.renameCollection(collection.name, title);
          if (next && next !== collection.name) goCollection(next);
          else setTitle(collection.name);
        }}
        aria-label="Collection name"
      />
      <input className="cl-manage-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} onBlur={() => purpose !== (collection.purpose ?? '') && library.setPurpose(collection.name, purpose)} placeholder="When will you come back to this?" aria-label="Purpose" />
      <button
        className="cl-text-btn"
        disabled={!picked.size}
        onClick={() => {
          picked.forEach((id) => library.setInCollection(id, collection.name, false));
          onDone();
        }}
      >
        Remove {picked.size || ''}
      </button>
      <button className="cl-text-btn" disabled={!memberIds.length} onClick={() => navigate(`/canvas/${createCanvasFromCollection(collection.name, memberIds).id}`)}>
        Open as canvas
      </button>
      <button
        className="cl-text-btn"
        onClick={() => {
          if (!confirm(`Delete “${collection.name}”? Its cards stay in your library.`)) return;
          library.deleteCollection(collection.name);
          goCollection(undefined);
        }}
      >
        Delete
      </button>
    </div>
  );
}

function Suggestions({ name, purpose, memberIds }: { name: string; purpose?: string; memberIds: string[] }) {
  const cards = useLibrary();
  const { status, revision } = useSearchService();
  const [items, setItems] = useState<Card[]>([]);
  const members = useMemo(() => new Set(memberIds), [memberIds.join(',')]);

  useEffect(() => {
    let live = true;
    (async () => {
      const score = new Map<string, number>();
      const bump = (list: Card[]) => list.forEach((c, i) => !members.has(c.id) && score.set(c.id, (score.get(c.id) ?? 0) + 1 / (i + 3)));
      const c = centroid([...members].map((id) => engine.vectorOf(id)).filter((v): v is Vec => !!v));
      if (c) bump(engine.related(c, 14, members).map((r) => r.card));
      if (purpose && status === 'ready') {
        const r = await engine.search({ query: purpose, limit: 14 });
        if (r.confident || !c) bump(r.results.map((x) => x.card));
      }
      const byId = new Map(cards.map((x) => [x.id, x]));
      if (live) setItems([...score].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => byId.get(id)!).filter(Boolean));
    })();
    return () => {
      live = false;
    };
  }, [members, purpose, status, revision, cards]);

  if (!items.length) return null;
  return (
    <section className="cl-suggest">
      <span className="cl-label">Might belong here</span>
      <div className="cl-board">
        {items.map((c) => (
          <div key={c.id} className={`cl-tile is-ghost ${c.type === 'image' ? 'is-image' : 'is-text'}`}>
            {c.type === 'image' ? <CardArt card={c} ratio={IMAGE_RATIO} /> : (<><b>{c.title}</b><p>{bodyOf(c)}</p></>)}
            <button className="cl-add" onClick={() => library.setInCollection(c.id, name, true)} aria-label={`Add ${c.title}`}>+ Add</button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Chrome ────────────────────────────────────────────────────────────────────────────────────

function Toolbar({ onBack, layout, manage, onLayout, onManage }: { onBack: () => void; layout: Layout; manage: boolean; onLayout: (l: Layout) => void; onManage: () => void }) {
  return (
    <div className="cl-toolbar">
      <button className="cl-glass cl-round" onClick={onBack} aria-label="Back"><IconBack /></button>
      <div className="cl-glass cl-tools" role="toolbar" aria-label="View">
        <button className={layout === 'list' ? 'is-on' : ''} onClick={() => onLayout('list')} aria-label="List" aria-pressed={layout === 'list'}><IconList /></button>
        <button className={layout === 'grid' ? 'is-on' : ''} onClick={() => onLayout('grid')} aria-label="Grid" aria-pressed={layout === 'grid'}><IconGrid /></button>
        <button className={manage ? 'is-on' : ''} onClick={onManage} aria-label="Select and manage" aria-pressed={manage}><IconCheck /></button>
      </div>
    </div>
  );
}

function bodyOf(card: Card): string {
  return card.quote ?? card.body ?? card.description ?? card.note ?? card.caption ?? '';
}

const I = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const IconBack = () => <svg {...I}><path d="M15 5l-7 7 7 7" /></svg>;
const IconList = () => <svg {...I}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>;
const IconGrid = () => <svg {...I}><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></svg>;
const IconCheck = () => <svg {...I}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const IconCopy = () => <svg {...I}><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
const IconDownload = () => <svg {...I}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
const IconTrash = () => <svg {...I}><path d="M4 7h16M10 7V5h4v2M6.5 7l1 12.5h9L17.5 7" /></svg>;
