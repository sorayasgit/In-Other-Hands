import { memo, useLayoutEffect, useRef } from 'react';
import type { Card } from '../data/types';
import { CardArt } from '../ui/CardArt';
import { byline } from '../ui/format';
import { CARD_W, type CardNode, type NoteNode } from './model';

interface CardProps {
  node: CardNode;
  card: Card | undefined;
  selected: boolean;
  /** Far zoomed out: draw a simple spine instead of full content. */
  lod: boolean;
  height: number;
  onMeasure: (id: string, h: number) => void;
}

/** A library card placed on the canvas. Content comes live from the library; size is measured. */
export const CanvasCard = memo(function CanvasCard({ node, card, selected, lod, height, onMeasure }: CardProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || lod) return;
    const measure = () => el.offsetHeight > 0 && Math.abs(el.offsetHeight - height) > 1 && onMeasure(node.id, el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [node.id, lod, height, onMeasure, card]);

  const style = {
    left: node.x,
    top: node.y,
    width: CARD_W,
    transform: node.scale !== 1 ? `scale(${node.scale})` : undefined,
  };

  if (!card) {
    return (
      <div ref={ref} className={`cv-node cv-card cv-missing ${selected ? 'is-selected' : ''}`} data-node-id={node.id} style={style}>
        <div className="cv-card-body">No longer in your library. Remove it, or undo if that was a mistake.</div>
      </div>
    );
  }

  if (lod) {
    return (
      <div className={`cv-node cv-card cv-spine t-${card.type} ${selected ? 'is-selected' : ''}`} data-node-id={node.id} style={{ ...style, height }}>
        {card.type === 'image' ? <CardArt card={card} ratio={height / CARD_W} /> : <span>{card.title}</span>}
      </div>
    );
  }

  return (
    <div ref={ref} className={`cv-node cv-card t-${card.type} ${selected ? 'is-selected' : ''}`} data-node-id={node.id} style={style}>
      {card.type === 'image' && (
        <div className="cv-art">
          <CardArt card={card} />
        </div>
      )}
      <div className="cv-card-body">
        <div className="kicker">{byline(card)}</div>
        {card.quote ? (
          <>
            <p className="cv-quote">“{card.quote}”</p>
            <div className="cv-sub">{card.title}</div>
          </>
        ) : (
          <>
            <h4>{card.title}</h4>
            {card.type !== 'image' && <p className="cv-text">{card.description ?? card.body ?? card.note}</p>}
          </>
        )}
      </div>
    </div>
  );
});

interface NoteProps {
  node: NoteNode;
  selected: boolean;
  editing: boolean;
  onChange: (text: string) => void;
  onDone: () => void;
}

/** A thought written directly on the canvas. Can be kept in the library later. */
export const CanvasNote = memo(function CanvasNote({ node, selected, editing, onChange, onDone }: NoteProps) {
  return (
    <div
      className={`cv-node cv-note ${selected ? 'is-selected' : ''} ${editing ? 'is-editing' : ''}`}
      data-node-id={node.id}
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
    >
      {editing ? (
        <textarea
          autoFocus
          defaultValue={node.text}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onDone}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) (e.target as HTMLTextAreaElement).blur();
            e.stopPropagation();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="A thought…"
        />
      ) : (
        <div className="cv-note-text">{node.text || <span className="cv-placeholder">Double-click to write</span>}</div>
      )}
    </div>
  );
});
