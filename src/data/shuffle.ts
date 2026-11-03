/**
 * Deterministic shuffle: the same seed always gives the same order. Used by Wander (numeric seed in
 * the URL) and by Today's handful (seeded by the local date).
 */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  let h = seed || 1;
  return items
    .map((item) => {
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      return [h, item] as const;
    })
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);
}

/** A stable positive integer seed from a string (FNV-1a). */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 1) || 1;
}
