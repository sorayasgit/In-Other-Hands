import { useEffect, useMemo, useState } from 'react';
import { library, useCard, useCollections, useLibrary } from '../data/store';
import { collectionHref, href, navigate } from '../router';
import { engine, useSearchService } from '../search/searchService';
import { createCanvas, placeOnCanvas, useCanvasList } from '../canvas/store';
import { CardArt, CardThumb } from './CardArt';
import { byline, savedLabel } from './format';

interface Props {
  id: string;
  onClose: () => void;
  onOpen: (id: string) => void;
  onMoreLike?: (id: string) => void;
  onSameTime?: () => void;
  /** Inside a canvas: offer to place here rather than choosing a canvas. */
  onPlaceHere?: (id: string) => void;
}

export function CardDrawer({ id, onClose, onOpen, onMoreLike, onSameTime, onPlaceHere }: Props) {
  const card = useCard(id);
  const all = useLibrary();
  const canvases = useCanvasList();
  const { revision } = useSearchService();
  const [note, setNote] = useState(card?.note ?? '');
  useEffect(() => setNote(card?.note ?? ''), [card?.id, card?.note]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const related = useMemo(() => (card ? engine.related(card.id, 5) : []), [card?.id, revision]);
  const around = useMemo(() => {
    if (!card) return [];
    const t = Date.parse(card.savedAt);
    return all
      .filter((c) => c.id !== card.id && Math.abs(Date.parse(c.savedAt) - t) < 10 * 86_400_000)
      .sort((a, b) => Math.abs(Date.parse(a.savedAt) - t) - Math.abs(Date.parse(b.savedAt) - t))
      .slice(0, 3);
  }, [all, card]);
  const onCanvases = canvases.filter((c) => c.itemIds.includes(id));

  if (!card) {
    return (
      <>
        <div className="scrim" onClick={onClose} />
        <aside className="drawer" role="dialog" aria-label="Card">
          <p className="empty">This card is no longer in your library.</p>
        </aside>
      </>
    );
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={card.title}>
        <div className="drawer-top">
          <span className="kicker">{byline(card)} · saved {savedLabel(card)}</span>
          <button className="btn quiet" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <h1>{card.title}</h1>
        {card.source?.name && card.source.name !== card.source.author && <div className="byline">{card.source.name}</div>}
        {card.origin === 'borrowed' && card.pieceId && (
          <div className="byline">
            Borrowed from today’s handful · {card.hands ?? 1} {card.hands === 1 ? 'hand' : 'hands'} before yours · <a href={href('/today', { piece: card.pieceId })}>open the piece</a>
          </div>
        )}

        {card.type === 'image' && (
          <>
            <div className="art" style={{ aspectRatio: card.cover ? undefined : '4 / 3' }}><CardArt card={card} /></div>
            {card.palette && <div className="palette" aria-label="Palette">{card.palette.map((c) => <span key={c} style={{ background: c }} title={c} />)}</div>}
          </>
        )}
        {card.type !== 'image' && card.cover && <img className="drawer-cover" src={card.cover} alt={`Cover of ${card.title}`} />}
        {card.quote && <blockquote className="big-quote">“{card.quote}”</blockquote>}
        {card.description && <p className="prose">{card.description}</p>}
        {card.body && <p className="prose">{card.body}</p>}
        {card.caption && <p className="prose"><span className="kicker">In the image · </span>{card.caption}</p>}
        {card.ocr && <p className="prose"><span className="kicker">Text in the image · </span>{card.ocr}</p>}

        <section>
          <div className="kicker">Your note</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (card.note ?? '') && library.update(card.id, { note: note || undefined })}
            placeholder="Why did you keep this? Future you will search by it."
          />
          {card.context && <p className="byline" style={{ marginTop: 8 }}>{card.context}</p>}
        </section>

        <CollectionsOf cardId={card.id} names={card.collections ?? []} />

        <div className="actions">
          {card.source?.url && <a className="btn" href={card.source.url} target="_blank" rel="noreferrer">Open original ↗</a>}
          {onPlaceHere ? (
            <button className="btn primary" onClick={() => onPlaceHere(card.id)}>Place on this canvas</button>
          ) : (
            <PlaceOnCanvas itemId={card.id} canvases={canvases} />
          )}
          {onMoreLike && <button className="btn" onClick={() => onMoreLike(card.id)}>More like this</button>}
          {onSameTime && <button className="btn" onClick={onSameTime}>Saved around then</button>}
        </div>

        {onCanvases.length > 0 && (
          <section>
            <div className="kicker">On {onCanvases.length === 1 ? 'a canvas' : `${onCanvases.length} canvases`}</div>
            <div className="mini-list">
              {onCanvases.map((c) => (
                <button key={c.id} className="mini" onClick={() => navigate(`/canvas/${c.id}`, { focus: card.id })}>
                  <span className="thumb">◫</span>
                  <span><div className="t">{c.title}</div><div className="s">{c.nodeCount} things</div></span>
                </button>
              ))}
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section>
            <div className="kicker">Close in meaning</div>
            <div className="mini-list">
              {related.map(({ card: r }) => (
                <button key={r.id} className="mini" onClick={() => onOpen(r.id)}>
                  <span className="thumb"><CardThumb card={r} /></span>
                  <span><div className="t">{r.title}</div><div className="s">{byline(r)}</div></span>
                </button>
              ))}
            </div>
          </section>
        )}

        {around.length > 0 && (
          <section>
            <div className="kicker">Kept around the same time</div>
            <div className="mini-list">
              {around.map((r) => (
                <button key={r.id} className="mini" onClick={() => onOpen(r.id)}>
                  <span className="thumb"><CardThumb card={r} /></span>
                  <span><div className="t">{r.title}</div><div className="s">{savedLabel(r)}</div></span>
                </button>
              ))}
            </div>
          </section>
        )}
      </aside>
    </>
  );
}

function PlaceOnCanvas({ itemId, canvases }: { itemId: string; canvases: { id: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn primary" onClick={() => setOpen(true)}>Place on a canvas…</button>;
  return (
    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {canvases.map((c) => (
        <button key={c.id} className="btn" onClick={() => { placeOnCanvas(c.id, itemId); navigate(`/canvas/${c.id}`, { focus: itemId }); }}>
          {c.title}
        </button>
      ))}
      <button className="btn" onClick={() => { const doc = createCanvas('Untitled canvas'); placeOnCanvas(doc.id, itemId); navigate(`/canvas/${doc.id}`, { focus: itemId }); }}>
        + New canvas
      </button>
    </span>
  );
}

/** Which contexts this card belongs to. One card, any number of collections — never copied. */
function CollectionsOf({ cardId, names }: { cardId: string; names: string[] }) {
  const all = useCollections();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const others = all.filter((c) => !names.includes(c.name));

  const addNew = () => {
    const n = draft.trim();
    if (!n) return;
    const existing = all.find((c) => c.name.toLowerCase() === n.toLowerCase());
    const name = existing?.name ?? library.createCollection(n);
    if (name) library.setInCollection(cardId, name, true);
    setDraft('');
    setAdding(false);
  };

  return (
    <section>
      <div className="kicker">Collections</div>
      <div className="collection-chips">
        {names.map((n) => (
          <span key={n} className="chip">
            <a href={collectionHref(n)}>{n}</a>
            <button aria-label={`Remove from ${n}`} title="Remove from this collection (the card stays in your library)" onClick={() => library.setInCollection(cardId, n, false)}>×</button>
          </span>
        ))}
        {!adding && <button className="chip add-chip" onClick={() => setAdding(true)}>+ Add to collection</button>}
      </div>
      {adding && (
        <div className="collection-picker">
          {others.map((c) => (
            <button key={c.name} className="btn" title={c.purpose} onClick={() => { library.setInCollection(cardId, c.name, true); setAdding(false); }}>
              {c.name}
            </button>
          ))}
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addNew(); if (e.key === 'Escape') setAdding(false); e.stopPropagation(); }}
            placeholder="or a new one…"
            aria-label="New collection name"
          />
        </div>
      )}
    </section>
  );
}
