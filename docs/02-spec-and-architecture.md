# 02 — Feature spec & technical architecture

The app is called **In Other Hands**. It is a quiet library of cards (things you saved: articles,
quotes, images, notes, links, books, podcasts) with two features built on top of it:

1. **Recall** — search that finds the thing however you remember it.
2. **Canvas** — an infinite surface where library cards become material to think with.

Principles carried over from the reconnaissance (see `01-reconnaissance.md`), and how each shows up:

| Principle | Where it lives in the product |
|---|---|
| Cards are independent and reusable | A canvas places *references* to cards; one card can sit on many canvases, or several times on one, without being copied |
| Foraging and hunting | Search has a "wander" mode (seeded shuffle, like Sublime's `shuffle_seed`) beside "find" |
| Organise by context of return | Search reads time, type, colour and "the one I used for…" cues from the query |
| AI as quiet collaborator | AI fills a side panel and draws faint *possible* links; it never moves, adds or deletes your work |
| Calm, editorial | Serif reading type, paper tones, one accent, no dashboards, no chat bubbles |

---

## 1. Recall (search)

### Interaction

- One input at the top of the library. Typing filters live (debounced 120 ms); Enter commits the
  query to the URL (`#/?q=…`), so back/forward and links work, as in Sublime.
- With no query the library is ordered by *last saved*. With a query, by *relevance*. Same rule as
  Sublime's `most_relevant`-only-when-searching.
- **What I understood** — under the input, small removable chips show how the query was read:
  `quote` · `~2–4 months ago` · `orange, brown`. Removing a chip re-runs without it. This is how the
  system admits it is guessing, without a conversation.
- **Refine, don't chat** — after results appear, a single quiet line ("Not quite? Tell me more…")
  accepts follow-ups like *"no, it was more about design"*, *"I think it was a quote"*, *"show me
  things saved around the same time"*. Each refinement becomes a chip on the same search, not a new
  message. The result list updates in place.
- Results are cards in a reading column: title, type & source, saved date, the **best-matching
  passage** with matched words highlighted, and a one-line *why* ("matched your note", "from the
  image description", "same idea, different words"). Selecting one opens the card drawer; Esc
  returns to the exact result list and scroll position.
- **Related** sits at the bottom of the drawer and as an "↳ more like this" action on any result.
- **Empty / weak results** never show a blank page: the closest items are shown under "Nothing
  certain. These are the closest things you've saved", plus the interpretation chips to loosen.
- **Wander** — a button beside the input when it's empty: a deterministic shuffle of the library
  (seed in the URL) for browsing without a goal.

### Retrieval pipeline

```
raw query ─▶ understand() ──▶ { core text, type hints, time window, colours, refinements[] }
                 │
                 ├─▶ semantic:  embed(core [+ refinements]) · cosine vs item + passage vectors
                 ├─▶ lexical:   BM25 over title/description/body/note/caption/source/tags
                 └─▶ context:   type, time, colour, "near item X" boosts (soft, never hard filters)
                                   │
                       fused score = 0.62·semantic + 0.28·lexical + context boosts
                                   │
                         rank ▶ pick best passage ▶ highlight ▶ explain
```

- **Understanding** is a local, deterministic parser (no API): strips memory filler ("that article I
  read about…", "something about…"), extracts type words, relative and named time expressions,
  colour words (mapped to hues), and refinement intents (`more about X`, `not X`, `it was a <type>`,
  `around the same time`). Hints are *soft*: memory is unreliable, so a wrong "it was a quote" lowers
  the rank of non-quotes instead of hiding them.
- **Semantic** uses a sentence-embedding model run **locally**: `bge-small-en-v1.5` (384-d) through
  transformers.js. Each item has one whole-item vector plus vectors for each passage (≈1–3
  sentences). Item score = max(whole, best passage) so a single remembered line can find a long
  article. Library vectors are precomputed at build time (`npm run embed`); new cards are embedded in
  a Web Worker when saved; queries are embedded in the same worker.
- **Images** are searchable through what we store about them: a description/caption, any OCR text,
  and an extracted colour palette. "The image with the orange and brown palette" matches on hue
  distance, not just words.
- **Refinement maths**: the query vector becomes `normalize(q + 0.7·r₁ + …)` for "more about rᵢ"
  and gets a penalty `−0.35·sim(item, n)` for "not n". "Same time" re-centres the time window on the
  top result (or the open card).
- **Fallback**: if the model can't load (offline first run), lexical + context still work and a
  small note says meaning-based matching is warming up.
- **Scale**: brute-force cosine over Float32Arrays is < 5 ms for 10k items × ~6 passages in the
  browser. Past ~50k passages, swap in an HNSW index; the scoring interface already isolates this.

### AI provider options (for later; nothing external is used today)

| Option | What it adds | Cost | Privacy |
|---|---|---|---|
| **Local only (current)** | Embeddings, hybrid ranking, parsing | Free; ~33 MB model download once | Nothing leaves the device |
| Hosted embeddings (Voyage, OpenAI, Cohere) | Somewhat better recall, image embeddings | ≈ $0.02–0.13 per 1M tokens; a 10k-card library ≈ cents | Card text sent to provider |
| Claude (Haiku-class) for query rewriting and card "lenses" (gist, analogy, counterpoint) | Handles very loose descriptions; generates insights | ≈ fractions of a cent per search | Query + candidate snippets sent to Anthropic |

The interface `Embedder` / `QueryRewriter` is where any of these would plug in.

---

## 2. Canvas

### Model

```ts
Canvas { id, title, createdAt, updatedAt, camera: {x, y, z}, version,
         nodes: Record<id, Node>, edges: Record<id, Edge>, frames: Record<id, Frame> }
Node   = CardNode { kind:'card', itemId, x, y, scale }      // reference, never a copy
       | NoteNode { kind:'note', text, x, y, w, h, tint }    // canvas-native thought
Edge   { id, from: nodeId, to: nodeId, label? }
Frame  { id, title, x, y, w, h }                              // a loose group
```

- A card node stores only `itemId`. It renders from the live library, so editing a card in the
  library updates it everywhere; a deleted card shows as a faint "no longer in your library" slip.
- Card width is fixed (300 world units) and height measured from content (Sublime does the same at
  400); resizing changes `scale`, never reflows — the card behaves like a printed object.

### Rendering

- DOM cards inside one world layer transformed by `translate(x,y) scale(z)`; links in one SVG layer
  in world space. Culling renders only nodes intersecting the viewport (+ margin), and below zoom
  0.35 cards drop to a level-of-detail "spine" (title + type colour) so hundreds stay smooth.
- A minimap (bottom-right) keeps orientation; click/drag it to travel.
- No canvas library: tldraw (what Sublime uses) needs a commercial licence for production and
  brings much more than this needs.

### Interactions

| Gesture | Result |
|---|---|
| Trackpad scroll / wheel | Pan |
| Pinch, or ⌘/Ctrl + wheel | Zoom about the cursor (0.1×–2.5×) |
| Space + drag, or middle-drag | Pan |
| Drag empty space | Marquee select |
| Drag card / note / frame title | Move (frames carry their contents) |
| Corner handle | Scale card (aspect-locked) / resize note or frame |
| Drag from a card's link dot to another card | Link them; double-click a link to label it |
| `G` with a selection | Wrap selection in a frame |
| Double-click empty space | New note |
| ⌫ / Delete | Remove from canvas (library untouched); toast offers undo |
| ⌘Z / ⇧⌘Z | Undo / redo (every gesture is one step) |
| `F` / `⇧1` | Find on canvas / fit everything |

### Library in the canvas

A left drawer with the same Recall search. Results drag onto the canvas (or click "place" to drop at
centre). Dragging a result that's already on the canvas offers to fly to it instead of duplicating;
holding ⌥ places another instance on purpose.

### AI on the canvas (suggest, never act)

- **Related to selection** — centroid of selected cards' vectors → nearest library items not on the
  canvas.
- **Bridges** — with two cards selected, items closest to the *midpoint* of their vectors: things
  that might connect two ideas you placed far apart.
- **Unexpected** — mid-similarity items (not obvious, not random) for serendipity.
- **Possible links** — a toggle that draws faint dashed lines between unlinked cards on the canvas
  that are semantically close, with a reason on hover. Click to keep, or ignore.

### Persistence & history

- `localStorage`, debounced 600 ms and flushed on `visibilitychange`; schema-versioned; refuses to
  overwrite a non-empty saved canvas with an empty one (Sublime's "empty overwrite" guard).
- Undo/redo is a stack of immutable document states (structural sharing); drags and resizes are
  committed once on pointer-up.

---

## 3. Stack

Vite + React 18 + TypeScript, hand-written CSS with design tokens, hash routing (search state lives in
the URL). One runtime dependency beyond React: `@huggingface/transformers` for local embeddings.
Vitest for tests.
