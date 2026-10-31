/** Colour words people use when remembering an image, mapped to representative colours. */
export const COLOR_WORDS: Record<string, string[]> = {
  red: ['#C0392B'],
  orange: ['#E07B28'],
  amber: ['#E8A33D'],
  yellow: ['#E8C547'],
  mustard: ['#D4A72C'],
  gold: ['#C9A227'],
  green: ['#5B8C3A'],
  olive: ['#6E7F46'],
  teal: ['#0F8A8A'],
  blue: ['#3E6FA8'],
  navy: ['#1B2340'],
  purple: ['#6E4B9E'],
  violet: ['#7A5C9E'],
  pink: ['#E86AA6'],
  brown: ['#6B4226'],
  rust: ['#A0522D'],
  terracotta: ['#C8692B'],
  ochre: ['#C08A2E'],
  beige: ['#E3D2B4'],
  cream: ['#F2E8D5'],
  white: ['#F4F1EA'],
  grey: ['#8A8F94'],
  gray: ['#8A8F94'],
  black: ['#1A1A1A'],
  earthy: ['#8C5A3C', '#6E7F46'],
  warm: ['#D2691E', '#C8692B'],
  cool: ['#3E6FA8', '#0F8A8A'],
  pastel: ['#F3C6D8', '#C6E2F3'],
  neon: ['#FF48B0', '#39FF14'],
  fluorescent: ['#FF48B0'],
};

type Lab = [number, number, number];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toLab(hex: string): Lab {
  const lin = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = lin;
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function deltaE(a: Lab, b: Lab) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * How well an image's palette contains every remembered colour, 0–1. Each colour word must be near
 * at least one palette swatch; earlier (more dominant) swatches count slightly more.
 */
export function paletteMatch(palette: string[] | undefined, colorWords: string[]): number {
  if (!palette?.length || !colorWords.length) return 0;
  const swatches = palette.map(toLab);
  let total = 0;
  for (const word of colorWords) {
    const targets = (COLOR_WORDS[word] ?? []).map(toLab);
    let best = 0;
    for (const t of targets) {
      swatches.forEach((s, i) => {
        const closeness = Math.max(0, 1 - deltaE(s, t) / 45);
        const dominance = 1 - i * 0.08;
        best = Math.max(best, closeness * dominance);
      });
    }
    total += best;
  }
  return total / colorWords.length;
}
