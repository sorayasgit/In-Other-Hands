import { useEffect, useMemo, useRef, useState } from 'react';
import { seededShuffle } from '../data/shuffle';
import { useLibrary } from '../data/store';
import type { Card } from '../data/types';
import { navigate, type Route } from '../router';
import type { SearchResponse } from '../search/engine';
import { engine, useSearchService } from '../search/searchService';
import { parseRefinement, type Hint } from '../search/understand';
import { CardArt, CardThumb } from './CardArt';
import { Picture } from './Picture';
import { CardDrawer } from './CardDrawer';
import { byline, gist, savedLabel } from './format';
import { Highlight } from './Highlight';
import { PunchStudio } from './PunchStudio';

const EXAMPLES = ['the image with warm, earthy colours', 'a quote about how we learn', 'something I saved over the summer about technology', 'that idea about collecting without a reason'];
const COLOR_HEX: Record<string, string> = { orange: '#E07B28', brown: '#6B4226', red: '#C0392B', blue: '#3E6FA8', green: '#5B8C3A', yellow: '#E8C547', pink: '#E86AA6', teal: '#0F8A8A', purple: '#6E4B9E', navy: '#1B2340', rust: '#A0522D', terracotta: '#C8692B', ochre: '#C08A2E', cream: '#F2E8D5', beige: '#E3D2B4' };

/** The URL is the source of truth: q (query), r (refinements, "|"-separated), x (dismissed hints), like, wander, open. */
function useSearchParams(route: Route) {
  const p = route.params;
  return {
    q: p.get('q') ?? '',
    refinements: (p.get('r') ?? '').split('|').filter(Boolean),
    ignored: (p.get('x') ?? '').split(',').filter(Boolean),
    like: p.get('like') ?? undefined,
    wander: p.get('wander') ?? undefined,
    open: p.get('open') ?? undefined,
  };
}

export function LibraryView({ route }: { route: Route }) {
  const s = useSearchParams(route);
  const cards = useLibrary();
  const { revision, status } = useSearchService();
  const [draft, setDraft] = useState(s.q);
  const [refineDraft, setRefineDraft] = useState('');
  const [making, setMaking] = useState(false);
  const [response, setResponse] = useState<SearchResponse>();
  const inputRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<Record<'q' | 'r' | 'x' | 'like' | 'wander' | 'open', string | undefined>>, replace = false) => {
    const next = { q: s.q || undefined, r: s.refinements.join('|') || undefined, x: s.ignored.join(',') || undefined, like: s.like, wander: s.wander, open: s.open, ...patch };
    navigate('/library', next, { replace });
  };

  // Keep the field in sync when the URL changes from outside (back button, example click).
  useEffect(() => setDraft(s.q), [s.q]);

  // Live search while typing; the URL follows (replace) so the back button skips keystrokes.
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft !== s.q) set({ q: draft || undefined, r: undefined, x: undefined, like: undefined, wander: undefined }, true);
    }, 140);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const refinements = useMemo(() => s.refinements.flatMap((text) => parseRefinement(text).map((r) => ({ r, text }))), [s.refinements.join('|')]);
  const searching = !!(s.q || refinements.length);

  useEffect(() => {
    if (!searching) {
      setResponse(undefined);
      return;
    }
    let live = true;
    engine
      .search({ query: s.q, refinements: refinements.map((x) => x.r), ignoredHints: new Set(s.ignored), anchorId: s.open })
      .then((r) => live && setResponse(r));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.q, s.refinements.join('|'), s.ignored.join(','), revision, searching]);

  const browse: Card[] = useMemo(() => {
    if (s.like) return engine.related(s.like, 18).map((r) => r.card);
    const byDate = [...cards].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
    if (!s.wander) return byDate;
    // A seeded shuffle: the same wander link always shows the same order.
    return seededShuffle(byDate, Number(s.wander) || 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, s.like, s.wander, revision]);

  const likeCard = s.like ? cards.find((c) => c.id === s.like) : undefined;
  const hints: Hint[] = response?.understanding.hints ?? [];

  const addRefinement = (text: string) => {
    const t = text.trim();
    if (!t) return;
    set({ r: [...s.refinements, t].join('|') });
    setRefineDraft('');
  };

  return (
    <main className="library">
      {making && (
        <PunchStudio
          onClose={() => setMaking(false)}
          onSaved={(card) => {
            setMaking(false);
            set({ q: undefined, r: undefined, like: undefined, wander: undefined, open: card.id });
          }}
        />
      )}
      <div className="search">
        <div className="search-field">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') set({ q: draft || undefined, r: undefined, x: undefined, like: undefined, wander: undefined });
              if (e.key === 'Escape') setDraft('');
            }}
            placeholder="What do you remember?"
            aria-label="Search your library"
            autoFocus
          />
          {draft && (
            <button className="btn quiet clear" onClick={() => { setDraft(''); set({ q: undefined, r: undefined, x: undefined }); inputRef.current?.focus(); }} aria-label="Clear search">
              ✕
            </button>
          )}
        </div>

        <div className="understood" aria-live="polite">
          {searching && hints.length > 0 && <span>reading this as</span>}
          {searching &&
            hints.map((h) => (
              <span className="chip" key={h.id}>
                {h.kind === 'color' && COLOR_HEX[h.label] && <i className="swatch" style={{ background: COLOR_HEX[h.label] }} />}
                {h.kind === 'time' ? `saved ${h.label}` : h.label}
                <button aria-label={`Ignore ${h.label}`} title="Not that — ignore this" onClick={() => set({ x: [...s.ignored, h.id].join(',') })}>×</button>
              </span>
            ))}
          {refinements.map(({ r, text }, i) => (
            <span className="chip refine" key={`${text}-${i}`} title={`“${text}”`}>
              {r.label}
              <button aria-label={`Remove ${r.label}`} onClick={() => set({ r: s.refinements.filter((t) => t !== text).join('|') || undefined })}>×</button>
            </span>
          ))}
          {!searching && !s.like && (
            <>
              <span>try</span>
              {EXAMPLES.map((ex) => (
                <button key={ex} className="chip" style={{ cursor: 'pointer', paddingRight: 10 }} onClick={() => setDraft(ex)}>
                  {ex}
                </button>
              ))}
            </>
          )}
        </div>

        {searching && response && (
          <div className="refine-line">
            <span className="kicker">refine</span>
            <input
              value={refineDraft}
              onChange={(e) => setRefineDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addRefinement(refineDraft)}
              placeholder="Not quite? “it was more about design”, “I think it was a quote”, “saved around the same time”…"
              aria-label="Refine this search"
            />
          </div>
        )}

        <div className="search-meta">
          <span>
            {searching && response && `${response.results.length} ${response.results.length === 1 ? 'thing' : 'things'}`}
            {!searching && (s.like ? `More like “${likeCard?.title ?? '…'}”` : s.wander ? 'Wandering — a random walk through everything you’ve kept' : `${cards.length} things kept, newest first`)}
          </span>
          {!searching && (
            <span style={{ display: 'flex', gap: 6 }}>
              {(s.like || s.wander) && <button className="btn quiet" onClick={() => set({ like: undefined, wander: undefined })}>Newest first</button>}
              <button className="btn quiet" onClick={() => set({ wander: String(Math.floor(Math.random() * 1e6)), like: undefined })}>
                {s.wander ? 'Wander again' : 'Wander'}
              </button>
              <button className="btn quiet" onClick={() => setMaking(true)}>+ New piece</button>
            </span>
          )}
          {searching && status !== 'ready' && <span>{status === 'loading' ? 'warming up meaning-based search…' : 'matching words only (model unavailable)'}</span>}
        </div>
      </div>

      {searching && response && !response.confident && response.results.length > 0 && (
        <p className="uncertain">Nothing certain. These are the closest things you’ve kept{hints.length ? ' — try loosening what I read into it' : ''}.</p>
      )}

      {searching && response && (
        <div className="results" role="listbox" aria-label="Results">
          {response.results.length === 0 && <p className="empty">Nothing yet. Describe it another way — what it was near, what it made you feel, who you shared it with.</p>}
          {response.results.map((r, i) => (
            <button
              key={r.card.id}
              className="result"
              role="option"
              aria-selected={s.open === r.card.id}
              style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
              onClick={() => set({ open: r.card.id })}
            >
              <div className="thumb"><CardThumb card={r.card} /></div>
              <div>
                <div className="meta">
                  <span>{byline(r.card)}</span>
                  <span>·</span>
                  <span>{savedLabel(r.card)}</span>
                </div>
                <h3><Highlight text={r.card.title} matched={r.matched} /></h3>
                <p className={`excerpt ${r.passage?.field === 'quote' ? 'quote' : ''}`}>
                  <Highlight text={trim(r.passage?.text ?? gist(r.card))} matched={r.matched} />
                </p>
                {r.why.length > 0 && <div className="why">{r.why.join(' · ')}</div>}
              </div>
            </button>
          ))}
        </div>
      )}

      {!searching && (
        <div className="grid">
          {browse.map((c, i) => (
            <button key={c.id} className="tile" style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }} onClick={() => set({ open: c.id })}>
              {c.type === 'image' && !c.cover && <div style={{ aspectRatio: '4 / 3' }}><CardArt card={c} /></div>}
              {c.type === 'image' && c.cover && <Picture className="tile-picture" src={c.cover} alt="" lazy />}
              {c.type !== 'image' && c.cover && <div className="tile-cover"><Picture src={c.cover} alt="" lazy /></div>}
              <div className="body">
                <div className="kicker">{byline(c)}</div>
                <h3>{c.title}</h3>
                {c.type !== 'image' && <p className={c.quote ? 'quote-text' : ''}>{c.quote ? `“${c.quote}”` : gist(c)}</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      {s.open && (
        <CardDrawer
          id={s.open}
          onClose={() => set({ open: undefined })}
          onOpen={(id) => set({ open: id })}
          onMoreLike={(id) => set({ q: undefined, r: undefined, x: undefined, like: id, open: undefined, wander: undefined })}
          onSameTime={() => set({ r: [...s.refinements, 'saved around the same time'].join('|'), q: s.q || undefined })}
        />
      )}
    </main>
  );
}

function trim(t: string, max = 260) {
  return t.length > max ? `${t.slice(0, max).replace(/\s\S*$/, '')}…` : t;
}
