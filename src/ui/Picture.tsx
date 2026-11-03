import { useEffect, useRef, type CSSProperties } from 'react';
import { asset } from '../asset';

export const isVideo = (src: string) => /\.(mp4|webm|mov|m4v)$/i.test(src);

/**
 * A saved picture. Videos behave like a GIF: silent, looping, no controls, and they can't be
 * clicked, paused or right-clicked (pointer events pass through to whatever holds them).
 */
export function Picture({ src, alt, className, style, lazy }: { src: string; alt: string; className?: string; style?: CSSProperties; lazy?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);

  // React doesn't reliably reflect `muted` before autoplay is decided, so set it and start here.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => undefined);
  }, [src]);

  if (isVideo(src)) {
    return (
      <video
        ref={video}
        className={className}
        style={{ ...style, pointerEvents: 'none' }}
        src={asset(src)}
        aria-label={alt}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        tabIndex={-1}
      />
    );
  }
  return <img className={className} style={style} src={asset(src)} alt={alt} loading={lazy ? 'lazy' : undefined} />;
}
