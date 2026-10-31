import { useEffect, useMemo, useState } from 'react';
import { useLibrary } from '../data/store';
import type { Card } from '../data/types';
import { engine, useSearchService } from '../search/searchService';
import { centroid, type Vec } from '../search/vectors';
import { CardThumb } from '../ui/CardArt';
import { byline } from '../ui/format';

export const DRAG_TYPE = 'text/x-ioh-card';

interface Props {
  tab: 'library' | 'ideas';
  onTab: (t: 'library' | 'ideas') => void;
  onClose: () => void;
  /** Library ids already on this canvas. */
  onCanvas: ReadonlySet<string>;
  /** Library ids of the selected cards. */
  selected: string[];
  onPlace: (itemId: string) => void;
  onOpen: (itemId: string) => void;
}

/**
 * The library, inside the canvas. "Ideas" is where AI helps: it only ever *suggests* — nothing is
 * placed until you drag it or press Place.
 */
export function CanvasSidebar({ tab, onTab, onClose, onCanvas, selected, onPlace, onOpen }: Props) {
  return (
    <aside className="cv-sidebar" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div className="cv-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'library'} onClick={() => onTab('library')}>Library</button>
        <button role="tab" aria-selected={tab === 'ideas'} onClick={() => onTab('ideas')}>Ideas</button>
        <button className="btn quiet" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close panel">✕</button>
      </div>
      {tab === 'library' ? (
        <LibraryTab onCanvas={onCanvas} onPlace={onPlace} onOpen={onOpen} />
      ) : (
        <IdeasTab onCanvas={onCanvas} selected={selected} onPlace={onPlace} onOpen={onOpen} />
      )}
    </aside>
  );
}

function LibraryTab({ onCanvas, onPlace, onOpen }: Pick<Props, 'onCanvas' | 'onPlace' | 'onOpen'>) {
  const cards = useLibrary();
  const { revision } = useSearchService();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Card[]>();

  useEffect(() => {
    if (!q.trim()) {
      setResults(undefined);
      return;
    }
    let live = true;
    const t = setTimeout(() => engine.search({ query: q, limit: 30 }).then((r) => live && setResults(r.results.map((x) => x.card))), 140);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, revision]);

  const list = results ?? [...cards].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  return (
    <>
      <input className="cv-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find anything you’ve kept…" autoFocus onKeyDown={(e) => e.stopPropagation()} />
      <p className="cv-hint">Drag onto the canvas, or press Place.</p>
      <ItemList items={list.map((card) => ({ card }))} onCanvas={onCanvas} onPlace={onPlace} onOpen={onOpen} />
    </>
  );
}

function IdeasTab({ onCanvas, selected, onPlace, onOpen }: Omit<Props, 'tab' | 'onTab' | 'onClose'>) {
  const { revision } = useSearchService();
  const exclude = onCanvas;
  const sections = useMemo(() => {
    const out: { title: string; blurb: string; items: { card: Card; note?: string }[] }[] = [];
    const sel = [...new Set(selected)];
    if (sel.length) {
      const c = centroid(sel.map((id) => engine.vectorOf(id)).filter((v): v is Vec => !!v));
      if (c) out.push({ title: sel.length === 1 ? 'Close to this' : 'Close to these', blurb: 'Nearest in meaning, from your library.', items: engine.related(c, 6, exclude).map((r) => ({ card: r.card })) });
      if (sel.length === 2) {
        out.push({ title: 'Bridges', blurb: 'Things that sit between the two — a way to connect them.', items: engine.bridges(sel, 4, exclude).map((r) => ({ card: r.card })) });
      }
      out.push({ title: 'Sideways', blurb: 'Not obvious, not random. Worth a look.', items: engine.unexpected(sel, 4, exclude).map((r) => ({ card: r.card })) });
    } else {
      const ids = [...onCanvas];
      const c = centroid(ids.map((id) => engine.vectorOf(id)).filter((v): v is Vec => !!v));
      if (c) out.push({ title: 'Near this canvas', blurb: 'Things you’ve kept that belong in this conversation.', items: engine.related(c, 6, exclude).map((r) => ({ card: r.card })) });
      if (ids.length) out.push({ title: 'Sideways', blurb: 'At a slight angle to everything here.', items: engine.unexpected(ids, 4, exclude).map((r) => ({ card: r.card })) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join(','), [...onCanvas].join(','), revision]);

  return (
    <div className="cv-ideas">
      <p className="cv-hint">{selected.length ? 'Suggestions for your selection. Nothing moves unless you move it.' : 'Select a card or two to steer these.'}</p>
      {sections.map((s) => (
        <section key={s.title}>
          <h5>{s.title}</h5>
          <p className="cv-blurb">{s.blurb}</p>
          {s.items.length ? <ItemList items={s.items} onCanvas={onCanvas} onPlace={onPlace} onOpen={onOpen} /> : <p className="cv-blurb">Nothing yet.</p>}
        </section>
      ))}
    </div>
  );
}

function ItemList({ items, onCanvas, onPlace, onOpen }: { items: { card: Card; note?: string }[] } & Pick<Props, 'onCanvas' | 'onPlace' | 'onOpen'>) {
  return (
    <div className="cv-list">
      {items.map(({ card }) => (
        <div
          key={card.id}
          className="cv-item"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, card.id);
            e.dataTransfer.effectAllowed = 'copy';
          }}
        >
          <span className="thumb"><CardThumb card={card} /></span>
          <button className="cv-item-text" onClick={() => onOpen(card.id)}>
            <span className="t">{card.title}</span>
            <span className="s">{byline(card)}{onCanvas.has(card.id) ? ' · on canvas' : ''}</span>
          </button>
          <button className="btn quiet cv-place" onClick={() => onPlace(card.id)}>Place</button>
        </div>
      ))}
    </div>
  );
}
