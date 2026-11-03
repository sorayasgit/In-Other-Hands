/** When each collection was last opened, kept on this device only. */

const KEY = 'ioh.collections.visited.v1';

function read(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function markVisited(name: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [name]: new Date().toISOString() }));
  } catch {
    // Storage unavailable: the label just stays as it was.
  }
}

export function visitedLabel(name: string, now = Date.now()): string {
  const at = read()[name];
  if (!at) return 'not opened yet';
  const mins = Math.max(0, Math.round((now - Date.parse(at)) / 60_000));
  if (mins < 1) return 'last visited just now';
  if (mins < 60) return `last visited ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `last visited ${hrs} ${hrs === 1 ? 'hr' : 'hrs'} ago`;
  const days = Math.round(hrs / 24);
  if (days < 14) return `last visited ${days} ${days === 1 ? 'day' : 'days'} ago`;
  return `last visited ${new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()}`;
}
