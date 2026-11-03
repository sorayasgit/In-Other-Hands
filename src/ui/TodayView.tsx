import { useEffect, useState, type ReactNode } from 'react';
import type { TrailEntry } from '../data/types';
import { agoLabel, newEntry, pieceImageSrc, type Piece } from '../handful/handful';
import { reencodeImage } from '../handful/image';
import { handful, today, useHandful } from '../handful/store';
import { navigate, type Route } from '../router';
import { HandfulBoard, handsLabel } from './HandfulBoard';
import { Picture } from './Picture';
import './home.css';

const KIND_LABEL: Record<Piece['kind'], string> = { book: 'Book', note: 'Note', quote: 'Quote', song: 'Song', recipe: 'Recipe', photo: 'Photo' };

/**
 * The home page's masthead. The about links (Purpose … Request Demo) are drawn as in the design but
 * lead nowhere yet: there are no such pages, and no accounts to log in to.
 */
export function HomeHeader({ tabs }: { tabs: ReactNode }) {
  return (
    <header className="home-head">
      <div className="home-bar">
        <a className="home-logo" href="#/today">
          <img src="/brand/wordmark.png" alt="In Other Hands" width={1394} height={366} />
        </a>
        <nav className="home-links" aria-label="About">
          <span>Purpose</span>
          <span>Experience</span>
          <span>Newsroom</span>
          <span className="home-links-gap" />
          <span>Login</span>
          <span className="is-underlined">Request Demo</span>
          <span className="home-arrow" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16M14 6l6 6-6 6" /></svg>
          </span>
        </nav>
      </div>
      <h1 className="home-title">In your hands</h1>
      <nav className="home-tabs" aria-label="Sections">{tabs}</nav>
    </header>
  );
}

export function TodayView({ route }: { route: Route }) {
  const state = useHandful();
  const open = route.params.get('piece') ?? undefined;
  const [toast, setToast] = useState<string>();
  const day = today();
  const ids = handful.todayIds();
  const pieces = ids.map((id) => handful.piece(id)).filter((p): p is Piece => !!p);
  const elsewhere = state.held.filter((id) => !ids.includes(id));

  useEffect(() => handful.settleToday(), [day]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const openPiece = (id?: string) => navigate('/today', { piece: id });
  const date = new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <main className="today">
      <p className="today-lede">
        {date}{state.dayOffset ? ` (${state.dayOffset} ${state.dayOffset === 1 ? 'day' : 'days'} ahead)` : ''} · twenty pieces from other hands. Keep what speaks to you, add something, pass it on.
      </p>

      {elsewhere.length > 0 && (
        <p className="holding">
          <span className="kicker">Still holding</span>
          {elsewhere.map((id) => (
            <button key={id} className="chip" style={{ cursor: 'pointer', paddingRight: 10 }} onClick={() => openPiece(id)}>
              {handful.piece(id)?.title ?? id}
            </button>
          ))}
        </p>
      )}

      <HandfulBoard
        pieces={pieces}
        status={(id) => ({ kept: state.held.includes(id), passed: handful.returnedToday(id) })}
        onOpen={openPiece}
        onKeep={(id) => handful.keep(id)}
      />
      <p className="handful-end">That’s today’s handful. See you tomorrow.</p>

      {open && <PiecePanel id={open} onClose={() => openPiece(undefined)} onReturned={() => setToast('Passed along.')} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function PiecePanel({ id, onClose, onReturned }: { id: string; onClose: () => void; onReturned: () => void }) {
  const state = useHandful();
  const piece = handful.piece(id);
  const day = today();
  const held = state.held.includes(id);
  const returned = handful.returnedToday(id);
  const pending = state.pending[id] ?? [];
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!piece) return null;

  const doReturn = () => {
    if (!confirm('Return this piece? It leaves your library and goes back out with what you added. No name goes with it.')) return;
    handful.returnPiece(id);
    onReturned();
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer piece-panel" role="dialog" aria-label={piece.title}>
        <div className="drawer-top">
          <span className="kicker">{KIND_LABEL[piece.kind]} · {handsLabel(piece.hands)}</span>
          <button className="btn quiet" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <h1>{piece.title}</h1>
        {piece.image && <Picture className="piece-img" src={pieceImageSrc(piece.image)} alt={piece.body} />}
        {piece.kind === 'quote' ? <blockquote className="big-quote">{piece.body}</blockquote> : <p className="prose">{piece.body}</p>}

        <div className="actions">
          {returned ? (
            <span className="kicker">Passed along today.</span>
          ) : held ? (
            <>
              <span className="kept-mark">Kept ✓</span>
              {!adding && <button className="btn" onClick={() => setAdding(true)}>Add something</button>}
              <button className="btn primary" onClick={doReturn}>Return</button>
            </>
          ) : (
            <button className="btn primary" onClick={() => handful.keep(id)}>Keep</button>
          )}
        </div>

        {held && adding && <AddForm onAdd={(e) => { handful.addPending(id, e); setAdding(false); }} onCancel={() => setAdding(false)} today={day} />}

        <section>
          <div className="kicker">The trail</div>
          {!piece.trail.length && !pending.length && <p className="byline">No one has added anything yet.</p>}
          <ol className="trail">
            {piece.trail.map((e) => (
              <TrailItem key={e.id} entry={e} label={`a hand, ${agoLabel(e.addedOn, day)}`} />
            ))}
            {pending.map((e) => (
              <TrailItem key={e.id} entry={e} label="yours, not yet returned" mine onRemove={() => handful.removePending(id, e.id)} />
            ))}
          </ol>
        </section>
      </aside>
    </>
  );
}

function TrailItem({ entry, label, mine, onRemove }: { entry: TrailEntry; label: string; mine?: boolean; onRemove?: () => void }) {
  const [title, link] = entry.kind === 'song' ? entry.text.split(' — ') : [entry.text];
  return (
    <li className={`trail-item ${mine ? 'is-mine' : ''}`}>
      <div className="trail-label">
        {label}
        {onRemove && <button className="btn quiet" onClick={onRemove} aria-label="Remove this addition">remove</button>}
      </div>
      {entry.kind === 'image' &&
        (entry.imageDataUrl ? <img className="trail-img" src={entry.imageDataUrl} alt={entry.text || 'an added image'} /> : <div className="trail-img placeholder" aria-hidden />)}
      {entry.kind === 'song' ? (
        <p>♪ {title}{link && <span className="trail-link"> · {link}</span>}</p>
      ) : (
        entry.text && <p>{entry.text}</p>
      )}
    </li>
  );
}

function AddForm({ onAdd, onCancel, today: day }: { onAdd: (e: TrailEntry) => void; onCancel: () => void; today: string }) {
  const [note, setNote] = useState('');
  const [song, setSong] = useState('');
  const [songLink, setSongLink] = useState('');
  const [image, setImage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = () => {
    // Each part becomes its own anonymous entry on the trail.
    if (image) onAdd(newEntry('image', note, day, image));
    else if (note.trim()) onAdd(newEntry('note', note, day));
    if (song.trim()) onAdd(newEntry('song', songLink.trim() ? `${song.trim()} — ${songLink.trim()}` : song, day));
    if (!image && !note.trim() && !song.trim()) onCancel();
  };

  return (
    <form className="add-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note to go with it…" aria-label="Note" autoFocus />
      <label className="add-image">
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setBusy(true);
            try {
              setImage(await reencodeImage(file));
            } finally {
              setBusy(false);
            }
          }}
        />
        {busy ? 'preparing…' : image ? 'image ready (location data removed)' : '+ an image (optional)'}
      </label>
      {image && <img className="trail-img" src={image} alt="" />}
      <div className="add-song">
        <input value={song} onChange={(e) => setSong(e.target.value)} placeholder="A song (optional)" aria-label="Song title" />
        <input value={songLink} onChange={(e) => setSongLink(e.target.value)} placeholder="link, as plain text" aria-label="Song link" />
      </div>
      <div className="actions">
        <button className="btn primary" type="submit" disabled={busy}>Add to the trail</button>
        <button className="btn quiet" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
