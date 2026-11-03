import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { asset } from '../asset';
import { library } from '../data/store';
import type { Card } from '../data/types';
import { reencodeImage } from '../handful/image';
import { MOTIFS, motif, type Motif } from '../punch/motifs';
import { MAX_HOLES } from '../punch/punch';
import { draw, layout, type Design, type Rect, type Side, type Stamp, type Words } from '../punch/render';
import { quantize } from './collections/derive';
import './punch.css';

/**
 * Add a new piece from a photo. On its own it's the photo, with words and grain if you like. Switch
 * on the hole punch and a sheet of paper is laid beside it: pick the paper's colour (from the photo
 * or anywhere), punch holes through the photo and watch the circles heap up on the paper. Switch on
 * pixels and stamp pixel diagrams on it: inked onto the photo, or cut out of it onto a page. Saving
 * draws it all into one picture and keeps it in the library.
 *
 * The photo is redrawn through a canvas the moment it's chosen, so its location data and file name
 * never go any further than this screen.
 */

const PREVIEW_LONG = 1400;
const SAVE_LONG = 1000;
const PAPERS = ['#efe9dc', '#f4f1ea', '#e6dcc0', '#d9cf8f', '#c1c1a9', '#232323'];
const INKS = ['#fffaf0', '#f4b9d6', '#e8c46a', '#9fb7d8', '#241c16'];
const SIDES: { side: Side; label: string }[] = [
  { side: 'above', label: 'Paper above' },
  { side: 'below', label: 'Paper below' },
  { side: 'left', label: 'Paper left' },
  { side: 'right', label: 'Paper right' },
];

interface Photo {
  img: HTMLImageElement;
  w: number;
  h: number;
  palette: string[];
  /** The photo's own pixels, for the colour picker. */
  pixels: CanvasRenderingContext2D;
}

let wordId = 0;
let stampId = 0;
const newWords = (on: Words['on']): Words => ({ id: `w${++wordId}`, text: '', on, x: 0.5, y: on === 'paper' ? 0.84 : 0.8, style: 'plain', size: 0.045 });
/** Grain a piece made with a tool starts with, unless you've already set it yourself. */
const PUNCH_GRAIN = 0.3;

export function PunchStudio({ onClose, onSaved }: { onClose: () => void; onSaved: (card: Card) => void }) {
  const [photo, setPhoto] = useState<Photo>();
  const [design, setDesign] = useState<Design>({ side: 'above', paper: PAPERS[0], count: 0, radius: 0.036, seed: 1 + Math.floor(Math.random() * 1e6), words: [], grain: 0, stamps: [], pixels: 'ink', ink: INKS[1] });
  // The hole punch is a tool you switch on; until then the piece is just the photo.
  const [punch, setPunch] = useState(false);
  const [pixelsOn, setPixelsOn] = useState(false);
  const grainTouched = useRef(false);
  /** What a click on the photo takes its colour for, while picking. */
  const [picking, setPicking] = useState<'paper' | 'ink' | false>(false);
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<string>();
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const boxes = useRef(new Map<string, Rect>());
  const born = useRef<number[]>([]);
  const frame = useRef(0);
  const drag = useRef<{ id: string; dx: number; dy: number }>();
  const holding = useRef<number>();
  const fileInput = useRef<HTMLInputElement>(null);
  const outline = useRef<HTMLSpanElement>(null);

  const set = (patch: Partial<Design>) => setDesign((d) => ({ ...d, ...patch }));
  const setWords = (id: string, patch: Partial<Words>) => setDesign((d) => ({ ...d, words: d.words.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
  const setStamp = (id: string, patch: Partial<Stamp>) => setDesign((d) => ({ ...d, stamps: d.stamps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  // Paper is laid beside the photo for the hole punch, or for pixels cut out of it.
  const paperOn = punch || (pixelsOn && design.pixels === 'cut');
  const shown: Design = { ...design, side: paperOn ? design.side : 'none', count: punch ? design.count : 0, stamps: pixelsOn ? design.stamps : [] };
  const L = useMemo(() => (photo ? layout(photo.w, photo.h, shown.side, PREVIEW_LONG) : undefined), [photo, shown.side]);
  const half = (w: Words) => (w.on === 'photo' || !paperOn ? L!.photo : L!.paper);
  const toggle = (tool: 'punch' | 'pixels') => {
    const [on, other] = tool === 'punch' ? [punch, pixelsOn] : [pixelsOn, punch];
    if (!grainTouched.current && !other) set({ grain: on ? 0 : PUNCH_GRAIN });
    (tool === 'punch' ? setPunch : setPixelsOn)(!on);
  };
  const addStamp = (m: Motif) => {
    const rows = m.rows.length;
    const cols = m.rows[0].length;
    // about half the photo across, unless that would make a tall one taller than most of it
    const size = photo ? Math.min(0.5, (0.6 * (photo.h / photo.w) * cols) / rows) : 0.5;
    const s: Stamp = { id: `s${++stampId}`, motif: m.id, x: 0.5, y: 0.5, size, flip: false };
    setDesign((d) => ({ ...d, stamps: [...d.stamps, s] }));
    setSelected(s.id);
  };

  const choose = async (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return setErr(file ? 'That isn’t a picture.' : '');
    setErr('');
    try {
      const url = await reencodeImage(file, 1600, 0.9);
      const img = new Image();
      // onload rather than decode(): decode() can wait indefinitely in a tab that isn't showing.
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('image failed'));
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const pixels = c.getContext('2d', { willReadFrequently: true })!;
      pixels.drawImage(img, 0, 0);
      const small = document.createElement('canvas');
      small.width = 80;
      small.height = Math.max(1, Math.round((80 * img.naturalHeight) / img.naturalWidth));
      const sctx = small.getContext('2d', { willReadFrequently: true })!;
      sctx.drawImage(img, 0, 0, small.width, small.height);
      setPhoto({ img, w: img.naturalWidth, h: img.naturalHeight, palette: quantize(sctx.getImageData(0, 0, small.width, small.height).data, 6), pixels });
    } catch {
      setErr('That picture couldn’t be opened.');
    }
  };

  // Circles that have just been punched grow in over a moment.
  const grow = (i: number) => Math.min(1, Math.max(0, (performance.now() - (born.current[i] ?? 0)) / 240));
  const paint = () => {
    const c = canvas.current;
    if (!c || !photo || !L) return;
    boxes.current = draw(c.getContext('2d')!, photo.img, photo.w, photo.h, shown, L, grow);
    // the outline follows what was just drawn, not the drawing before it
    const b = selected ? boxes.current.get(selected) : undefined;
    if (outline.current) {
      outline.current.hidden = !b;
      if (b) Object.assign(outline.current.style, { left: `${(b.x / L.width) * 100}%`, top: `${(b.y / L.height) * 100}%`, width: `${(b.w / L.width) * 100}%`, height: `${(b.h / L.height) * 100}%` });
    }
    if (born.current.some((t, i) => i < design.count && performance.now() - t < 260)) frame.current = requestAnimationFrame(paint);
  };
  useLayoutEffect(() => {
    cancelAnimationFrame(frame.current);
    paint();
    return () => cancelAnimationFrame(frame.current);
  });

  const punchTo = (count: number) => {
    const n = Math.max(0, Math.min(MAX_HOLES, Math.round(count)));
    const now = performance.now();
    for (let i = design.count; i < n; i++) born.current[i] = now + (i - design.count) * 25;
    set({ count: n });
  };
  // Hold the punch down and it keeps punching.
  const startHold = () => {
    stopHold();
    let n = design.count;
    const step = () => {
      n = Math.min(MAX_HOLES, n + 1);
      born.current[n - 1] = performance.now();
      setDesign((d) => ({ ...d, count: Math.max(d.count, n) }));
      if (n >= MAX_HOLES) stopHold();
    };
    step();
    holding.current = window.setInterval(step, 85);
  };
  const stopHold = () => {
    if (holding.current) clearInterval(holding.current);
    holding.current = undefined;
  };
  useEffect(() => stopHold, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea');
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && design.stamps.some((s) => s.id === selected)) {
        e.preventDefault();
        return setDesign((d) => ({ ...d, stamps: d.stamps.filter((x) => x.id !== selected) }));
      }
      if (e.key !== 'Escape') return;
      if (picking) return setPicking(false);
      if (photo) setAsking(true);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** A pointer on the preview, in the piece's own pixels. */
  const at = (e: ReactPointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * L!.width, y: ((e.clientY - r.top) / r.height) * L!.height };
  };
  const inside = (p: { x: number; y: number }, R: Rect) => p.x >= R.x && p.x <= R.x + R.w && p.y >= R.y && p.y <= R.y + R.h;

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!photo || !L) return;
    const p = at(e);
    if (picking) {
      if (!inside(p, L.photo)) return setPicking(false);
      const ix = Math.round(((p.x - L.photo.x) / L.photo.w) * photo.w);
      const iy = Math.round(((p.y - L.photo.y) / L.photo.h) * photo.h);
      const d = photo.pixels.getImageData(Math.max(0, ix - 2), Math.max(0, iy - 2), 5, 5).data;
      let [r, g, b, n] = [0, 0, 0, 0];
      for (let i = 0; i < d.length; i += 4) [r, g, b, n] = [r + d[i], g + d[i + 1], b + d[i + 2], n + 1];
      const hex = `#${[r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('')}`;
      set(picking === 'ink' ? { ink: hex } : { paper: hex });
      return setPicking(false);
    }
    const on = (id: string) => boxes.current.get(id) && inside(p, boxes.current.get(id)!);
    // words sit above the pixels, so they're found first
    const hit: Words | Stamp | undefined = [...design.words].reverse().find((w) => on(w.id)) ?? [...shown.stamps].reverse().find((s) => on(s.id));
    setSelected(hit?.id);
    if (!hit) return;
    const R = 'text' in hit ? half(hit) : L.photo;
    drag.current = { id: hit.id, dx: p.x - (R.x + hit.x * R.w), dy: p.y - (R.y + hit.y * R.h) };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const g = drag.current;
    if (!g || !L) return;
    const p = at(e);
    const w = design.words.find((x) => x.id === g.id);
    if (!w) {
      // pixels can run off the edge of the photo, as long as their middle stays on it
      const R = L.photo;
      const clamp = (v: number) => Math.min(1, Math.max(0, v));
      return setStamp(g.id, { x: clamp((p.x - g.dx - R.x) / R.w), y: clamp((p.y - g.dy - R.y) / R.h) });
    }
    const R = half(w);
    const clamp = (v: number) => Math.min(0.97, Math.max(0.03, v));
    setWords(g.id, { x: clamp((p.x - g.dx - R.x) / R.w), y: clamp((p.y - g.dy - R.y) / R.h) });
  };
  const onUp = () => (drag.current = undefined);

  const save = () => {
    if (!photo) return;
    const out = layout(photo.w, photo.h, shown.side, SAVE_LONG);
    const c = document.createElement('canvas');
    c.width = out.width;
    c.height = out.height;
    draw(c.getContext('2d')!, photo.img, photo.w, photo.h, shown, out);
    const cover = c.toDataURL('image/jpeg', 0.8);
    const said = design.words.map((w) => w.text.trim()).filter(Boolean);
    const stamps = shown.stamps.length;
    const where = design.side === 'above' || design.side === 'below' ? design.side : `to its ${design.side === 'left' ? 'left' : 'right'}`;
    const told = [
      punch && `punched with ${design.count} ${design.count === 1 ? 'hole' : 'holes'}, the cut circles heaped on a sheet of paper ${where}`,
      stamps > 0 &&
        (design.pixels === 'cut'
          ? `with ${stamps === 1 ? 'a pixel ornament' : `${stamps} pixel ornaments`} cut out of it, the pieces laid on a page ${where}`
          : `printed with ${stamps === 1 ? 'a pixel ornament' : `${stamps} pixel ornaments`}`),
    ].filter(Boolean);
    const card = library.add({
      type: 'image',
      title: title.trim() || said[0]?.split('\n')[0] || (punch ? 'A punched photo' : stamps ? 'A photo in pixels' : 'A photo'),
      caption: told.length ? `A photo ${told.join(', and ')}.` : undefined,
      ocr: said.join(' · ') || undefined,
      cover,
      palette: paperOn ? [design.paper, ...photo.palette.slice(0, 4)] : stamps ? [design.ink, ...photo.palette.slice(0, 4)] : photo.palette,
      tags: ['made', ...(punch ? ['hole punch'] : []), ...(stamps ? ['pixels'] : [])],
      origin: 'mine',
    });
    onSaved(card);
  };

  const sel = design.words.find((w) => w.id === selected) ?? shown.stamps.find((s) => s.id === selected);
  const selStamp = shown.stamps.find((s) => s.id === selected);

  // On <body>, above everything, so no page around it (or its animations) can stack over it.
  return createPortal(
    <div className="ps" role="dialog" aria-label="Make a new piece">
      <header className="ps-head">
        <span className="ps-kicker">New piece</span>
        <h2>{punch && pixelsOn ? 'Hole punch & pixels' : punch ? 'Hole punch' : pixelsOn ? 'Pixels' : 'Add a photo'}</h2>
        {asking ? (
          <span className="ps-ask" role="alertdialog" aria-label="Discard this piece?">
            Discard this piece?
            <button className="ps-link" onClick={onClose} autoFocus>Discard</button>
            <button className="ps-link" onClick={() => setAsking(false)}>Keep making</button>
          </span>
        ) : (
          <button className="ps-link" onClick={() => (photo ? setAsking(true) : onClose())}>Cancel</button>
        )}
      </header>

      <div className="ps-body">
        <div
          className={`ps-stage ${over ? 'is-over' : ''}`}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void choose(e.dataTransfer.files[0]);
          }}
        >
          {photo && L ? (
            <div className="ps-frame" style={{ '--ratio': L.width / L.height } as CSSProperties}>
              <canvas
                ref={canvas}
                width={L.width}
                height={L.height}
                className={picking ? 'is-picking' : ''}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                aria-label="Preview of the piece"
              />
              {sel && !picking && <span ref={outline} className="ps-selected" hidden />}
              {picking && <span className="ps-hint">Click the photo to take a colour from it</span>}
              {!picking && selStamp && <span className="ps-hint">Drag the pixels to place them · Delete removes them</span>}
            </div>
          ) : (
            <button className="ps-drop" onClick={() => fileInput.current?.click()}>
              <b>Choose a photo</b>
              <span>or drop one here. It’s redrawn on this device, so its location and file name stay behind.</span>
            </button>
          )}
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void choose(e.target.files?.[0] ?? undefined)} />
          {err && <p className="ps-err">{err}</p>}
        </div>

        <aside className="ps-panel" aria-label="Make it">
          <section>
            <h3>Photo</h3>
            <button className="ps-btn" onClick={() => fileInput.current?.click()}>{photo ? 'Choose another' : 'Choose a photo'}</button>
          </section>

          <section className={photo ? '' : 'is-off'}>
            <h3>Tools</h3>
            <button className={`ps-tool ${punch ? 'is-on' : ''}`} aria-pressed={punch} onClick={() => toggle('punch')}>
              <img className="ps-tool-icon" src={asset('/tools/hole-punch.jpg')} alt="" />
              <span>
                <b>Hole punch</b>
                <small>{punch ? 'On. Lay paper beside the photo and punch through it.' : 'Lay paper beside the photo and punch holes through it.'}</small>
              </span>
            </button>
            <button className={`ps-tool ${pixelsOn ? 'is-on' : ''}`} aria-pressed={pixelsOn} onClick={() => toggle('pixels')}>
              <img className="ps-tool-icon" src={asset('/tools/pixels.png')} alt="" />
              <span>
                <b>Pixels</b>
                <small>{pixelsOn ? 'On. Stamp pixel ornaments on the photo, or cut them out.' : 'Stamp pixel ornaments on the photo, or cut them out onto a page.'}</small>
              </span>
            </button>
          </section>

          {pixelsOn && (
          <section className={photo ? '' : 'is-off'}>
            <h3>Pixels</h3>
            <span className="ps-seg is-text" role="radiogroup" aria-label="Ink or cut">
              <button role="radio" aria-checked={design.pixels === 'ink'} className={design.pixels === 'ink' ? 'on' : ''} onClick={() => set({ pixels: 'ink' })}>On the photo</button>
              <button role="radio" aria-checked={design.pixels === 'cut'} className={design.pixels === 'cut' ? 'on' : ''} onClick={() => set({ pixels: 'cut' })}>Cut onto a page</button>
            </span>
            <div className="ps-motifs" aria-label="Add a pixel ornament">
              {MOTIFS.map((m) => (
                <button key={m.id} title={`Add ${m.name}`} aria-label={`Add ${m.name}`} onClick={() => addStamp(m)} disabled={!photo}>
                  <MotifIcon m={m} />
                </button>
              ))}
            </div>
            {design.pixels === 'ink' && (
              <>
                <div className="ps-swatches" role="radiogroup" aria-label="Pixel colour">
                  {[...INKS, ...(photo?.palette ?? [])].map((c, i) => (
                    <button key={`${c}${i}`} role="radio" aria-checked={design.ink === c} aria-label={c} title={i < INKS.length ? c : `${c}, from the photo`} className={design.ink === c ? 'on' : ''} style={{ background: c }} onClick={() => set({ ink: c })} />
                  ))}
                </div>
                <div className="ps-row">
                  <button className={`ps-btn ${picking === 'ink' ? 'is-on' : ''}`} onClick={() => setPicking((v) => (v === 'ink' ? false : 'ink'))} disabled={!photo}>
                    {picking === 'ink' ? 'Picking… (Esc)' : 'Pick from photo'}
                  </button>
                  <label className="ps-custom" title="Any colour">
                    <input type="color" value={design.ink} onChange={(e) => set({ ink: e.target.value })} />
                    <span>Any colour</span>
                  </label>
                </div>
              </>
            )}
            {selStamp ? (
              <div className="ps-words is-selected">
                <div className="ps-row">
                  <span className="ps-kicker">{motif(selStamp.motif).name}</span>
                  <button className="ps-link" onClick={() => setStamp(selStamp.id, { flip: !selStamp.flip })}>Flip</button>
                  <button className="ps-link" onClick={() => addStamp(motif(selStamp.motif))}>Another</button>
                  <button className="ps-link" onClick={() => setDesign((d) => ({ ...d, stamps: d.stamps.filter((x) => x.id !== selStamp.id) }))}>Remove</button>
                </div>
                <label className="ps-slider">
                  <span>Size</span>
                  <input type="range" min={0.08} max={1.4} step={0.005} value={selStamp.size} onChange={(e) => setStamp(selStamp.id, { size: +e.target.value })} />
                </label>
              </div>
            ) : (
              <p className="ps-note">{design.stamps.length ? 'Click pixels on the preview to size, flip or move them.' : 'Choose an ornament to place it on the photo.'}</p>
            )}
          </section>
          )}

          {paperOn && (
          <>
          <section className={photo ? '' : 'is-off'}>
            <h3>Paper</h3>
            <div className="ps-seg" role="radiogroup" aria-label="Where the paper goes">
              {SIDES.map((s) => (
                <button key={s.side} role="radio" aria-checked={design.side === s.side} aria-label={s.label} title={s.label} className={design.side === s.side ? 'on' : ''} onClick={() => set({ side: s.side })}>
                  <SideIcon side={s.side} />
                </button>
              ))}
            </div>
            <div className="ps-swatches" role="radiogroup" aria-label="Paper colour">
              {[...PAPERS, ...(photo?.palette ?? [])].map((c, i) => (
                <button key={`${c}${i}`} role="radio" aria-checked={design.paper === c} aria-label={c} title={i < PAPERS.length ? c : `${c}, from the photo`} className={design.paper === c ? 'on' : ''} style={{ background: c }} onClick={() => set({ paper: c })} />
              ))}
            </div>
            <div className="ps-row">
              <button className={`ps-btn ${picking === 'paper' ? 'is-on' : ''}`} onClick={() => setPicking((v) => (v === 'paper' ? false : 'paper'))} disabled={!photo}>
                {picking === 'paper' ? 'Picking… (Esc)' : 'Pick from photo'}
              </button>
              <label className="ps-custom" title="Any colour">
                <input type="color" value={design.paper} onChange={(e) => set({ paper: e.target.value })} />
                <span>Any colour</span>
              </label>
            </div>
          </section>

          {punch && (
          <section className={photo ? '' : 'is-off'}>
            <h3>Punch</h3>
            <button
              className="ps-punch"
              disabled={!photo || design.count >= MAX_HOLES}
              onPointerDown={(e) => (e.button === 0 ? startHold() : undefined)}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), punchTo(design.count + 1))}
            >
              <span className="ps-punch-dot" aria-hidden />
              Hold to punch
            </button>
            <label className="ps-slider">
              <span>Holes <b>{design.count}</b></span>
              <input type="range" min={0} max={MAX_HOLES} value={design.count} onChange={(e) => punchTo(+e.target.value)} />
            </label>
            <label className="ps-slider">
              <span>Size</span>
              <input type="range" min={0.02} max={0.08} step={0.002} value={design.radius} onChange={(e) => set({ radius: +e.target.value })} />
            </label>
            <div className="ps-row">
              <button className="ps-btn" onClick={() => set({ seed: 1 + Math.floor(Math.random() * 1e6) })} disabled={!photo}>Scatter again</button>
              <button className="ps-btn" onClick={() => set({ count: 0 })} disabled={!photo || !design.count}>Mend</button>
            </div>
          </section>
          )}
          </>
          )}

          <section className={photo ? '' : 'is-off'}>
            <h3>Grain</h3>
            <label className="ps-slider">
              <span>Fine grain <b>{Math.round(design.grain * 100)}</b></span>
              <input type="range" min={0} max={1} step={0.01} value={design.grain} onChange={(e) => ((grainTouched.current = true), set({ grain: +e.target.value }))} />
            </label>
          </section>

          <section className={photo ? '' : 'is-off'}>
            <h3>Words</h3>
            {design.words.map((w) => (
              <div key={w.id} className={`ps-words ${selected === w.id ? 'is-selected' : ''}`} onFocus={() => setSelected(w.id)}>
                <textarea rows={2} value={w.text} placeholder="Why do we give flowers to the people we love?" onChange={(e) => setWords(w.id, { text: e.target.value })} autoFocus={!w.text} />
                <div className="ps-row">
                  {paperOn && (
                  <span className="ps-seg is-text" role="radiogroup" aria-label="Which half">
                    <button role="radio" aria-checked={w.on === 'paper'} className={w.on === 'paper' ? 'on' : ''} onClick={() => setWords(w.id, { on: 'paper' })}>Paper</button>
                    <button role="radio" aria-checked={w.on === 'photo'} className={w.on === 'photo' ? 'on' : ''} onClick={() => setWords(w.id, { on: 'photo' })}>Photo</button>
                  </span>
                  )}
                  <span className="ps-seg is-text" role="radiogroup" aria-label="Style">
                    <button role="radio" aria-checked={w.style === 'plain'} className={w.style === 'plain' ? 'on' : ''} onClick={() => setWords(w.id, { style: 'plain' })}>Plain</button>
                    <button role="radio" aria-checked={w.style === 'strip'} className={w.style === 'strip' ? 'on' : ''} onClick={() => setWords(w.id, { style: 'strip' })}>Cut out</button>
                  </span>
                  <button className="ps-link" onClick={() => setDesign((d) => ({ ...d, words: d.words.filter((x) => x.id !== w.id) }))} aria-label="Remove these words">Remove</button>
                </div>
                <label className="ps-slider">
                  <span>Size</span>
                  <input type="range" min={0.025} max={0.1} step={0.001} value={w.size} onChange={(e) => setWords(w.id, { size: +e.target.value })} />
                </label>
              </div>
            ))}
            <button
              className="ps-btn"
              disabled={!photo}
              onClick={() => {
                const w = newWords(!paperOn || design.words.some((x) => x.on === 'paper') ? 'photo' : 'paper');
                setDesign((d) => ({ ...d, words: [...d.words, w] }));
                setSelected(w.id);
              }}
            >
              + Add words
            </button>
            {design.words.length > 0 && <p className="ps-note">Drag words on the preview to place them.</p>}
          </section>

          <section className={`ps-save ${photo ? '' : 'is-off'}`}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give it a title (optional)" aria-label="Title" />
            <button className="ps-btn is-solid" onClick={save} disabled={!photo}>Keep in your library</button>
          </section>
        </aside>
      </div>
    </div>,
    document.body,
  );
}

function SideIcon({ side }: { side: Side }) {
  const across = side === 'left' || side === 'right';
  const paperFirst = side === 'above' || side === 'left';
  const a = across ? { x: 2, y: 4, w: 9, h: 12 } : { x: 4, y: 2, w: 12, h: 8 };
  const b = across ? { x: 11, y: 4, w: 9, h: 12 } : { x: 4, y: 10, w: 12, h: 8 };
  const [paper, pic] = paperFirst ? [a, b] : [b, a];
  return (
    <svg width="22" height="20" viewBox="0 0 22 20" aria-hidden>
      <rect {...pic} fill="currentColor" opacity="0.75" />
      <rect {...paper} fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx={paper.x + paper.w / 2} cy={paper.y + paper.h / 2} r="1.4" fill="currentColor" />
    </svg>
  );
}

/** A small picture of a pixel ornament, one square per filled cell. */
function MotifIcon({ m }: { m: Motif }) {
  const d = useMemo(() => m.rows.flatMap((row, y) => [...row.matchAll(/#+/g)].map((r) => `M${r.index},${y}h${r[0].length}v1h-${r[0].length}z`)).join(''), [m]);
  return (
    <svg viewBox={`-1 -1 ${m.rows[0].length + 2} ${m.rows.length + 2}`} aria-hidden>
      <path d={d} fill="currentColor" shapeRendering="crispEdges" />
    </svg>
  );
}
