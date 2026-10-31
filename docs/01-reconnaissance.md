# 01 — Sublime reconnaissance

Date: 2026-10-31. Method: REA (`capture_browser_scenario`, `export_web_scripts`) against the public
site, plus static reading of Sublime's publicly served JavaScript bundles (never executed).

## Evidence levels

Every claim below carries one tag:

- **[code]** — present in Sublime's shipped JavaScript. Proves the client *can* do it; not proof of
  how it feels or that every user sees it.
- **[site]** — stated on sublime.app marketing copy or in Sublime's own in-app copy.
- **[inferred]** — my reasoning from code + copy. Plausible, unverified.
- **[unknown]** — could not be established without the signed-in app or the server.

Not done: runtime observation of the signed-in app (no session was available), and the referenced
article (not yet supplied). Everything server-side — the ranking model, embedding model, index —
is invisible from the client and is **[unknown]** unless the copy says otherwise.

## Artifacts inspected

| Artifact | Size | What it is |
|---|---|---|
| `assets/index-CkkTXWWt.js` | 2.8 MB | Main SPA: React + TanStack Router + TanStack Query + `ky`-style HTTP client, all routes |
| `assets/search-*.js`, `search-pills-*.js` | 2–8 KB | Search results route + filter pills |
| `assets/canvas-*.js`, `_id-*.js` | 1–11 KB | Canvas list page, `/canvas/$id` route shells |
| `assets/canvas-editor-CNgEKLs7.js` | 1.26 MB | The Canvas editor: **tldraw** + Sublime's custom shapes and sidebar |

API base: `https://api.sublime.app/api/` **[code]**.

---

## A. Search

### What the code shows

- **One search endpoint for the library feed**: `GET v3/feed/search/` with query params spread from
  router state, paginated by cursor (`cursor`, `page_size`), cached 60 s (`staleTime: 6e4`) **[code]**.
- **Search lives in the URL.** Route search params validated with a schema: `search`, `entity_type`,
  `order_by`, `tags`, `created_by_me`, … So a search is a shareable, back-button-able state, not a
  modal **[code]**.
- **Ranking modes**: `order_by ∈ { most_relevant, popularity, ±first_connection_at,
  ±last_connection_at, ±last_updated_at, ±connection_at, ±name, shuffle }` **[code]**.
- **Relevance is the default only when there is a query**: `order_by ?? (search ? "most_relevant" :
  "-last_connection_at")`. Browsing with no query = most recently *connected* first **[code]**.
  "Connection" is Sublime's word for saving a card into your library or a collection **[inferred]**.
- **`shuffle` + `shuffle_seed`**: a deterministic random ordering — the "foraging" mode, stable across
  pagination **[code]**.
- **Pills** scope results to Cards / Collections / Canvases / People (`search-pills`) **[code]**.
  Collections have their own endpoint `v3/cx/search/collections/` **[code]**.
- **Empty state**: "No results found" + "Clear filters" **[code]**.
- **Analytics hook** `use-track-search-submitted` — searches are submitted events (Enter), not
  live-as-you-type queries to the ranking endpoint **[code, partially inferred]**.

### Related ("save one idea, discover 100 more")

- `v3/feed/related/` — **GET** with a card `slug` for "related to this card", or **POST with
  `{ text }`** for "related to this free text" **[code]**. Supports repeated `facet` params **[code]**.
- So "related" is a nearest-neighbour query seeded by either an item or arbitrary text — the same
  primitive drives "more like this" and "find by description" **[inferred]**.

### How meaning-based retrieval works

- Copy (compare pages, shipped in the bundle): *"Sublime uses advanced AI capabilities like
  embeddings and OCR to allow for intuitive, conversational search, so you can find anything by
  describing it in your own words."* and *"OCR and embeddings for all media types"* **[site]**.
- *"Rather than focusing on categorizing content (we let AI do that and offer powerful semantic
  search), Sublime emphasizes intentional organizing through collections"* **[site]**.
- Therefore: items (including images, via OCR + presumably captions) are embedded server-side; a
  query is embedded and matched by vector similarity **[site → inferred]**. Whether keyword search is
  blended in (hybrid), and the model used, are **[unknown]**.
- Marketing headline: *"find the thing, however you remember it — by context, feeling, or
  half-remembered details"* **[site]**.

### Unknown without the signed-in app

Exact input placement and states, whether results stream or debounce, excerpt highlighting,
follow-up/refinement UX, and how "conversational" is surfaced in the UI. No chat transcript
component was found on the search route; the search route renders a feed layout of cards
**[code]** — i.e. it is *search that understands language*, not a chatbot **[inferred]**.

---

## B. Canvas

### Architecture

- **Built on tldraw** (304 references; stock shapes: arrow, bookmark, draw, embed, frame, geo, group,
  highlight, image, line, note, text, video) **[code]**.
- **A canvas is a collection.** Its entity type is `collection.canvas`; it shares the collection
  routes, privacy and collaborator model **[code]**. Creation offers "Start with a collection" /
  "Add another collection" — a canvas can be seeded from existing collections **[code]**.
- **Custom shape `sublime-card`** **[code]**:
  - props: `card` (the library card object), `renderedHeight`, `canvasScale`, `isExpanded`.
  - Fixed base width **400 px**; height is *measured from the DOM* with a `ResizeObserver` and written
    back into the shape, so text cards grow to fit their content.
  - Resize is **aspect-locked** and implemented as a `canvasScale` multiplier, not width/height —
    the card's layout never reflows, it scales like a physical print.
  - `canBind = true` (arrows attach to cards), `canEdit = false` (library content is not edited on
    the canvas), double-click is a no-op.
  - **Level of detail**: below zoom `0.05 / canvasScale` the card renders simplified.
  - SVG export draws title, thumbnail and domain for PNG/SVG export.
- **Persistence** **[code]**: whole-document `getSnapshot()` → `POST v2/entities/{id}/canvas-snapshot/`
  with `{ base_version, shape_count, snapshot, schema_version }`.
  - Debounced **2.5 s**; status `saving → saved | error | conflict`.
  - Optimistic concurrency: on 409 it re-fetches `base_version` and retries; gives up after **5**
    conflicts and shows "This canvas was changed in another tab or device."
  - Refuses an *empty overwrite* of a non-empty canvas ("skipped empty overwrite").
  - Flushes with `fetch(..., { keepalive: true })` when the page is hidden/unloaded.
  - "Local mode — changes won't sync", "Offline" states exist.
- Mobile: canvases are **view-only snapshots** with pinch-zoom ("Canvases are view-only on mobile")
  **[code]**.

### Bringing library material in

- A **sidebar** ("Open sidebar"/"Close sidebar") with "Search My Library" and drag-and-drop
  (`dnd-kit`: Draggable/Droppable/DndLiveRegion) onto the canvas **[code]**.
- Copy: *"In the upper left corner of this Canvas, click on the search icon. There, find or ask
  anything in the search bar and drag results directly onto your Canvas."* **[code, in-app copy]**.
- **Batch add** lays cards out as **Grid**, **Column** or **Masonry**, measuring each card's real
  height off-screen first so nothing overlaps **[code]**.
- Paste a URL → bookmark/embed shape; "Saved to your library" — content created on the canvas can be
  saved back into the library **[code]**.
- Empty canvas copy: "Drag cards from the sidebar, paste a URL, or use the toolbar to get started."
  **[code]**.

### Selection → AI

When a card (or a text selection, `relatedToText`) is selected, a floating toolbar offers **[code]**:

- **Related** — opens the sidebar on `relatedTo: <card uuid>` (or the selected text): nearest
  neighbours from your library *and* "the broader Sublime network"; "No related cards found".
- **Insights** — per-card generated lenses: **The Gist, Explain Like I'm 5, Takeaways, Analogy,
  Hot Take, Contrarian Take**, each itself draggable onto the canvas; "Generating insights…".
- **Highlights** — the card's highlights, draggable.
- **Open card** — back to the original library item.

Sidebar results are sortable (Most relevant / Most popular / Newest / Oldest / Recently updated) and
filterable by media type **[code]**. AI never moves the user's shapes; it populates the sidebar and
the user drags **[code → inferred: no auto-layout calls tied to AI were found]**.

### Navigation

Standard tldraw: wheel/trackpad pan & zoom, "Fit to content", grid toggle, frames, groups,
"Stack H/V", align/distribute, focus mode, undo/redo history **[code]**. Plus a Sublime-specific
**"Search cards on canvas…"** finder (`n / total`, ↑/↓ to jump the camera between matches) **[code]**.

### Library ↔ canvas link

- The shape stores the **card object** (a denormalised copy) plus its `uuid` **[code]**.
  Whether the copy is refreshed when the library card changes is **[unknown]**; the snapshot model
  suggests the copy is what renders until re-added **[inferred]**.
- Deleting a shape removes it from the canvas only; the library card is untouched (shapes and
  library entities are different stores) **[inferred, strongly]**.

---

## Design philosophy, as the product expresses it

- "inspiration is everywhere. and nowhere." / "save anything that makes you go whoa" — collecting
  without a purpose is the default act **[site]**.
- "create with what you save … your taste comes with you" — Canvas is where collecting meets making
  **[site]**.
- "no likes, no comments, no pressure — just a quiet place for your ideas" **[site]**.
- Collections are *intentional*; AI does the categorising so people don't have to **[site]**.
- Canvas "doesn't start with a blank slate" — the library is the palette **[code, in-app copy]**.

## What I will deliberately not copy

Sublime's code, visual assets, and copy. The implementation in this repo is original; it reproduces
*behaviours* (URL-backed search, relevance-only-with-query, item-or-text related, measured cards,
scale-not-reflow resize, debounced versioned snapshots, selection-driven AI sidebar) not source.
