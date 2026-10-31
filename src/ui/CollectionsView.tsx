import { useEffect, useMemo, useState } from 'react';
import { library, useCollections, useLibrary } from '../data/store';
import type { Card } from '../data/types';
import { createCanvasFromCollection } from '../canvas/store';
import { collectionHref, href, navigate, type Route } from '../router';
import type { SearchResult } from '../search/engine';
import { engine, useSearchService } from '../search/searchService';
import { centroid, type Vec } from '../search/vectors';
import { CardArt, CardThumb } from './CardArt';
import { CardDrawer } from './CardDrawer';
import { byline, gist, savedLabel } from './format';
import { Highlight } from './Highlight';

const goCollection = (name: string, params?: Record<string, string | undefined>, replace = false) =>
  navigate(`/collection/${encodeURIComponent(name)}`, params, { replace });

// ── Index ─────────────────────────────────────────────────────────────────────────────────────

export function CollectionsIndex() {
  const collections = useCollections();
  const cards = useLibrary();
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');

  const create = () => {
    const made = library.createCollection(name, purpose);
    if (!made) return setError(name.trim() ? 'You already have a collection with that name.' : 'Give it a name first.');
    goCollection(made);
  };

  return (
    <main className="collections">
      <h1>Collections</h1>
      <p className="lede">Not what things are about — when you’ll want them again.</p>

      <form
        className="new-collection"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <input value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="New collection…" aria-label="Collection name" />
        <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="When will you come back to it? (for the essay on…, for the next client brief…)" aria-label="Purpose" className="purpose" />
        <button className="btn primary" type="submit">Create</button>
        {error && <span className="form-error">{error}</span>}
      </form>

      <div className="collection-tiles">
        {collections.map((c) => {
          const members = c.cardIds.map((id) => byId.get(id)).filter((x): x is Card => !!x);
          return (
            <a key={c.name} className="collection-tile" href={collectionHref(c.name)}>
              <div className="strip">
                {members.slice(0, 4).map((m) => (
                  <span key={m.id} className={`strip-item ${m.type === 'image' ? 'is-image' : ''}`}>
                    {m.type === 'image' ? <CardArt card={m} ratio={1.2} /> : <span>{m.quote ? `“${m.quote}”` : m.title}</span>}
                  </span>
                ))}
                {!members.length && <span className="strip-empty">empty — waiting for the first thing</span>}
              </div>
              <div className="label">
                <b>{c.name}</b>
                {c.purpose && <i>{c.purpose}</i>}
                <span>{members.length} {members.length === 1 ? 'card' : 'cards'}</span>
              </div>
            </a>
          );
        })}
      </div>
    </main>
  );
}

// ── One collection ────────────────────────────────────────────────────────────────────────────

export function CollectionPage({ name, route }: { name: string; route: Route }) {
  const collections = useCollections();
  const cards = useLibrary();
  const { revision, status } = useSearchService();
  const collection = collections.find((c) => c.name === name);
  const open = route.params.get('open') ?? undefined;
  const [q, setQ] = useState(route.params.get('q') ?? '');
  const [results, setResults] = useState<SearchResult[]>();
  const [title, setTitle] = useState(name);
  const [purpose, setPurpose] = useState(collection?.purpose ?? '');
  const [note, setNote] = useState('');

  useEffect(() => setTitle(name), [name]);
  useEffect(() => setPurpose(collection?.purpose ?? ''), [collection?.purpose]);

  const memberIds = useMemo(() => new Set(collection?.cardIds ?? []), [collection?.cardIds.join(',')]);
  const members = useMemo(
    () => cards.filter((c) => memberIds.has(c.id)).sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt)),
    [cards, memberIds],
  );

  // Search inside the collection.
  useEffect(() => {
    if (!q.trim()) return setResults(undefined);
    let live = true;
    const t = setTimeout(() => engine.search({ query: q, within: memberIds }).then((r) => live && setResults(r.results)), 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, memberIds, revision]);

  // "Might belong here": what's near the collection's cards *and* its stated purpose. With no cards
  // yet, the purpose alone is the intention that pulls related things in.
  const [suggested, setSuggested] = useState<Card[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      const score = new Map<string, number>();
      const bump = (list: Card[]) => list.forEach((c, i) => !memberIds.has(c.id) && score.set(c.id, (score.get(c.id) ?? 0) + 1 / (i + 3)));
      const c = centroid([...memberIds].map((id) => engine.vectorOf(id)).filter((v): v is Vec => !!v));
      if (c) bump(engine.related(c, 14, memberIds).map((r) => r.card));
      if (collection?.purpose && status === 'ready') {
        const r = await engine.search({ query: collection.purpose, limit: 14 });
        if (r.confident || !c) bump(r.results.map((x) => x.card));
      }
      const byId = new Map(cards.map((x) => [x.id, x]));
      if (live) setSuggested([...score].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => byId.get(id)!).filter(Boolean));
    })();
    return () => {
      live = false;
    };
  }, [memberIds, collection?.purpose, status, revision, cards]);

  if (!collection) {
    return (
      <main className="collections">
        <p className="empty">There’s no collection called “{name}”. <a href={href('/collections')}>All collections</a></p>
      </main>
    );
  }

  const rename = () => {
    if (title.trim() === name) return;
    const next = library.renameCollection(name, title);
    if (next && next !== name) goCollection(next, undefined, true);
    else {
      setTitle(name);
      setNote('That name is taken.');
    }
  };

  const shown: { card: Card; result?: SearchResult }[] = results ? results.map((r) => ({ card: r.card, result: r })) : members.map((card) => ({ card }));

  return (
    <main className="collections">
      <a className="crumb" href={href('/collections')}>← Collections</a>
      <input className="collection-title" value={title} onChange={(e) => { setTitle(e.target.value); setNote(''); }} onBlur={rename} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Collection name" />
      <textarea
        className="collection-purpose"
        rows={1}
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        onBlur={() => purpose !== (collection.purpose ?? '') && library.setPurpose(name, purpose)}
        placeholder="When will you come back to this? Say it, and I’ll look for things that belong."
        aria-label="What this collection is for"
      />
      <div className="collection-actions">
        <span className="kicker">{members.length} {members.length === 1 ? 'card' : 'cards'}</span>
        <button className="btn" disabled={!members.length} onClick={() => navigate(`/canvas/${createCanvasFromCollection(name, members.map((m) => m.id)).id}`)}>Open as canvas</button>
        <button
          className="btn quiet"
          onClick={() => {
            if (confirm(`Delete “${name}”? The ${members.length} cards stay in your library.`)) {
              library.deleteCollection(name);
              navigate('/collections');
            }
          }}
        >
          Delete collection
        </button>
        {note && <span className="form-error">{note}</span>}
      </div>

      <div className="collection-body">
        <section>
          {members.length > 0 && (
            <input className="collection-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find something in ${name}…`} aria-label={`Search in ${name}`} />
          )}
          {!members.length && <p className="empty" style={{ margin: '40px 0' }}>Nothing here yet. Add cards from the suggestions, or from any card’s “Collections”.</p>}
          {results && !results.length && <p className="empty" style={{ margin: '24px 0' }}>Nothing in this collection matches.</p>}
          <div className="grid narrow">
            {shown.map(({ card, result }) => (
              <button key={card.id} className="tile" onClick={() => goCollection(name, { open: card.id, q: q || undefined })}>
                {card.type === 'image' && <div style={{ aspectRatio: '4 / 3' }}><CardArt card={card} /></div>}
                <div className="body">
                  <div className="kicker">{byline(card)}</div>
                  <h3>{result ? <Highlight text={card.title} matched={result.matched} /> : card.title}</h3>
                  {card.type !== 'image' && (
                    <p className={card.quote ? 'quote-text' : ''}>
                      {result?.passage ? <Highlight text={result.passage.text} matched={result.matched} /> : card.quote ? `“${card.quote}”` : gist(card)}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>

        <aside className="might-belong">
          <div className="kicker">Might belong here</div>
          <p className="hint">{collection.purpose ? 'Close to these cards and to what this collection is for.' : 'Close to these cards. Say what it’s for and these get sharper.'}</p>
          {suggested.map((s) => (
            <div key={s.id} className="mini suggestion">
              <button className="mini-open" onClick={() => goCollection(name, { open: s.id, q: q || undefined })}>
                <span className="thumb"><CardThumb card={s} /></span>
                <span><div className="t">{s.title}</div><div className="s">{byline(s)} · {savedLabel(s)}</div></span>
              </button>
              <button className="btn quiet add" onClick={() => library.setInCollection(s.id, name, true)} aria-label={`Add ${s.title} to ${name}`}>+ Add</button>
            </div>
          ))}
          {!suggested.length && <p className="hint">Nothing to suggest yet.</p>}
        </aside>
      </div>

      {open && (
        <CardDrawer
          id={open}
          onClose={() => goCollection(name, { q: q || undefined })}
          onOpen={(id) => goCollection(name, { open: id, q: q || undefined })}
        />
      )}
    </main>
  );
}
