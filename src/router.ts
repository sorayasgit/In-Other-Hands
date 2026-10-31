import { useSyncExternalStore } from 'react';

/**
 * Hash routing. Search state lives in the URL (as Sublime does), so a search can be bookmarked and
 * the back button returns to the exact results.
 *
 *   #/?q=…&r=…        library / search
 *   #/canvases         canvas list
 *   #/canvas/:id       one canvas
 */

export interface Route {
  path: string;
  params: URLSearchParams;
}

function parse(): Route {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path, params: new URLSearchParams(query) };
}

let current = parse();
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  listeners.forEach((l) => l());
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function href(path: string, params?: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v) p.set(k, v);
  const qs = p.toString();
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export function navigate(path: string, params?: Record<string, string | undefined>, opts: { replace?: boolean } = {}) {
  const next = href(path, params);
  if (next === location.hash) return;
  if (opts.replace) {
    history.replaceState(null, '', next);
    current = parse();
    listeners.forEach((l) => l());
  } else location.hash = next;
}
