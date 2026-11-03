import { punches } from './punch';

/**
 * Draws a punched piece: the photo with holes cut through to a sheet of paper beside it, the cut
 * circles heaped on that paper, and any words laid over either half. The same drawing is used for
 * the live preview and for the saved picture.
 */

export type Side = 'above' | 'below' | 'left' | 'right';

export interface Words {
  id: string;
  text: string;
  on: 'photo' | 'paper';
  /** Centre, as a share of the half's width and height. */
  x: number;
  y: number;
  style: 'plain' | 'strip';
  /** Letter height as a share of the half's width. */
  size: number;
}

export interface Design {
  /** Where the paper sits, relative to the photo. */
  side: Side;
  paper: string;
  count: number;
  /** Hole radius as a share of the half's width. */
  radius: number;
  seed: number;
  words: Words[];
  /** Film grain over the whole piece, 0 (none) to 1. */
  grain: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  width: number;
  height: number;
  photo: Rect;
  paper: Rect;
}

/** The photo at a size where the whole piece is `long` pixels on its longer side; the paper matches it. */
export function layout(iw: number, ih: number, side: Side, long: number): Layout {
  const across = side === 'left' || side === 'right';
  const k = long / Math.max(across ? iw * 2 : iw, across ? ih : ih * 2);
  const w = Math.round(iw * k);
  const h = Math.round(ih * k);
  const first: Rect = { x: 0, y: 0, w, h };
  const second: Rect = across ? { x: w, y: 0, w, h } : { x: 0, y: h, w, h };
  const paperFirst = side === 'above' || side === 'left';
  return { width: across ? w * 2 : w, height: across ? h : h * 2, photo: paperFirst ? second : first, paper: paperFirst ? first : second };
}

export function isDark(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

/** A tile of fine, soft-edged noise, grey around the middle; made once and repeated across the piece. */
let grainTile: HTMLCanvasElement | undefined;
function grainPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (!grainTile) {
    grainTile = document.createElement('canvas');
    grainTile.width = grainTile.height = 256;
    const g = grainTile.getContext('2d')!;
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      // the sum of three randoms leans toward the middle, so most specks are faint
      const v = Math.min(255, Math.max(0, 128 + ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 420));
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  return ctx.createPattern(grainTile, 'repeat');
}

const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;

/** Draw the piece; returns where each piece of text ended up, for dragging it. */
export function draw(ctx: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, d: Design, L: Layout, grow?: (i: number) => number): Map<string, Rect> {
  const { photo: P, paper: Q } = L;
  ctx.save();
  ctx.clearRect(0, 0, L.width, L.height);

  ctx.fillStyle = d.paper;
  ctx.fillRect(Q.x, Q.y, Q.w, Q.h);
  ctx.drawImage(img, 0, 0, iw, ih, P.x, P.y, P.w, P.h);

  // a faint fold where the photo meets the paper
  ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
  if (P.x === Q.x) ctx.fillRect(0, Math.max(P.y, Q.y) - 1, L.width, 2);
  else ctx.fillRect(Math.max(P.x, Q.x) - 1, 0, 2, L.height);

  const r = d.radius * P.w;
  const sx = iw / P.w;
  const list = punches(d.seed, d.count, d.radius, P.h / P.w, Q.h / Q.w);

  list.forEach((p, i) => {
    const t = grow ? grow(i) : 1;
    const hx = P.x + p.hole.x * P.w;
    const hy = P.y + p.hole.y * P.h;
    // the hole: paper showing through, with a little shade along its top edge
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, r * Math.min(1, t * 1.4), 0, Math.PI * 2);
    ctx.fillStyle = d.paper;
    ctx.fill();
    ctx.clip();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = r * 0.35;
    ctx.shadowOffsetY = r * 0.12;
    ctx.lineWidth = r * 0.5;
    ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
    ctx.beginPath();
    ctx.arc(hx, hy, r * 1.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  list.forEach((p, i) => {
    const t = grow ? grow(i) : 1;
    if (t <= 0) return;
    const hx = p.hole.x * iw;
    const hy = p.hole.y * ih;
    const dx = Q.x + p.dot.x * Q.w;
    const dy = Q.y + p.dot.y * Q.h;
    const rr = r * (0.6 + 0.4 * t);
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 1.5);
    ctx.translate(dx, dy);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = r * 0.22;
    ctx.shadowOffsetY = r * 0.08;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.fillStyle = d.paper;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    ctx.rotate(p.turn);
    ctx.drawImage(img, hx - r * sx, hy - r * sx, 2 * r * sx, 2 * r * sx, -rr, -rr, 2 * rr, 2 * rr);
    ctx.restore();
  });

  const boxes = new Map<string, Rect>();
  for (const w of d.words) {
    if (!w.text.trim()) continue;
    const R = w.on === 'photo' ? P : Q;
    const px = Math.max(10, w.size * R.w);
    const lines = w.text.split('\n');
    ctx.font = `400 ${px}px "EB Garamond", Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lh = px * 1.2;
    const wide = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const cx = R.x + w.x * R.w;
    const cy = R.y + w.y * R.h;
    const top = cy - (lh * lines.length) / 2;
    ctx.save();
    if (w.style === 'strip') {
      // words cut from a page and laid on top, each line its own slip, slightly askew
      const tilt = (((hash(w.id) % 1000) / 1000 - 0.5) * 3 * Math.PI) / 180;
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      ctx.translate(-cx, -cy);
      lines.forEach((l, j) => {
        const lw = ctx.measureText(l).width + px * 0.7;
        const y = top + lh * j + lh / 2;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
        ctx.shadowBlur = px * 0.15;
        ctx.shadowOffsetY = px * 0.05;
        ctx.fillStyle = '#f3efe6';
        ctx.fillRect(cx - lw / 2, y - lh * 0.48, lw, lh * 0.96);
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#241c16';
        ctx.fillText(l, cx, y + px * 0.04);
      });
    } else {
      const light = w.on === 'photo' || isDark(d.paper);
      ctx.fillStyle = light ? '#fffaf0' : '#241c16';
      if (w.on === 'photo') {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = px * 0.3;
      }
      lines.forEach((l, j) => ctx.fillText(l, cx, top + lh * j + lh / 2 + px * 0.04));
    }
    ctx.restore();
    const pad = px * 0.4;
    boxes.set(w.id, { x: cx - wide / 2 - pad, y: top - pad, w: wide + pad * 2, h: lh * lines.length + pad * 2 });
  }

  // Grain last, over photo, paper and words alike, as if the whole thing were printed.
  const pattern = d.grain > 0 ? grainPattern(ctx) : null;
  if (pattern) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = Math.min(1, d.grain) * 0.6;
    // the same size of speck relative to the piece, whether drawn for the preview or for saving
    const k = Math.max(1, L.width / 640);
    pattern.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, L.width, L.height);
  }
  ctx.restore();
  return boxes;
}
