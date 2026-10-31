import { useLibrary } from '../data/store';
import { href, navigate } from '../router';
import { CardArt } from '../ui/CardArt';
import { createCanvas, deleteCanvas, loadCanvas, useCanvasList } from './store';

export function CanvasList() {
  const canvases = useCanvasList();
  const cards = useLibrary();
  const byId = new Map(cards.map((c) => [c.id, c]));

  return (
    <main className="canvases">
      <h1>Canvases</h1>
      <p className="lede">Where the things you’ve kept meet each other.</p>
      <div className="canvas-tiles">
        <button
          className="canvas-tile"
          style={{ border: '1px dashed var(--hair-strong)', boxShadow: 'none', background: 'transparent', cursor: 'pointer', minHeight: 200 }}
          onClick={() => navigate(`/canvas/${createCanvas('Untitled canvas').id}`)}
        >
          <div className="label" style={{ textAlign: 'center' }}>
            <b>+ New canvas</b>
            <span>Starts empty — your library is one drag away.</span>
          </div>
        </button>
        {canvases.map((c) => {
          const doc = loadCanvas(c.id);
          const thumbs = c.itemIds.map((id) => byId.get(id)).filter((x) => x?.type === 'image').slice(0, 3);
          return (
            <a key={c.id} className="canvas-tile" href={href(`/canvas/${c.id}`)}>
              <div className="preview">
                {thumbs.map((card, i) => (
                  <div key={card!.id} style={{ position: 'absolute', width: 110, height: 82, left: 24 + i * 70, top: 22 + (i % 2) * 26, transform: `rotate(${(i - 1) * 3}deg)`, borderRadius: 6, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
                    <CardArt card={card!} />
                  </div>
                ))}
                {!thumbs.length && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--muted)', font: 'italic 15px var(--serif)' }}>{c.nodeCount ? `${c.nodeCount} things` : 'empty'}</div>}
              </div>
              <div className="label">
                <b>{c.title}</b>
                <span>
                  {c.nodeCount} things · {Object.keys(doc?.edges ?? {}).length} links ·{' '}
                  <button
                    className="linkish"
                    onClick={(e) => {
                      e.preventDefault();
                      if (confirm(`Delete “${c.title}”? The cards stay in your library.`)) deleteCanvas(c.id);
                    }}
                  >
                    delete
                  </button>
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </main>
  );
}
