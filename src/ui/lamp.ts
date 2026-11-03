import type { PointerEvent } from 'react';

/**
 * A card under the pointer leans toward it and catches the light where the pointer is, as if you
 * were holding a lamp over it; only while the pointer is over it, otherwise it lies still. Mouse and
 * pen only, so a finger scrolling past doesn't set it rocking. The light itself is drawn in
 * home.css, from the --lx and --ly this sets.
 *
 * `lean` scales the tilt: 1 for the Handful's cards, less where many sit close together.
 */
const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const VARS = ['--rx', '--ry', '--lx', '--ly'];
/** How long the first lean takes, before the card starts following the pointer closely. */
const EASE_IN = 520;
const easing = new WeakMap<HTMLElement, number>();

export function lamp(lean = 1) {
  return {
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (e.pointerType === 'touch') return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      // where the pointer is, 0 to 1 across and down
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      const k = still ? 0 : lean;
      el.style.setProperty('--rx', `${(0.5 - y) * 12 * k}deg`);
      el.style.setProperty('--ry', `${(x - 0.5) * 16 * k}deg`);
      el.style.setProperty('--lx', `${x * 100}%`);
      el.style.setProperty('--ly', `${y * 100}%`);
      if (!el.classList.contains('is-tilted')) {
        // the first lean is slow, so the card tips over to meet the pointer instead of snapping to it
        el.classList.add('is-tilted', 'is-easing');
        easing.set(el, window.setTimeout(() => el.classList.remove('is-easing'), EASE_IN));
      }
    },
    onPointerLeave(e: PointerEvent<HTMLElement>) {
      const el = e.currentTarget;
      clearTimeout(easing.get(el));
      el.classList.remove('is-tilted', 'is-easing');
      for (const k of VARS) el.style.removeProperty(k);
    },
  };
}
