# In Other Hands

A quiet library of things you've kept, with two tools on top:

- **Recall** — find the thing however you remember it: by meaning, a fragment, a colour, roughly
  when, or what you used it for. Refine with plain follow-ups ("no, more about design").
- **Canvas** — an infinite surface where library cards become material to think with: arrange,
  group, link, and let the library suggest what else belongs.

Everything runs on your machine. The search model (bge-small, ~33 MB) downloads once from Hugging
Face's CDN and is cached by the browser; no card text or query leaves the device.

## Run it

Needs Node ≥ 20.19 (developed on Node 24).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 26 tests: real-model search scenarios + canvas model
npm run embed      # rebuild src/data/library-vectors.json after editing library.json
```

## Try these

**Recall** (library page)

| Type | What happens |
|---|---|
| `That article I read about how good design is invisible.` | "The Best Interface Is the One You Forget" first — the card never says *invisible* |
| `The image I saved with the orange and brown color palette.` | Warm, earthy images first; chips show *image · orange · brown* |
| `That quote about how children learn through curiosity.` | The Anatole France quote first, the children's-learning article right behind |
| `Something I saved a few months ago about technology and human behavior` | Time window chip; "The Feedback Loop in Your Pocket" first |
| `the packaging pitch for that food brand` | Found by *where you used it* (the card's context) |
| `poster that said painted desert` | Found by text inside an image |
| then refine: `no, it was more about design` / `I think it was a quote` / `saved around the same time` / `not about productivity` | Each becomes a removable chip; results update in place |

Click × on any "reading this as" chip if the guess was wrong. **Wander** shuffles everything (the
shuffle is in the URL, so it's repeatable). Open a card for *close in meaning*, *kept around the same
time*, and which canvases it's on; edit its note and it's re-indexed immediately.

**Canvas** (Canvases → "Warmth, for Harvest Co.")

| Do | Result |
|---|---|
| Scroll / pinch (or ⌘-scroll) | Pan / zoom about the cursor |
| Space-drag or middle-drag | Pan |
| Drag empty space | Marquee select (shift adds) |
| Drag a card, note or a group's title | Move (groups carry what's inside) |
| Corner handle | Scale a card like a print; resize notes and groups |
| Drag the small dot on a card's right edge to another card | Link; double-click the line to name it |
| `G` | Group the selection |
| Double-click empty space, or `N` | New note → "Keep in library" makes it a searchable card |
| ⌫ | Remove from canvas only (toast offers Undo) |
| ⌘Z / ⇧⌘Z | Undo / redo — every gesture is one step |
| `L` / `I` | Library panel / Ideas panel |
| `F` | Find on this canvas |
| ⇧1 | Fit everything |
| "Possible links" | Dashed suggestions between related cards; click one to keep it |

Ideas panel: select one card → *Close to this* + *Sideways*; select two → *Bridges* (things related
to both). Nothing is placed until you drag it or press Place.

## Where things are

```
docs/01-reconnaissance.md        What Sublime does, from its shipped code (evidence-tagged)
docs/02-spec-and-architecture.md How Recall and Canvas work here, and why
src/search/understand.ts         Memory cues → hints (type, time, colour, "A over B") + refinements
src/search/engine.ts             Hybrid ranking: embeddings + BM25 + context; related/bridges/sideways
src/search/searchService.ts      Engine singleton, Web Worker embedder, live re-indexing
src/canvas/model.ts              Canvas document, pure operations, undo/redo history
src/canvas/CanvasView.tsx        Camera, gestures, links, groups, persistence, AI suggestions
src/data/library.json            56 sample cards (original text; fictional sources except public-domain quotes)
```

## Not done yet

- **No real capture.** Cards come from sample data plus notes kept from the canvas. Saving links,
  images (with real OCR/captioning) and imports are the next step.
- **Images are searched by their stored caption, OCR text and palette**, not by pixels. Real image
  embeddings (e.g. CLIP) would let a photo be found by what it looks like.
- **Storage is `localStorage`.** Fine for hundreds of cards; move to IndexedDB or a server, with the
  same versioned-snapshot approach, before real use or multi-device sync.
- **No generated "insights"** (gist, analogy, counterpoint). These need an LLM; see the provider
  table in `docs/02-spec-and-architecture.md`.
- **Possible links / Sideways** quality depends on the library; with 56 cards some suggestions are
  loose.
- Touch: the canvas pans and zooms with a trackpad and mouse; phone gestures (pinch on glass) are
  not yet handled.
