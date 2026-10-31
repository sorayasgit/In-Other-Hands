/** Vectors are L2-normalised, so cosine similarity is a dot product. */
export type Vec = Float32Array;

export function dot(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function normalize(v: Vec): Vec {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/** a + w·b, normalised. */
export function blend(a: Vec, b: Vec, w: number): Vec {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + w * b[i];
  return normalize(out);
}

export function centroid(vs: Vec[]): Vec | undefined {
  if (!vs.length) return undefined;
  const out = new Float32Array(vs[0].length);
  for (const v of vs) for (let i = 0; i < v.length; i++) out[i] += v[i];
  return normalize(out);
}

// Library vectors ship as int8 (×127) in base64: ~4× smaller than float JSON, no visible loss.

export function encodeInt8(v: ArrayLike<number>): string {
  const bytes = new Uint8Array(v.length);
  for (let i = 0; i < v.length; i++) bytes[i] = (Math.max(-127, Math.min(127, Math.round(v[i] * 127))) + 256) % 256;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function decodeInt8(s: string): Vec {
  const bin = atob(s);
  const out = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    const b = bin.charCodeAt(i);
    out[i] = (b > 127 ? b - 256 : b) / 127;
  }
  return normalize(out);
}
