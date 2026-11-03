/**
 * Re-encode an uploaded image through a canvas: JPEG, at most 800 px on the long side, quality 0.7.
 * Drawing to a canvas keeps only pixels, so EXIF (camera, time, GPS location) is gone. The original
 * file and its name are never stored.
 */
export async function reencodeImage(file: File, maxSide = 800, quality = 0.7): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // JPEG has no transparency
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}
