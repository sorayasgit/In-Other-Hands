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

// ── Today: a kept piece flies to the Library tab; a returned piece lifts away ──────────────────

/**
 * A small copy of what was kept (`ghost`, positioned for you) travels from `from` into `to` and
 * fades as it lands. Resolves when it has gone.
 */
export function flyInto(ghost: HTMLElement, from: Box, to: Box): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  Object.assign(ghost.style, {
    position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
    zIndex: '70', pointerEvents: 'none', transformOrigin: '0 0', margin: '0',
  });
  document.body.append(ghost);
  const s = Math.min(to.width / from.width, to.height / from.height, 0.25);
  const dx = to.left + to.width / 2 - (from.left + (from.width * s) / 2);
  const dy = to.top + to.height / 2 - (from.top + (from.height * s) / 2);
  const anim = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 40}px) scale(${0.55 + s * 0.45}) rotate(-4deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(0deg)`, opacity: 0 },
    ],
    { duration: 820, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' },
  );
  return anim.finished.then(() => ghost.remove(), () => ghost.remove());
}

/** A small press: the card dips and comes back, as if set down. */
export function dip(el: HTMLElement): void {
  if (reducedMotion()) return;
  el.animate(
    [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(3px) scale(0.985)' }, { transform: 'translateY(0) scale(1)' }],
    { duration: 420, easing: EASE },
  );
}

/** Let go: drift up and away, then resolve. */
export function liftAway(el: HTMLElement): Promise<void> {
  const anim = reducedMotion()
    ? el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' })
    : el.animate(
        [
          { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
          { transform: 'translateY(-14px) rotate(0deg)', opacity: 1, offset: 0.25 },
          { transform: 'translateY(-90px) rotate(-1.5deg)', opacity: 0 },
        ],
        { duration: 760, easing: 'cubic-bezier(0.4, 0, 0.3, 1)', fill: 'forwards' },
      );
  return anim.finished.then(() => undefined, () => undefined);
}

/**
 * Open a panel out of a card without repainting it frame by frame: a plain sheet (two flat layers,
 * the card's colour fading into the panel's) grows from the card to the panel using only transform
 * and opacity, and the panel itself fades in over the last part of that growth.
 */
export function unfold(el: HTMLElement, from: Box, fromColor: string): { cancel: () => void } {
  if (reducedMotion()) return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  const to = boxOf(el);
  const sheet = makeSheet(to, getComputedStyle(el).backgroundColor, fromColor);
  const grow = 560;
  sheet.animate([{ transform: invert(from, to) }, { transform: 'none' }], { duration: grow, easing: EASE, fill: 'both' });
  sheet.firstElementChild!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: grow * 0.7, easing: 'ease-out', fill: 'both' });
  // The panel's own ground takes over from the sheet as it lands (same colour, so no seam)…
  const show = el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.75 }, { opacity: 1 }], { duration: grow, easing: 'linear' });
  show.finished.then(() => sheet.remove(), () => sheet.remove());
  // …then what's on it fades in slowly, one piece after another, rather than appearing at once.
  const parts = [...el.children].map((child, i) =>
    child.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], {
      duration: 760, delay: grow * 0.7 + Math.min(i, 6) * 70, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)', fill: 'backwards',
    }),
  );
  return {
    cancel: () => {
      show.cancel();
      parts.forEach((a) => a.cancel());
      sheet.remove();
    },
  };
}

/** The reverse of `unfold`: the panel fades, and the sheet shrinks back into the card. */
export function foldInto(el: HTMLElement, to: Box | undefined, toColor: string): Promise<void> {
  if (!to || reducedMotion()) return fade(el, false, 200);
  const from = boxOf(el);
  const sheet = makeSheet(from, getComputedStyle(el).backgroundColor, toColor);
  (sheet.firstElementChild as HTMLElement).style.opacity = '0';
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
  sheet.firstElementChild!.animate([{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], { duration: 460, easing: 'ease-in', fill: 'forwards' });
  return sheet
    .animate(
      [{ transform: 'none', opacity: 1 }, { transform: invert(to, from), opacity: 1, offset: 0.85 }, { transform: invert(to, from), opacity: 0 }],
      { duration: 520, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' },
    )
    .finished.then(() => sheet.remove(), () => sheet.remove());
}

/** A flat stand-in at `box`: the panel's colour, with the card's colour on top to fade between them. */
function makeSheet(box: Box, color: string, overColor: string): HTMLElement {
  const sheet = document.createElement('div');
  Object.assign(sheet.style, {
    position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    background: color, transformOrigin: '0 0', zIndex: '40', pointerEvents: 'none', willChange: 'transform', // over the scrim, under the panel
    boxShadow: '0 18px 50px rgba(0, 0, 0, 0.28)',
  });
  const over = document.createElement('div');
  Object.assign(over.style, { position: 'absolute', inset: '0', background: overColor, willChange: 'opacity' });
  sheet.append(over);
  document.body.append(sheet);
  return sheet;
}
