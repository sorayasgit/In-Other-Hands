/** A colour for each folder, chosen while it is spread open; kept on this device only. */

const KEY = 'ioh.collections.colors.v1';

/** No value is the plain grey folder. */
export const FOLDER_COLORS: { name: string; value?: string; swatch: string }[] = [
  { name: 'Grey', swatch: '#dfdfdf' },
  { name: 'Ink', value: '#232323', swatch: '#232323' },
  { name: 'Rose', value: '#be7f74', swatch: '#be7f74' },
  { name: 'Mauve', value: '#795058', swatch: '#795058' },
  { name: 'Olive', value: '#908f67', swatch: '#908f67' },
  { name: 'Sand', value: '#eecc89', swatch: '#eecc89' },
  { name: 'Navy', value: '#282d4b', swatch: '#282d4b' },
  { name: 'Slate', value: '#5c606c', swatch: '#5c606c' },
  { name: 'Brick', value: '#842019', swatch: '#842019' },
  { name: 'Copper', value: '#ba5f24', swatch: '#ba5f24' },
];

export function loadFolderColors(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveFolderColor(name: string, color?: string): Record<string, string> {
  const { [name]: _, ...rest } = loadFolderColors();
  const next = color ? { ...rest, [name]: color } : rest;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the colour lasts until the page reloads.
  }
  return next;
}

/** Dark folders take light lettering. */
export function isDark(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45;
}
