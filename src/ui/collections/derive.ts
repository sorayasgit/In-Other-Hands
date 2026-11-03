import { createElement, useEffect, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Card } from '../../data/types';
import { CardArt } from '../CardArt';

/**
 * Derived, read-only facts about an image card, computed in the browser and cached for the session:
 * the raster we display (PNG), its resolution and byte size, and a 4–6 colour palette extracted
 * from its pixels by simple quantisation. Nothing here is written back to the card.
 */

export const IMAGE_RATIO = 0.72;
const RASTER_W = 1600;

export interface ImageFacts {
  url: string;
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  /** Light to dark. */
  palette: string[];
  colorProfile: 'sRGB';
}

const cache = new Map<string, Promise<ImageFacts>>();

const keyOf = (card: Card) => `${card.id}:${card.cover ?? (card.palette ?? []).join(',')}`;

export function imageFacts(card: Card): Promise<ImageFacts> {
  const key = keyOf(card);
  let p = cache.get(key);
  if (!p) {
    p = rasterize(card);
    cache.set(key, p);
  }
  return p;
}

export function useImageFacts(card: Card | undefined): ImageFacts | undefined {
  const [facts, setFacts] = useState<ImageFacts>();
  useEffect(() => {
    if (!card || (card.type !== 'image' && !card.cover)) return setFacts(undefined);
    let live = true;
    imageFacts(card).then((f) => live && setFacts(f), () => live && setFacts(undefined));
    return () => {
      live = false;
    };
  }, [card?.id, card?.cover, card?.palette?.join(',')]);
  return facts;
}

async function rasterize(card: Card): Promise<ImageFacts> {
  const img = new Image();
  if (card.cover) {
    img.src = card.cover;
  } else {
    const svg = renderToStaticMarkup(createElement(CardArt, { card, ratio: IMAGE_RATIO })).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  await img.decode();

  // A real picture keeps its own size; a drawn one is rendered at a fixed width.
  const width = card.cover ? img.naturalWidth : RASTER_W;
  const height = card.cover ? img.naturalHeight : Math.round(RASTER_W * IMAGE_RATIO);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/png'));

  // Palette from a small copy: fewer pixels, same proportions.
  const small = document.createElement('canvas');
  small.width = 80;
  small.height = Math.max(1, Math.round((80 * height) / width));
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0, small.width, small.height);
  const palette = quantize(sctx.getImageData(0, 0, small.width, small.height).data);

  return { url: URL.createObjectURL(blob), blob, width, height, bytes: blob.size, palette, colorProfile: 'sRGB' };
}

/** 4-bit-per-channel buckets, most common first, merging near-duplicates; returns 4–6 colours. */
export function quantize(data: Uint8ClampedArray, max = 6): string[] {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const c = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++;
    c.r += data[i];
    c.g += data[i + 1];
    c.b += data[i + 2];
    counts.set(key, c);
  }
  const ranked = [...counts.values()].sort((a, b) => b.n - a.n).map((c) => [c.r / c.n, c.g / c.n, c.b / c.n]);
  const picked: number[][] = [];
  for (const c of ranked) {
    if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 38)) picked.push(c);
    if (picked.length === max) break;
  }
  const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return picked
    .sort((a, b) => lum(b) - lum(a))
    .map((c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
