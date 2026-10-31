/**
 * Precompute whole-card and passage vectors for the sample library so the app can search by
 * meaning on first load without embedding 50+ cards in the browser.
 *
 *   npm run embed
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Card } from '../src/data/types';
import { localEmbedder, MODEL_ID } from '../src/search/model';
import { cardDocument, cardPassages } from '../src/search/passages';
import { encodeInt8 } from '../src/search/vectors';

const cards: Card[] = JSON.parse(readFileSync(new URL('../src/data/library.json', import.meta.url), 'utf8'));
const out: Record<string, { doc: string; passages: string[] }> = {};

const t0 = Date.now();
for (const card of cards) {
  const passages = cardPassages(card).map((p) => p.text);
  const [doc, ...pv] = await localEmbedder.embedDocs([cardDocument(card), ...passages]);
  out[card.id] = { doc: encodeInt8(doc), passages: pv.map(encodeInt8) };
  process.stdout.write('.');
}

writeFileSync(
  new URL('../src/data/library-vectors.json', import.meta.url),
  JSON.stringify({ model: MODEL_ID, cards: out }),
);
console.log(`\nEmbedded ${cards.length} cards in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
