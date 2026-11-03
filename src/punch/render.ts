import { motif } from './motifs';
import { punches } from './punch';

/**
 * Draws a punched piece: the photo with holes cut through to a sheet of paper beside it, the cut
 * circles heaped on that paper, and any words laid over either half. The same drawing is used for
 * the live preview and for the saved picture. Pixel diagrams can be stamped on too: inked onto the
 * photo, or cut out of it, the paper showing through and the cut pieces laid on the page beside it
 * as if the two had been folded together.
 */

/** Where the paper sits; 'none' is the photo on its own, with no hole punch. */
export type Side = 'above' | 'below' | 'left' | 'right' | 'none';

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

/** A pixel diagram placed on the photo. */
export interface Stamp {
  id: string;
  motif: string;
  /** Centre, as a share of the photo's width and height. */
  x: number;
  y: number;
  /** Width as a share of the photo's width. */
  size: number;
  flip: boolean;
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
  stamps: Stamp[];
  /** 'ink' prints the pixels on the photo; 'cut' cuts them out, through to the paper. */
  pixels: 'ink' | 'cut';
  ink: string;
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
  if (side === 'none') {
    const k = long / Math.max(iw, ih);
    const photo = { x: 0, y: 0, w: Math.round(iw * k), h: Math.round(ih * k) };
    return { width: photo.w, height: photo.h, photo, paper: { x: 0, y: 0, w: 0, h: 0 } };
  }
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

/**
 * A stamp's cells as one path, in the photo's own coordinates (its top left at 0, 0), each row's run
 * of filled cells as a single rectangle so no seams show between them; and the box around it.
 */
export function stampPath(s: Stamp, P: Rect): { path: Path2D; box: Rect } {
  const rows = motif(s.motif).rows;
  const cols = rows[0].length;
  const cell = (s.size * P.w) / cols;
  const x0 = s.x * P.w - (cols * cell) / 2;
  const y0 = s.y * P.h - (rows.length * cell) / 2;
  const path = new Path2D();
  rows.forEach((row, j) => {
    const r = s.flip ? [...row].reverse().join('') : row;
    for (const m of r.matchAll(/#+/g)) path.rect(x0 + m.index! * cell, y0 + j * cell - 0.25, m[0].length * cell, cell + 0.5);
  });
  return { path, box: { x: x0, y: y0, w: cols * cell, h: rows.length * cell } };
}

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
  if (d.side === 'none') {
    // no paper, no fold
  } else if (P.x === Q.x) ctx.fillRect(0, Math.max(P.y, Q.y) - 1, L.width, 2);
  else ctx.fillRect(Math.max(P.x, Q.x) - 1, 0, 2, L.height);

  const stamped = d.stamps.map((s) => ({ s, ...stampPath(s, P) }));
  const boxes = new Map<string, Rect>();
  for (const { s, path, box } of stamped) {
    boxes.set(s.id, { x: P.x + box.x, y: P.y + box.y, w: box.w, h: box.h });
    ctx.save();
    ctx.beginPath();
    ctx.rect(P.x, P.y, P.w, P.h);
    ctx.clip();
    ctx.translate(P.x, P.y);
    ctx.fillStyle = d.pixels === 'cut' && d.side !== 'none' ? d.paper : d.ink;
    ctx.fill(path);
    ctx.restore();
  }
  if (d.pixels === 'cut' && d.side !== 'none') {
    // The cut pieces on the page, where they'd land if the photo were folded shut over it: mirrored
    // across the fold, the photo's own picture on each.
    const across = P.y === Q.y;
    for (const { path } of stamped) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(Q.x, Q.y, Q.w, Q.h);
      ctx.clip();
      if (across) ctx.setTransform(ctx.getTransform().translate(Q.x + Q.w, Q.y).scale(-1, 1));
      else ctx.setTransform(ctx.getTransform().translate(Q.x, Q.y + Q.h).scale(1, -1));
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
      ctx.shadowBlur = Math.max(1, P.w * 0.004);
      ctx.fillStyle = d.paper;
      ctx.fill(path);
      ctx.shadowColor = 'transparent';
      ctx.clip(path);
      ctx.drawImage(img, 0, 0, iw, ih, 0, 0, P.w, P.h);
      ctx.restore();
    }
  }

  const r = d.radius * P.w;
  const sx = iw / P.w;
  const list = d.side === 'none' ? [] : punches(d.seed, d.count, d.radius, P.h / P.w, Q.h / Q.w);

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

  for (const w of d.words) {
    if (!w.text.trim()) continue;
    // with no paper, every word sits on the photo
    const R = w.on === 'photo' || d.side === 'none' ? P : Q;
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
      const onPhoto = w.on === 'photo' || d.side === 'none';
      ctx.fillStyle = onPhoto || isDark(d.paper) ? '#fffaf0' : '#241c16';
      if (onPhoto) {
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
