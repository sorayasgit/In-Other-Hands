import { bounds, type Rect } from './model';

const W = 180;
const H = 120;

interface Props {
  rects: { id: string; rect: Rect; kind: 'card' | 'note' | 'frame' }[];
  viewport: Rect;
  /** Centre the camera on a world point. */
  onTravel: (x: number, y: number) => void;
}

/** Keeps a sense of where you are on a large canvas; click or drag to travel. */
export function Minimap({ rects, viewport, onTravel }: Props) {
  const all = bounds([...rects.map((r) => r.rect), viewport]) ?? viewport;
  const pad = 40;
  const world = { x: all.x - pad, y: all.y - pad, w: all.w + pad * 2, h: all.h + pad * 2 };
  const s = Math.min(W / world.w, H / world.h);
  const ox = (W - world.w * s) / 2;
  const oy = (H - world.h * s) / 2;
  const to = (r: Rect) => ({ x: ox + (r.x - world.x) * s, y: oy + (r.y - world.y) * s, width: Math.max(1.5, r.w * s), height: Math.max(1.5, r.h * s) });

  const travel = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    onTravel(world.x + (e.clientX - box.left - ox) / s, world.y + (e.clientY - box.top - oy) / s);
  };

  return (
    <svg
      className="cv-minimap"
      width={W}
      height={H}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        travel(e);
      }}
      onPointerMove={(e) => e.buttons && travel(e)}
      aria-label="Minimap"
    >
      {rects.map((r) => (
        <rect key={r.id} {...to(r.rect)} rx={r.kind === 'frame' ? 2 : 1} className={`mm-${r.kind}`} />
      ))}
      <rect {...to(viewport)} className="mm-view" rx={2} />
    </svg>
  );
}
