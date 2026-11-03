/**
 * Shared-element zoom (FLIP) with the Web Animations API: transforms and opacity only, so the
 * compositor does the work. Under reduced motion every zoom becomes a short fade.
 */

export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const ZOOM_MS = 500;
export const FADE_MS = 300;

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** The transform that makes an element laid out at `to` appear at `from` (origin top-left). */
function invert(from: Box, to: Box): string {
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`;
}

/** Grow `el` (already at its final layout) out of `from`. */
export function zoomIn(el: HTMLElement, from: Box | undefined, extra: Keyframe[] = []): Animation | undefined {
  if (!from || reducedMotion()) return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  const to = boxOf(el);
  el.style.transformOrigin = '0 0';
  return el.animate(
    [
      { transform: invert(from, to), ...extra[0] },
      { transform: 'none', ...extra[1] },
    ],
    { duration: ZOOM_MS, easing: EASE },
  );
}

/** Shrink `el` back into `to`, then resolve. */
export function zoomOut(el: HTMLElement, to: Box | undefined, extra: Keyframe[] = []): Promise<void> {
  const anim =
    !to || reducedMotion()
      ? el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' })
      : (() => {
          const from = boxOf(el);
          el.style.transformOrigin = '0 0';
          return el.animate(
            [
              { transform: 'none', ...extra[0] },
              { transform: invert(to, from), ...extra[1] },
            ],
            { duration: ZOOM_MS - 60, easing: EASE, fill: 'forwards' },
          );
        })();
  return anim.finished.then(() => undefined, () => undefined);
}

/** Slide `el` down off the bottom of the screen, then resolve. */
export function slideAway(el: HTMLElement): Promise<void> {
  const anim = reducedMotion()
    ? el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' })
    : el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }], { duration: 560, easing: 'cubic-bezier(0.6, 0, 0.3, 1)', fill: 'forwards' });
  return anim.finished.then(() => undefined, () => undefined);
}

export function fade(el: HTMLElement, show: boolean, ms = FADE_MS): Promise<void> {
  return el
    .animate([{ opacity: show ? 0 : 1 }, { opacity: show ? 1 : 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' })
    .finished.then(() => undefined, () => undefined);
}

// ── Folder preview: cards burst out of a folder, retract into it, settle into the board ──────

export const SPRING = 'cubic-bezier(0.22, 1.2, 0.36, 1)';

const centre = (b: Box) => [b.left + b.width / 2, b.top + b.height / 2];

/**
 * Slide out from behind the folder: from (dx, dy) — the folder's centre relative to the card's own —
 * at `fit` scale (small enough to hide behind it) to rest at `rotate` degrees.
 */
export function burst(el: HTMLElement, dx: number, dy: number, rotate: number, delay: number, fit = 0.6): Animation {
  if (reducedMotion()) return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay, easing: 'ease-out', fill: 'backwards' });
  return el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${fit}) rotate(0deg)` },
      { transform: `translate(0px, 0px) scale(1) rotate(${rotate}deg)` },
    ],
    { duration: 500, delay, easing: SPRING, fill: 'backwards' },
  );
}

/** The reverse of `burst`: back into the stack behind the folder. */
export function retract(el: HTMLElement, dx: number, dy: number, rotate: number, delay: number, fit = 0.6): Promise<void> {
  const anim = reducedMotion()
    ? el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, delay, easing: 'ease-in', fill: 'forwards' })
    : el.animate(
        [
          { transform: `translate(0px, 0px) scale(1) rotate(${rotate}deg)` },
          { transform: `translate(${dx}px, ${dy}px) scale(${fit}) rotate(0deg)` },
        ],
        { duration: 300, delay, easing: 'cubic-bezier(0.55, 0, 0.75, 0.2)', fill: 'forwards' },
      );
  return anim.finished.then(() => undefined, () => undefined);
}

/** A card laid out on the board starts where it lay in the preview, rotation easing to 0. */
export function settle(el: HTMLElement, from: Box, rotate: number): Animation {
  if (reducedMotion()) return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  const to = boxOf(el);
  const [fx, fy] = centre(from);
  const [tx, ty] = centre(to);
  el.style.transformOrigin = '50% 50%';
  return el.animate(
    [
      { transform: `translate(${fx - tx}px, ${fy - ty}px) rotate(${rotate}deg) scale(${from.width / to.width}, ${from.height / to.height})` },
      { transform: 'translate(0px, 0px) rotate(0deg) scale(1, 1)' },
    ],
    { duration: ZOOM_MS, easing: EASE },
  );
}
