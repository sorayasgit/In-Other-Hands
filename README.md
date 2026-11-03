# In Other Hands

A quiet library of things you've kept, with two tools on top:

- **Recall** — find the thing however you remember it: by meaning, a fragment, a colour, roughly
  when, or what you used it for. Refine with plain follow-ups ("no, more about design").
- **Canvas** — an infinite surface where library cards become material to think with: arrange,
  group, link, and let the library suggest what else belongs.

Everything runs on your machine. The search model (bge-small, ~33 MB) downloads once from Hugging
Face's CDN and is cached by the browser; no card text or query leaves the device. **Return** (in
Today's handful) is the one action that sends anything out, and for now it is simulated locally: the
returned piece goes to a local outbox, not a server.

## Run it

Needs Node ≥ 20.19 (developed on Node 24).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 39 tests: search scenarios, collections, canvas model, today's handful
npm run embed      # rebuild src/data/library-vectors.json after editing library.json
```

## Today's handful

The landing page. Every day, twenty pieces from other people (a book, a note, a quote, a song, a
recipe, a photo), chosen by a shuffle seeded with the date: the same all day, different tomorrow,
and finite. No feed, no scrolling past the end.

- **Keep** copies a piece into your library as a *borrowed* card: searchable, placeable on canvases,
  fileable in collections.
- **Add something** (once kept): a note, an image, a song. Images are re-encoded to an 800 px JPEG,
  which strips camera and location data; the original file and its name are never kept.
- **Return** sends the piece back out with your additions and one more hand on its count, and
  removes it from your library, canvases and collections. Tomorrow's handful includes it.
- Everyone is anonymous: pieces and trails hold no names, ids of people, or times finer than a day
  (a test enforces the allowed keys).
- Demo helpers: `?day=1` shows tomorrow's handful (`?day=0` returns to today); `?reset=1` clears the
  handful's state only, not your library.
- Photo pieces use placeholder SVGs in `public/handful/`; drop in a real image with the same filename.

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

**Collections** (contexts you'll come back to, not topics)

| Do | Result |
|---|---|
| Collections → create one with only a purpose, e.g. *For planning the spring workshop on learning through curiosity and play* | "Might belong here" fills from the purpose alone; **+ Add** files a card |
| Add a few cards | Suggestions blend what's in it with what it's for |
| Open any card → Collections | One card, many collections; × removes it from one (the card stays) |
| Search `references for packaging and print` in the library | Finds the Colour collection's cards by *why* it exists |
| Rename, edit the purpose, delete | Rename updates every card; delete leaves the cards in the library |
| Open as canvas | A new canvas with the collection's cards in a named group |

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
src/data/collections.ts          Collections as contexts of return: derive, rename, delete
src/ui/CollectionsView.tsx       Collections index, collection page, "might belong here"
src/data/library.json            56 sample cards (original text; fictional sources except public-domain quotes)
```

## Not done yet

- **No real capture.** Cards come from sample data plus notes kept from the canvas. Saving links,
  images (with real OCR/captioning) and imports are the next step.
- **No shared network.** Sublime also suggests cards from other people's libraries; this app only
  knows your own.
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
