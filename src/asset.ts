/**
 * A file from public/, wherever the site is served from. Pictures are stored with paths from the
 * site's root ("/covers/…"), which only work when the site sits at the root of its domain; on
 * GitHub Pages it sits under /In-Other-Hands/, so those paths are put under the base here, as the
 * page is drawn. Pictures made on this device (data: URLs) and full URLs pass through as they are.
 */
export const asset = (path: string) => (path.startsWith('/') && !path.startsWith('//') ? import.meta.env.BASE_URL.replace(/\/$/, '') + path : path);
