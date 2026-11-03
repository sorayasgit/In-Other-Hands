/**
 * Writes a placeholder SVG for every image named in src/data/community.json into public/handful/.
 * Drop a real asset in with the same filename to replace one. Existing files are left alone.
 *
 *   npx tsx scripts/handful-placeholders.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const TONES = ['#EFE6D2', '#E3D6B8', '#8A8B5C', '#6E7148', '#9C7350', '#6B4A33'];
const pieces: { image?: string; title: string }[] = JSON.parse(readFileSync(new URL('../src/data/community.json', import.meta.url), 'utf8'));
const dir = new URL('../public/handful/', import.meta.url);
mkdirSync(dir, { recursive: true });

function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 13), 1274126177)) >>> 0) / 4294967296;
}

let written = 0;
for (const { image, title } of pieces) {
  if (!image) continue;
  const file = new URL(image, dir);
  if (existsSync(file)) continue;
  const r = rng(image);
  const shapes = Array.from({ length: 6 }, (_, i) => {
    const c = TONES[2 + Math.floor(r() * 4)];
    const x = Math.round(r() * 400);
    const y = Math.round(r() * 300);
    const s = Math.round(40 + r() * 140);
    return i % 3 === 0
      ? `<circle cx="${x}" cy="${y}" r="${s / 2}" fill="${c}" opacity="0.85"/>`
      : i % 3 === 1
        ? `<rect x="${x - s / 2}" y="${y - s / 3}" width="${s}" height="${Math.round(s * 0.6)}" rx="4" fill="${c}" opacity="0.8"/>`
        : `<rect x="0" y="${y}" width="400" height="${Math.round(6 + r() * 26)}" fill="${c}" opacity="0.55"/>`;
  });
  writeFileSync(
    file,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img" aria-label="${title.replace(/"/g, '')} (placeholder)"><rect width="400" height="300" fill="${TONES[r() < 0.5 ? 0 : 1]}"/>${shapes.join('')}</svg>\n`,
  );
  written++;
}
console.log(`Wrote ${written} placeholder(s) to public/handful/`);
