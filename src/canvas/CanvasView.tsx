import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { library, useLibrary } from '../data/store';
import { href } from '../router';
import { engine, useSearchService } from '../search/searchService';
import { CardDrawer } from '../ui/CardDrawer';
import { CanvasCard, CanvasNote } from './CanvasNodes';
import { CanvasSidebar, DRAG_TYPE } from './CanvasSidebar';
import { IconFile, IconFit, IconGroup, IconIdeas, IconKeep, IconLibrary, IconLinks, IconMap, IconNote, IconOpen, IconRedo, IconTrash, IconUndo } from './icons';
import type { Card } from '../data/types';
import { Minimap } from './Minimap';
import {
  addCard,
  addEdge,
  addFrame,
  addNote,
  bounds,
  CARD_W,
  contains,
  exitPoint,
  history,
  intersects,
  placeAll,
  removeItems,
  setEdgeLabel,
  setInk,
  stepNoteSize,
  NOTE_SCALE,
  updateFrame,
  updateNode,
  type Camera,
  type CanvasDoc,
  type History,
  type Rect,
} from './model';
import { loadCamera, loadCanvas, saveCamera, saveCanvas } from './store';

const MIN_Z = 0.1;
const MAX_Z = 2.5;
const LOD_Z = 0.3;
const DEFAULT_H = 220;

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; cam: Camera }
  | { kind: 'move'; sx: number; sy: number; base: CanvasDoc; start: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: 'marquee'; wx: number; wy: number; additive: boolean; prior: Set<string> }
  | { kind: 'resize'; id: string; sx: number; sy: number; base: CanvasDoc; start: Rect; scale?: number }
  | { kind: 'link'; from: string };

interface Toast {
  text: string;
  actions?: { label: string; run: () => void }[];
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function CanvasView({ id, focus }: { id: string; focus?: string }) {
  const initial = useMemo(() => loadCanvas(id), [id]);
  if (!initial) {
    return (
      <main className="canvases">
        <p className="empty">This canvas doesn’t exist any more. <a href={href('/canvases')}>Back to canvases</a></p>
      </main>
    );
  }
  return <CanvasEditor key={id} initial={initial} focus={focus} />;
}

function CanvasEditor({ initial, focus }: { initial: CanvasDoc; focus?: string }) {
  const cards = useLibrary();
  const { revision } = useSearchService();
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const [hist, setHist] = useState<History>(() => history.init(initial));
  const doc = hist.present;
  const [cam, setCam] = useState<Camera>(() => loadCamera(initial.id) ?? { x: 120, y: 120, z: 0.8 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [marquee, setMarquee] = useState<Rect>();
  const [linkPreview, setLinkPreview] = useState<{ from: string; x: number; y: number }>();
  const [editingNote, setEditingNote] = useState<string>();
  const [editingEdge, setEditingEdge] = useState<string>();
  const [editingFrame, setEditingFrame] = useState<string>();
  const [panel, setPanel] = useState<'library' | 'ideas' | undefined>();
  const [possible, setPossible] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [drawer, setDrawer] = useState<string>();
  const [toast, setToast] = useState<Toast>();
  const [find, setFind] = useState<{ q: string; i: number }>();
  const [saved, setSaved] = useState<'saved' | 'saving'>('saved');
  const [size, setSize] = useState({ w: 1200, h: 800 });

  const rootRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>();
  // True only while something is actually being dragged (a plain click never sets it), so the
  // selection frame hides during a drag and reappears the moment it ends.
  const [dragging, setDragging] = useState(false);
  const space = useRef(false);
  const camRef = useRef(cam);
  camRef.current = cam;
  const histRef = useRef(hist);
  histRef.current = hist;
  // Text edits (note, title) become one undo step from where the edit began.
  const titleBase = useRef<CanvasDoc>();
  const noteBase = useRef<CanvasDoc>();
  useEffect(() => {
    if (editingNote) noteBase.current = histRef.current.present;
  }, [editingNote]);

  // ── Geometry ────────────────────────────────────────────────────────────────────────────────
  const rectOf = useCallback(
    (nid: string): Rect | undefined => {
      const n = doc.nodes[nid];
      if (n) return n.kind === 'card' ? { x: n.x, y: n.y, w: CARD_W * n.scale, h: (heights[nid] ?? DEFAULT_H) * n.scale } : { x: n.x, y: n.y, w: n.w, h: n.h };
      const f = doc.frames[nid];
      return f ? { x: f.x, y: f.y, w: f.w, h: f.h } : undefined;
    },
    [doc, heights],
  );

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const box = rootRef.current!.getBoundingClientRect();
    const c = camRef.current;
    return { x: (clientX - box.left - c.x) / c.z, y: (clientY - box.top - c.y) / c.z };
  }, []);

  const viewport: Rect = { x: -cam.x / cam.z, y: -cam.y / cam.z, w: size.w / cam.z, h: size.h / cam.z };

  useEffect(() => {
    const el = rootRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── History helpers ─────────────────────────────────────────────────────────────────────────
  const commit = useCallback((next: CanvasDoc, base?: CanvasDoc) => setHist((h) => history.commit(h, next, base ?? h.present)), []);
  const preview = useCallback((next: CanvasDoc) => setHist((h) => history.preview(h, next)), []);

  // ── Persistence: debounced, flushed when the tab is hidden ──────────────────────────────────
  useEffect(() => {
    setSaved('saving');
    const t = setTimeout(() => {
      saveCanvas(histRef.current.present);
      setSaved('saved');
    }, 600);
    return () => clearTimeout(t);
  }, [doc]);
  useEffect(() => {
    const flush = () => document.visibilityState === 'hidden' && saveCanvas(histRef.current.present);
    document.addEventListener('visibilitychange', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      saveCanvas(histRef.current.present);
    };
  }, []);
  useEffect(() => {
    const t = setTimeout(() => saveCamera(initial.id, cam), 300);
    return () => clearTimeout(t);
  }, [cam, initial.id]);

  // ── Camera ──────────────────────────────────────────────────────────────────────────────────
  const anim = useRef<number>();
  const flyTo = useCallback(
    (target: Camera, ms = 380) => {
      if (anim.current) cancelAnimationFrame(anim.current);
      const from = camRef.current;
      const t0 = performance.now();
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const step = (t: number) => {
        const k = reduce ? 1 : Math.min(1, (t - t0) / ms);
        const e = 1 - Math.pow(1 - k, 3);
        setCam({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, z: from.z + (target.z - from.z) * e });
        if (k < 1) anim.current = requestAnimationFrame(step);
      };
      anim.current = requestAnimationFrame(step);
    },
    [],
  );

  const fitRect = useCallback(
    (r: Rect | undefined, maxZ = 1) => {
      if (!r) return;
      const pad = 80;
      const z = Math.max(MIN_Z, Math.min(maxZ, (size.w - pad * 2) / r.w, (size.h - pad * 2) / r.h));
      flyTo({ z, x: size.w / 2 - (r.x + r.w / 2) * z, y: size.h / 2 - (r.y + r.h / 2) * z });
    },
    [size, flyTo],
  );

  const allRects = useCallback(
    () => [...Object.keys(doc.nodes), ...Object.keys(doc.frames)].map((k) => rectOf(k)).filter((r): r is Rect => !!r),
    [doc, rectOf],
  );
  const fitAll = useCallback(() => fitRect(bounds(allRects())), [fitRect, allRects]);

  const zoomAt = useCallback((factor: number, sx = size.w / 2, sy = size.h / 2) => {
    setCam((c) => {
      const z = Math.max(MIN_Z, Math.min(MAX_Z, c.z * factor));
      return { z, x: sx - ((sx - c.x) * z) / c.z, y: sy - ((sy - c.y) * z) / c.z };
    });
  }, [size]);

  // Arriving from a card's "on canvas" link: centre on that card.
  useEffect(() => {
    if (!focus) return;
    const n = Object.values(initial.nodes).find((x) => x.kind === 'card' && x.itemId === focus);
    if (!n) return;
    setSel(new Set([n.id]));
    setTimeout(() => fitRect(rectOf(n.id), 1), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wheel: scroll pans, pinch / ⌘-scroll zooms about the cursor. Needs a non-passive listener.
  useEffect(() => {
    const el = rootRef.current!;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.cv-sidebar, .cv-find')) return;
      e.preventDefault();
      if (anim.current) cancelAnimationFrame(anim.current);
      const box = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - box.left, e.clientY - box.top);
      else setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ── Pointer gestures ────────────────────────────────────────────────────────────────────────
  const startMove = (e: React.PointerEvent, targetId: string) => {
    const h = histRef.current;
    let next = new Set(sel);
    if (e.shiftKey) {
      if (next.has(targetId)) {
        next.delete(targetId);
        setSel(next);
        return;
      }
      next.add(targetId);
    } else if (!next.has(targetId)) next = new Set([targetId]);
    setSel(next);

    // Frames carry whatever sits inside them.
    const moving = new Set(next);
    for (const fid of next) {
      const f = h.present.frames[fid];
      if (!f) continue;
      for (const nid of Object.keys(h.present.nodes)) {
        const r = rectOf(nid);
        if (r && contains(f, r)) moving.add(nid);
      }
    }
    const start = new Map<string, { x: number; y: number }>();
    for (const mid of moving) {
      const n = h.present.nodes[mid] ?? h.present.frames[mid];
      if (n) start.set(mid, { x: n.x, y: n.y });
    }
    gesture.current = { kind: 'move', sx: e.clientX, sy: e.clientY, base: h.present, start, moved: false };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    try {
      rootRef.current!.setPointerCapture(e.pointerId);
    } catch {
      // No live pointer behind this event (synthetic input): carry on without capture.
    }
    const target = e.target as HTMLElement;

    if (e.button === 1 || space.current) {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam: camRef.current };
      return;
    }

    const handle = target.closest<HTMLElement>('[data-handle]');
    if (handle) {
      const hid = handle.dataset.owner!;
      if (handle.dataset.handle === 'link') {
        gesture.current = { kind: 'link', from: hid };
        const w = toWorld(e.clientX, e.clientY);
        setLinkPreview({ from: hid, ...w });
      } else {
        const r = rectOf(hid)!;
        const n = doc.nodes[hid];
        gesture.current = { kind: 'resize', id: hid, sx: e.clientX, sy: e.clientY, base: doc, start: r, scale: n?.kind === 'card' ? n.scale : undefined };
      }
      return;
    }

    const edgeEl = target.closest<HTMLElement | SVGElement>('[data-edge-id]');
    if (edgeEl) {
      setSel(new Set([edgeEl.dataset.edgeId!]));
      return;
    }

    const frameEl = target.closest<HTMLElement>('[data-frame-id]');
    if (frameEl) return startMove(e, frameEl.dataset.frameId!);

    const nodeEl = target.closest<HTMLElement>('[data-node-id]');
    if (nodeEl) {
      if (editingNote === nodeEl.dataset.nodeId) return;
      return startMove(e, nodeEl.dataset.nodeId!);
    }

    // Empty space: marquee.
    const w = toWorld(e.clientX, e.clientY);
    gesture.current = { kind: 'marquee', wx: w.x, wy: w.y, additive: e.shiftKey, prior: e.shiftKey ? new Set(sel) : new Set() };
    if (!e.shiftKey) setSel(new Set());
    setEditingEdge(undefined);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const z = camRef.current.z;
    if (g.kind === 'pan') {
      setCam({ ...g.cam, x: g.cam.x + e.clientX - g.sx, y: g.cam.y + e.clientY - g.sy });
    } else if (g.kind === 'move') {
      const dx = (e.clientX - g.sx) / z;
      const dy = (e.clientY - g.sy) / z;
      if (!g.moved && Math.hypot(dx * z, dy * z) < 3) return;
      if (!g.moved) setDragging(true);
      g.moved = true;
      const pos = new Map<string, { x: number; y: number }>();
      for (const [mid, p] of g.start) pos.set(mid, { x: p.x + dx, y: p.y + dy });
      preview(placeAll(g.base, pos));
    } else if (g.kind === 'marquee') {
      const w = toWorld(e.clientX, e.clientY);
      const r = { x: Math.min(g.wx, w.x), y: Math.min(g.wy, w.y), w: Math.abs(w.x - g.wx), h: Math.abs(w.y - g.wy) };
      setMarquee(r);
      const hit = new Set(g.prior);
      for (const nid of Object.keys(doc.nodes)) {
        const nr = rectOf(nid);
        if (nr && intersects(r, nr)) hit.add(nid);
      }
      for (const f of Object.values(doc.frames)) if (contains(r, { ...f, h: 30 })) hit.add(f.id);
      setSel(hit);
    } else if (g.kind === 'resize') {
      if (!dragging) setDragging(true);
      const dx = (e.clientX - g.sx) / z;
      const dy = (e.clientY - g.sy) / z;
      if (g.scale !== undefined) {
        const scale = Math.max(0.5, Math.min(3, (g.scale * (g.start.w + dx)) / g.start.w));
        preview(updateNode(g.base, g.id, { scale }));
      } else if (g.base.frames[g.id]) {
        preview(updateFrame(g.base, g.id, { w: Math.max(160, g.start.w + dx), h: Math.max(120, g.start.h + dy) }));
      } else {
        preview(updateNode(g.base, g.id, { w: Math.max(140, g.start.w + dx), h: Math.max(80, g.start.h + dy) }));
      }
    } else if (g.kind === 'link') {
      setLinkPreview({ from: g.from, ...toWorld(e.clientX, e.clientY) });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = undefined;
    setDragging(false);
    if (!g) return;
    if (g.kind === 'move' && g.moved) commit(histRef.current.present, g.base);
    else if (g.kind === 'resize') commit(histRef.current.present, g.base);
    else if (g.kind === 'marquee') setMarquee(undefined);
    else if (g.kind === 'link') {
      setLinkPreview(undefined);
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-node-id]');
      const to = el?.dataset.nodeId;
      if (to && to !== g.from) {
        commit(addEdge(doc, g.from, to));
        setToast({ text: 'Linked. Double-click the line to name the connection.' });
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    // The click lands on the board while it holds pointer capture, so look at what is under the pointer.
    const target = (document.elementFromPoint(e.clientX, e.clientY) ?? e.target) as HTMLElement;
    if (target.closest('.cv-focus-top, .cv-focus-bottom, .cv-inkbar')) return;
    const edgeEl = target.closest<HTMLElement | SVGElement>('[data-edge-id]');
    if (edgeEl) return setEditingEdge(edgeEl.dataset.edgeId);
    const frameEl = target.closest<HTMLElement>('[data-frame-id]');
    if (frameEl) return setEditingFrame(frameEl.dataset.frameId);
    const nodeEl = target.closest<HTMLElement>('[data-node-id]');
    if (nodeEl) {
      const n = doc.nodes[nodeEl.dataset.nodeId!];
      if (n?.kind === 'note') setEditingNote(n.id);
      else if (n?.kind === 'card') setDrawer(n.itemId);
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    const [next, nid] = addNote(doc, w.x - 110, w.y - 30);
    commit(next);
    setSel(new Set([nid]));
    setEditingNote(nid);
  };

  // ── Commands ────────────────────────────────────────────────────────────────────────────────
  const removeSelection = useCallback(() => {
    if (!sel.size) return;
    const removedCards = [...sel].filter((s) => doc.nodes[s]?.kind === 'card').length;
    commit(removeItems(doc, sel));
    setSel(new Set());
    setToast({
      text: removedCards ? `Removed from this canvas — ${removedCards === 1 ? 'the card is' : 'the cards are'} still in your library.` : 'Removed.',
      actions: [{ label: 'Undo', run: () => setHist((h) => history.undo(h)) }],
    });
  }, [sel, doc, commit]);

  const groupSelection = useCallback(() => {
    const rects = [...sel].filter((s) => doc.nodes[s]).map((s) => rectOf(s)!).filter(Boolean);
    if (!rects.length) return;
    const [next, fid] = addFrame(doc, rects);
    commit(next);
    setSel(new Set([fid]));
    setEditingFrame(fid);
  }, [sel, doc, rectOf, commit]);

  const placeCard = useCallback(
    (itemId: string, at?: { x: number; y: number }, allowDuplicate = false) => {
      const existing = Object.values(doc.nodes).find((n) => n.kind === 'card' && n.itemId === itemId);
      if (existing && !allowDuplicate) {
        setToast({
          text: 'Already on this canvas.',
          actions: [
            { label: 'Show me', run: () => { setSel(new Set([existing.id])); fitRect(rectOf(existing.id), 1); } },
            { label: 'Place another', run: () => placeCard(itemId, at, true) },
          ],
        });
        return;
      }
      let pos = at;
      if (!pos) {
        // Beside the selection if there is one, otherwise the middle of the view.
        const selRect = bounds([...sel].map((s) => rectOf(s)).filter((r): r is Rect => !!r));
        const stack = Object.values(doc.nodes).filter((n) => selRect && n.x > selRect.x + selRect.w).length;
        pos = selRect
          ? { x: selRect.x + selRect.w + 60, y: selRect.y + (stack % 4) * 60 }
          : { x: viewport.x + viewport.w / 2 - CARD_W / 2, y: viewport.y + viewport.h / 2 - 100 };
      }
      const [next, nid] = addCard(doc, itemId, pos.x, pos.y);
      commit(next);
      setSel(new Set([nid]));
    },
    [doc, sel, rectOf, commit, fitRect, viewport.x, viewport.y, viewport.w, viewport.h],
  );

  const keepNoteInLibrary = (nid: string) => {
    const n = doc.nodes[nid];
    if (n?.kind !== 'note' || !n.text.trim()) return;
    const first = n.text.trim().split(/\n|(?<=[.?!])\s/)[0].slice(0, 80);
    const card = library.add({ type: 'note', title: first, body: n.text.trim(), context: `Written on the canvas “${doc.title}”.` });
    let next = removeItems(doc, [nid]);
    const [withCard, cid] = addCard(next, card.id, n.x, n.y);
    next = withCard;
    // Keep its links.
    for (const e of Object.values(doc.edges)) {
      if (e.from === nid) next = addEdge(next, cid, e.to, e.label);
      if (e.to === nid) next = addEdge(next, e.from, cid, e.label);
    }
    commit(next);
    setSel(new Set([cid]));
    setToast({ text: 'Kept in your library. It’s searchable now.' });
  };

  // ── Keyboard ────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target) || drawer) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space') {
        space.current = true;
        rootRef.current?.classList.add('is-panning');
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setHist((h) => (e.shiftKey ? history.redo(h) : history.undo(h)));
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        setHist((h) => history.redo(h));
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSel(new Set([...Object.keys(doc.nodes)]));
      } else if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFind({ q: '', i: 0 });
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        removeSelection();
      } else if (e.key === 'Escape') {
        setSel(new Set());
        setFind(undefined);
      } else if (e.key === '!' || (e.shiftKey && e.key === '1')) {
        fitAll();
      } else if (mod) {
        return;
      } else if (e.key === 'g') {
        groupSelection();
      } else if (e.key === 'f') {
        setFind({ q: '', i: 0 });
      } else if (e.key === 'n') {
        const [next, nid] = addNote(doc, viewport.x + viewport.w / 2 - 110, viewport.y + viewport.h / 2 - 70);
        commit(next);
        setSel(new Set([nid]));
        setEditingNote(nid);
      } else if (e.key === '=' || e.key === '+') zoomAt(1.2);
      else if (e.key === '-') zoomAt(1 / 1.2);
      else if (e.key === '0') setCam((c) => ({ z: 1, x: size.w / 2 - ((size.w / 2 - c.x) / c.z), y: size.h / 2 - ((size.h / 2 - c.y) / c.z) }));
      else if (e.key === 'l' || e.key === '/') setPanel((p) => (p === 'library' ? undefined : 'library'));
      else if (e.key === 'i') setPanel((p) => (p === 'ideas' ? undefined : 'ideas'));
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        space.current = false;
        rootRef.current?.classList.remove('is-panning');
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [doc, drawer, removeSelection, groupSelection, fitAll, zoomAt, commit, size, viewport.x, viewport.y, viewport.w, viewport.h]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), toast.actions ? 6000 : 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Find on canvas ──────────────────────────────────────────────────────────────────────────
  const matches = useMemo(() => {
    if (!find?.q.trim()) return [];
    const q = find.q.toLowerCase();
    return Object.values(doc.nodes)
      .filter((n) => {
        if (n.kind === 'note') return n.text.toLowerCase().includes(q);
        const c = cardById.get(n.itemId);
        return !!c && [c.title, c.quote, c.description, c.body, c.note, c.caption].some((t) => t?.toLowerCase().includes(q));
      })
      .map((n) => n.id);
  }, [find?.q, doc, cardById]);
  const jumpTo = (i: number) => {
    if (!matches.length) return;
    const k = ((i % matches.length) + matches.length) % matches.length;
    setFind((f) => f && { ...f, i: k });
    setSel(new Set([matches[k]]));
    fitRect(rectOf(matches[k]), 1);
  };

  // ── Derived render data ─────────────────────────────────────────────────────────────────────
  const lod = cam.z < LOD_Z;
  const margin = 300 / cam.z;
  const visibleArea = { x: viewport.x - margin, y: viewport.y - margin, w: viewport.w + margin * 2, h: viewport.h + margin * 2 };
  const nodes = Object.values(doc.nodes).filter((n) => sel.has(n.id) || intersects(visibleArea, rectOf(n.id)!));
  const onMeasure = useCallback((nid: string, h: number) => setHeights((m) => (m[nid] === h ? m : { ...m, [nid]: h })), []);

  const itemIds = useMemo(() => new Set(Object.values(doc.nodes).flatMap((n) => (n.kind === 'card' ? [n.itemId] : []))), [doc.nodes]);
  const selectedItems = [...sel].flatMap((s) => {
    const n = doc.nodes[s];
    return n?.kind === 'card' ? [n.itemId] : [];
  });

  // Possible links: close in meaning, not yet connected. Shown only on request, never applied.
  const suggestions = useMemo(() => {
    if (!possible) return [];
    const firstNode = new Map<string, string>();
    for (const n of Object.values(doc.nodes)) if (n.kind === 'card' && !firstNode.has(n.itemId)) firstNode.set(n.itemId, n.id);
    const linked = new Set(Object.values(doc.edges).flatMap((e) => [`${e.from}|${e.to}`, `${e.to}|${e.from}`]));
    return engine
      .affinities([...firstNode.keys()], 0.66)
      .map(({ a, b, sim }) => ({ from: firstNode.get(a)!, to: firstNode.get(b)!, sim, a, b }))
      .filter((s) => !linked.has(`${s.from}|${s.to}`))
      .slice(0, 8)
      .map((s) => {
        const ta = cardById.get(s.a)?.tags ?? [];
        const shared = (cardById.get(s.b)?.tags ?? []).filter((t) => ta.includes(t));
        return { ...s, reason: shared.length ? `both about ${shared.slice(0, 2).join(' & ')}` : 'close in meaning' };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [possible, doc.nodes, doc.edges, revision, cardById]);

  const single = sel.size === 1 ? doc.nodes[[...sel][0]] : undefined;
  const singleRect = single ? rectOf(single.id) : undefined;
  // The frame is at least as wide as its tray, so the buttons never spill past it on a narrow note.
  const trayW = !single ? 0 : single.kind === 'card' ? 240 : single.kind === 'note' && single.text.trim() ? 445 : 365;
  const frameW = singleRect ? Math.max(singleRect.w * cam.z + 20, trayW) : 0;
  const singleEdge = sel.size === 1 ? doc.edges[[...sel][0]] : undefined;
  const recolour = (color?: string) => commit(setInk(doc, [...sel], color));
  const resizeText = (steps: number) => commit(stepNoteSize(doc, [...sel], steps));
  const pct = Math.round(cam.z * 100);

  // Links are single soft arcs that start and end just outside each card (where a small open
  // circle sits). The bow's side and depth vary per link, so lines from one hub fan out freely
  // instead of bundling.
  const edgePath = (a: Rect, b: Rect, seed = '') => {
    const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const gap = 9 / Math.min(1, cam.z);
    const out = (r: Rect, from: { x: number; y: number }, to: Rect) => {
      const e = exitPoint(r, to);
      const len = Math.hypot(e.x - from.x, e.y - from.y) || 1;
      return r.w || r.h ? { x: e.x + ((e.x - from.x) / len) * gap, y: e.y + ((e.y - from.y) / len) * gap } : e;
    };
    const p = out(a, ca, b);
    const q = out(b, cb, a);
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const side = h & 1 ? 1 : -1;
    const bow = side * Math.min(140, len * (0.12 + ((h >>> 1) % 9) / 100));
    const nx = (-dy / len) * bow;
    const ny = (dx / len) * bow;
    const c1 = { x: p.x + dx * 0.3 + nx, y: p.y + dy * 0.3 + ny };
    const c2 = { x: p.x + dx * 0.7 + nx, y: p.y + dy * 0.7 + ny };
    return {
      d: `M${p.x},${p.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${q.x},${q.y}`,
      mid: { x: (p.x + 3 * c1.x + 3 * c2.x + q.x) / 8, y: (p.y + 3 * c1.y + 3 * c2.y + q.y) / 8 },
    };
  };
  const stroke = 1.25 / Math.min(1, cam.z);
  // Dots every 24 world units, thinned out (doubled) when zoomed far out so they never crowd.
  let dotStep = 24 * cam.z;
  while (dotStep < 14) dotStep *= 2;
  // …and fade as you zoom out, so a wide view reads as calm paper rather than a field of specks.
  const dotAlpha = Math.max(0.25, Math.min(1, (cam.z - 0.2) / 0.6)).toFixed(2);

  return (
    <div className="cv-root">
      <header className="cv-head" onPointerDown={(e) => e.stopPropagation()}>
        <a className="btn quiet" href={href('/canvases')}>←</a>
        <input
          className="cv-title"
          value={doc.title}
          onChange={(e) => preview({ ...doc, title: e.target.value })}
          onFocus={() => (titleBase.current = doc)}
          onBlur={() => titleBase.current && commit(histRef.current.present, titleBase.current)}
          aria-label="Canvas name"
        />
        <span className="cv-status">{saved === 'saving' ? 'saving…' : 'saved'}</span>
      </header>

      <div
        ref={rootRef}
        className="cv-stage"
        style={{ backgroundPosition: `${cam.x}px ${cam.y}px`, backgroundSize: `${dotStep}px ${dotStep}px`, ['--dot-a' as string]: dotAlpha }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onDragStart={(e) => e.preventDefault()}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DRAG_TYPE)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(e) => {
          const itemId = e.dataTransfer.getData(DRAG_TYPE);
          if (!itemId) return;
          e.preventDefault();
          const w = toWorld(e.clientX, e.clientY);
          placeCard(itemId, { x: w.x - CARD_W / 2, y: w.y - 40 }, e.altKey);
        }}
      >
        <div className="cv-world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}>
          {Object.values(doc.frames).map((f) => (
            <div key={f.id} className={`cv-frame ${f.tone === 'ink' ? 'is-ink' : ''} ${sel.has(f.id) ? 'is-selected' : ''}`} style={{ left: f.x, top: f.y, width: f.w, height: f.h }}>
              <div className="cv-frame-title" data-frame-id={f.id} style={{ fontSize: Math.max(15, 13 / cam.z) }}>
                {editingFrame === f.id ? (
                  <input
                    autoFocus
                    defaultValue={f.title}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
                    onBlur={(e) => { commit(updateFrame(doc, f.id, { title: e.target.value || 'Untitled group' })); setEditingFrame(undefined); }}
                  />
                ) : (
                  f.title
                )}
              </div>
              {sel.has(f.id) && <div className="cv-resize" data-handle="resize" data-owner={f.id} style={{ transform: `scale(${1 / cam.z})` }} />}
            </div>
          ))}

          {single && singleRect && !dragging && (
            <div
              className="cv-plate"
              style={{
                left: singleRect.x - 10 / cam.z,
                top: singleRect.y - 36 / cam.z,
                width: frameW / cam.z,
                height: singleRect.h + 88 / cam.z,
                borderRadius: 18 / cam.z,
                borderWidth: 1 / cam.z,
                boxShadow: `0 ${12 / cam.z}px ${32 / cam.z}px rgba(41, 31, 24, 0.12)`,
              }}
            />
          )}

          <svg className="cv-edges" width="1" height="1">
            <defs>
              {/* Every ink in the palette, plus any older ink a saved link still uses. */}
              {[...new Set<string | undefined>([...INKS.map((ink) => ink.value), ...Object.values(doc.edges).map((e) => e.color)])].map((color) => (
                <marker key={color ?? 'default'} id={markerId(color)} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto">
                  <circle cx="5" cy="5" r="3.6" className="cv-end" style={{ stroke: color ?? 'var(--ink-blue)' }} />
                </marker>
              ))}
            </defs>
            {Object.values(doc.edges).map((e) => {
              const a = rectOf(e.from);
              const b = rectOf(e.to);
              if (!a || !b) return null;
              const { d } = edgePath(a, b, e.id);
              return (
                <g key={e.id} data-edge-id={e.id} className={`cv-edge ${sel.has(e.id) ? 'is-selected' : ''}`}>
                  <path d={d} className="hit" />
                  <path d={d} className="line" markerStart={`url(#${markerId(e.color)})`} markerEnd={`url(#${markerId(e.color)})`} style={{ strokeWidth: stroke, ['--edge-ink' as string]: e.color }} />
                </g>
              );
            })}
            {suggestions.map((s) => {
              const a = rectOf(s.from);
              const b = rectOf(s.to);
              return a && b ? <path key={`${s.from}-${s.to}`} d={edgePath(a, b, `${s.from}${s.to}`).d} className="cv-edge-suggest" markerStart="url(#cv-end)" markerEnd="url(#cv-end)" style={{ strokeWidth: stroke }} /> : null;
            })}
            {linkPreview && rectOf(linkPreview.from) && (
              <path d={edgePath(rectOf(linkPreview.from)!, { x: linkPreview.x, y: linkPreview.y, w: 0, h: 0 }).d} className="cv-edge-preview" markerStart="url(#cv-end)" style={{ strokeWidth: stroke }} />
            )}
          </svg>

          {nodes.map((n) =>
            n.kind === 'card' ? (
              <CanvasCard key={n.id} node={n} card={cardById.get(n.itemId)} selected={sel.has(n.id)} lod={lod} height={heights[n.id] ?? DEFAULT_H} onMeasure={onMeasure} />
            ) : (
              <CanvasNote
                key={n.id}
                node={n}
                selected={sel.has(n.id)}
                editing={editingNote === n.id}
                onChange={(text) => preview(updateNode(histRef.current.present, n.id, { text }))}
                onDone={() => {
                  setEditingNote(undefined);
                  commit(histRef.current.present, noteBase.current);
                  noteBase.current = undefined;
                }}
              />
            ),
          )}

          {Object.values(doc.edges).map((e) => {
            const a = rectOf(e.from);
            const b = rectOf(e.to);
            if (!a || !b || (!e.label && editingEdge !== e.id)) return null;
            const { mid } = edgePath(a, b, e.id);
            return (
              <div key={e.id} className={`cv-edge-label ${sel.has(e.id) ? 'is-selected' : ''}`} data-edge-id={e.id} style={{ left: mid.x, top: mid.y, transform: `translate(-50%, -50%) scale(${Math.min(1.8, Math.max(1, 1 / cam.z))})`, ['--edge-ink' as string]: e.color }}>
                {editingEdge === e.id ? (
                  <input
                    autoFocus
                    defaultValue={e.label}
                    placeholder="how are these connected?"
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onKeyDown={(ev) => { ev.stopPropagation(); if (ev.key === 'Enter' || ev.key === 'Escape') (ev.target as HTMLInputElement).blur(); }}
                    onBlur={(ev) => { commit(setEdgeLabel(doc, e.id, ev.target.value)); setEditingEdge(undefined); }}
                  />
                ) : (
                  e.label
                )}
              </div>
            );
          })}

          {suggestions.map((s) => {
            const a = rectOf(s.from);
            const b = rectOf(s.to);
            if (!a || !b) return null;
            const { mid } = edgePath(a, b, `${s.from}${s.to}`);
            return (
              <button
                key={`${s.from}-${s.to}`}
                className="cv-suggest-chip"
                style={{ left: mid.x, top: mid.y, transform: `translate(-50%, -50%) scale(${Math.min(1.8, Math.max(1, 1 / cam.z))})` }}
                title="Keep this connection"
                onPointerDown={(ev) => ev.stopPropagation()}
                onClick={() => commit(addEdge(doc, s.from, s.to))}
              >
                + {s.reason}
              </button>
            );
          })}

          {/* Handles live outside nodes so they stay a constant size on screen. */}
          {nodes.map((n) => {
            const r = rectOf(n.id)!;
            return (
              <div key={`h-${n.id}`} className={`cv-handles ${sel.has(n.id) ? 'is-selected' : ''}`} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
                <div className="cv-link-dot" data-handle="link" data-owner={n.id} title="Drag to another card to link" style={{ transform: `translate(50%, -50%) scale(${1 / cam.z})` }} />
                {sel.has(n.id) && <div className="cv-resize" data-handle="resize" data-owner={n.id} style={{ transform: `scale(${1 / cam.z})` }} />}
              </div>
            );
          })}

          {marquee && <div className="cv-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, borderWidth: 1 / cam.z }} />}
        </div>

        {Object.keys(doc.nodes).length === 0 && (
          <div className="cv-empty">
            <p>Nothing here yet — and that’s fine.</p>
            <p>Open your <button className="linkish" onClick={() => setPanel('library')}>library</button> and drag things in, or double-click anywhere to write.</p>
          </div>
        )}

        {/* The selected thing grows a frame: its file name above, what you can do with it below. */}
        {single && singleRect && !dragging && (
          <div
            className={`cv-focus k-${single.kind}`}
            style={{ left: cam.x + singleRect.x * cam.z - 10, top: cam.y + singleRect.y * cam.z - 36, width: frameW, height: singleRect.h * cam.z + 36 + 52 }}
          >
            <div className="cv-focus-top" onPointerDown={(e) => e.stopPropagation()}>
              <IconFile />
              <span>{single.kind === 'card' ? fileNameOf(cardById.get(single.itemId)) : fileName(single.text || 'note', 'txt')}</span>
            </div>
            <div className="cv-focus-bottom" onPointerDown={(e) => e.stopPropagation()}>
              {single.kind === 'card' ? (
                <>
                  <button onClick={() => setDrawer(single.itemId)} title="Open card"><IconOpen /><span>Open</span></button>
                  <button onClick={() => setPanel('ideas')} title="Ideas from this"><IconIdeas /><span>Ideas</span></button>
                </>
              ) : (
                <>
                  <Inks value={single.color} onPick={recolour} />
                  <TextSize value={single.scale ?? 1} onStep={resizeText} />
                  {single.text.trim() && <button onClick={() => keepNoteInLibrary(single.id)} title="Keep in library"><IconKeep /><span>Keep</span></button>}
                </>
              )}
              <button onClick={removeSelection} title="Remove from canvas (the library keeps it)" aria-label="Remove"><IconTrash /></button>
            </div>
          </div>
        )}
        {singleEdge && !dragging && (() => {
          const a = rectOf(singleEdge.from);
          const b = rectOf(singleEdge.to);
          if (!a || !b) return null;
          const { mid } = edgePath(a, b, singleEdge.id);
          return (
            <div className="cv-inkbar" onPointerDown={(e) => e.stopPropagation()} style={{ left: cam.x + mid.x * cam.z, top: cam.y + mid.y * cam.z + 22 }}>
              <Inks value={singleEdge.color} onPick={recolour} />
              <button onClick={removeSelection} title="Remove this link" aria-label="Remove link"><IconTrash /></button>
            </div>
          );
        })()}
      </div>

      {panel && (
        <CanvasSidebar
          tab={panel}
          onTab={setPanel}
          onClose={() => setPanel(undefined)}
          onCanvas={itemIds}
          selected={selectedItems}
          onPlace={(itemId) => placeCard(itemId)}
          onOpen={setDrawer}
        />
      )}

      {find && (
        <div className="cv-find" onPointerDown={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={find.q}
            placeholder="Find on this canvas…"
            onChange={(e) => setFind({ q: e.target.value, i: 0 })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') jumpTo(e.shiftKey ? find.i - 1 : matches[find.i] && sel.has(matches[find.i]) ? find.i + 1 : find.i);
              if (e.key === 'Escape') setFind(undefined);
            }}
          />
          <span>{find.q ? (matches.length ? `${find.i + 1} / ${matches.length}` : 'none') : ''}</span>
          <button className="btn quiet" onClick={() => setFind(undefined)} aria-label="Close find">✕</button>
        </div>
      )}

      <nav className="cv-rail" onPointerDown={(e) => e.stopPropagation()} aria-label="Canvas tools">
        <div className="cv-rail-group">
          <button className={panel === 'library' ? 'on' : ''} onClick={() => setPanel(panel === 'library' ? undefined : 'library')} title="Library (L)" aria-label="Library"><IconLibrary /></button>
          <button className={panel === 'ideas' ? 'on' : ''} onClick={() => setPanel(panel === 'ideas' ? undefined : 'ideas')} title="Ideas (I)" aria-label="Ideas"><IconIdeas /></button>
          <button onClick={() => { const [next, nid] = addNote(doc, viewport.x + viewport.w / 2 - 110, viewport.y + viewport.h / 2 - 70); commit(next); setSel(new Set([nid])); setEditingNote(nid); }} title="New note (N, or double-click)" aria-label="New note"><IconNote /></button>
          <button onClick={groupSelection} disabled={![...sel].some((s) => doc.nodes[s])} title="Group selection (G)" aria-label="Group selection"><IconGroup /></button>
          <button className={possible ? 'on' : ''} onClick={() => setPossible((p) => !p)} title="Possible links: connections you might not have noticed" aria-label="Possible links" aria-pressed={possible}><IconLinks /></button>
        </div>
        <div className="cv-rail-group">
          <button onClick={() => setHist((h) => history.undo(h))} disabled={!hist.past.length} title="Undo (⌘Z)" aria-label="Undo"><IconUndo /></button>
          <button onClick={() => setHist((h) => history.redo(h))} disabled={!hist.future.length} title="Redo (⇧⌘Z)" aria-label="Redo"><IconRedo /></button>
        </div>
      </nav>

      <div className="cv-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button className={showMap ? 'on' : ''} onClick={() => setShowMap((m) => !m)} title="Minimap" aria-label="Toggle minimap" aria-pressed={showMap}><IconMap /></button>
        <button onClick={() => zoomAt(1 / 1.2)} aria-label="Zoom out">−</button>
        <button onClick={() => setCam((c) => ({ z: 1, x: size.w / 2 - (size.w / 2 - c.x) / c.z, y: size.h / 2 - (size.h / 2 - c.y) / c.z }))} title="Actual size (0)" className="pct">{pct}%</button>
        <button onClick={() => zoomAt(1.2)} aria-label="Zoom in">+</button>
        <button onClick={fitAll} title="Fit everything (⇧1)" aria-label="Fit everything"><IconFit /></button>
      </div>

      {showMap && (
        <Minimap
          rects={[
            ...Object.values(doc.frames).map((f) => ({ id: f.id, rect: { x: f.x, y: f.y, w: f.w, h: f.h }, kind: 'frame' as const })),
            ...Object.values(doc.nodes).map((n) => ({ id: n.id, rect: rectOf(n.id)!, kind: n.kind })),
          ]}
          viewport={viewport}
          onTravel={(x, y) => setCam((c) => ({ ...c, x: size.w / 2 - x * c.z, y: size.h / 2 - y * c.z }))}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast.text}
          {toast.actions?.map((a) => (
            <button key={a.label} onClick={() => { a.run(); setToast(undefined); }}>{a.label}</button>
          ))}
        </div>
      )}

      {drawer && (
        <CardDrawer
          id={drawer}
          onClose={() => setDrawer(undefined)}
          onOpen={setDrawer}
          onPlaceHere={(itemId) => { setDrawer(undefined); placeCard(itemId); }}
          onMoreLike={() => { setDrawer(undefined); setPanel('ideas'); }}
        />
      )}
    </div>
  );
}

// ── Ink: the colours notes and links can take ───────────────────────────────────────────────────

/** `value` undefined is the canvas's default blue ink. */
const INKS: { name: string; value?: string; swatch: string }[] = [
  { name: 'Slate', swatch: '#5c606c' },
  { name: 'Ink', value: '#232323', swatch: '#232323' },
  { name: 'Rose', value: '#be7f74', swatch: '#be7f74' },
  { name: 'Mauve', value: '#795058', swatch: '#795058' },
  { name: 'Olive', value: '#908f67', swatch: '#908f67' },
  { name: 'Sand', value: '#eecc89', swatch: '#eecc89' },
  { name: 'Navy', value: '#282d4b', swatch: '#282d4b' },
  { name: 'Brick', value: '#842019', swatch: '#842019' },
  { name: 'Copper', value: '#ba5f24', swatch: '#ba5f24' },
  { name: 'Mist', value: '#d6d8d8', swatch: '#d6d8d8' },
];
const markerId = (color?: string) => (color ? `cv-end-${color.slice(1)}` : 'cv-end');

function Inks({ value, onPick }: { value?: string; onPick: (color?: string) => void }) {
  return (
    <span className="cv-inks" role="radiogroup" aria-label="Ink colour">
      {INKS.map((ink) => (
        <button
          key={ink.name}
          role="radio"
          aria-checked={value === ink.value}
          aria-label={ink.name}
          title={ink.name}
          className={value === ink.value ? 'on' : ''}
          style={{ background: ink.swatch }}
          onClick={() => onPick(ink.value)}
        />
      ))}
    </span>
  );
}

function TextSize({ value, onStep }: { value: number; onStep: (steps: number) => void }) {
  return (
    <span className="cv-size" role="group" aria-label="Text size">
      <button onClick={() => onStep(-1)} disabled={value <= NOTE_SCALE.min} title="Smaller text" aria-label="Smaller text" className="is-small">A</button>
      <button onClick={() => onStep(1)} disabled={value >= NOTE_SCALE.max} title="Larger text" aria-label="Larger text" className="is-large">A</button>
    </span>
  );
}

// ── File names for the frame's tab ──────────────────────────────────────────────────────────────

const EXT: Partial<Record<Card['type'], string>> = { image: 'png', article: 'html', link: 'url', book: 'epub', podcast: 'mp3', song: 'mp3', video: 'mp4' };

function fileName(text: string, ext: string): string {
  const slug = text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36).replace(/_+$/, '');
  return `${slug || 'untitled'}.${ext}`;
}

function fileNameOf(card?: Card): string {
  if (!card) return 'missing.txt';
  const ext = card.cover?.match(/\.([a-z0-9]+)$/i)?.[1] ?? EXT[card.type] ?? 'txt';
  return fileName(card.title, ext.toLowerCase());
}
