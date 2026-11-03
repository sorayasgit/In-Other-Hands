import { useEffect, useRef } from 'react';

/**
 * A slim scroll bar of our own, floating over the right edge. The browser's own bar is hidden, so it
 * never takes up room: the page is the same width whether or not it can scroll, and nothing shifts
 * when an about page slides up over it and the page underneath stops scrolling. It shows while
 * scrolling (or with the pointer near the edge) and can be dragged.
 */

const SHEET = '.is-about:not(.is-still):not(.is-leaving)';
/** The page or the about sheet that's scrolling now. */
const scroller = () => document.querySelector<HTMLElement>(SHEET) ?? document.documentElement;

export function ScrollThumb() {
  const thumb = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = thumb.current!;
    let hide = 0;
    let drag: { y: number; top: number; s: HTMLElement } | undefined;
    const place = (show: boolean) => {
      const s = scroller();
      const view = s === document.documentElement ? window.innerHeight : s.clientHeight;
      const room = s.scrollHeight - view;
      if (room <= 1) return el.classList.remove('is-on');
      const h = Math.max(36, (view / s.scrollHeight) * (view - 8));
      el.style.height = `${h}px`;
      el.style.transform = `translateY(${4 + (s.scrollTop / room) * (view - 8 - h)}px)`;
      if (!show) return;
      el.classList.add('is-on');
      clearTimeout(hide);
      if (!drag) hide = window.setTimeout(() => el.classList.remove('is-on'), 900);
    };
    const onScroll = (e: Event) => {
      const t = e.target === document ? document.documentElement : (e.target as HTMLElement);
      if (t === scroller()) place(true);
    };
    const onMove = (e: PointerEvent) => {
      if (drag) {
        const s = drag.s;
        const view = s === document.documentElement ? window.innerHeight : s.clientHeight;
        const travel = view - 8 - el.offsetHeight;
        s.scrollTop = drag.top + ((e.clientY - drag.y) / Math.max(1, travel)) * (s.scrollHeight - view);
      } else if (e.pointerType === 'mouse' && window.innerWidth - e.clientX < 14) place(true);
    };
    const onDown = (e: PointerEvent) => {
      const s = scroller();
      drag = { y: e.clientY, top: s.scrollTop, s };
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
      e.preventDefault();
    };
    const onUp = () => {
      drag = undefined;
      el.classList.remove('is-dragging');
      place(true);
    };
    const onResize = () => place(false);
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', onResize);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      clearTimeout(hide);
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return <div ref={thumb} className="scroll-thumb" aria-hidden />;
}
