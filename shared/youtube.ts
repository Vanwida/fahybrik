import { z } from 'zod';

const YT_ID_RE = /^[\w-]{11}$/;

/**
 * Un enlace de YouTube ya leído: su id y si venía en forma de SHORT.
 *
 * `isShort` no es cosmético — es el ÚNICO indicio de que el vídeo es vertical
 * (9:16). YouTube no lo expone en la URL de `watch`, así que si al guardar se
 * canonicaliza un Short a `watch?v=`, la verticalidad se pierde para siempre y
 * el reproductor lo pinta en 16:9 con bandas negras a los lados. iOS ya sabe
 * pintar los dos formatos (`YouTubeLinkParser.Orientation`, Media/
 * YouTubeEmbedView.swift): lo que necesita es que la forma `/shorts/` le llegue.
 */
export interface YouTubeLink {
  id: string;
  isShort: boolean;
}

/** Lee una URL de YouTube pegada: su id y su forma. Null si no es de YouTube. */
export function parseYouTubeLink(input: string): YouTubeLink | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    // Un `youtu.be` no dice si es Short: se asume horizontal, que es lo que
    // devuelve YouTube al compartir un vídeo normal.
    return id && YT_ID_RE.test(id) ? { id, isShort: false } : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = url.searchParams.get('v');
    if (v && YT_ID_RE.test(v)) return { id: v, isShort: false };

    const embed = url.pathname.match(/^\/embed\/([\w-]{11})/);
    if (embed?.[1]) return { id: embed[1], isShort: false };

    const shorts = url.pathname.match(/^\/shorts\/([\w-]{11})/);
    if (shorts?.[1]) return { id: shorts[1], isShort: true };
  }

  return null;
}

/** El id de un enlace de YouTube pegado, o null si no lo es. */
export function parseYouTubeVideoId(input: string): string | null {
  return parseYouTubeLink(input)?.id ?? null;
}

/** Privacy-enhanced embed URL — plays inline in WKWebView / iframe without leaving the app. */
export function youtubeEmbedUrl(videoId: string): string {
  const id = videoId.trim();
  if (!YT_ID_RE.test(id)) {
    throw new Error('Invalid YouTube video id');
  }
  return `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1`;
}

export function isValidYouTubeUrl(input: string): boolean {
  return parseYouTubeVideoId(input) !== null;
}

/** Store canonical watch URL in DB for portability. */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** La forma canónica de un Short. Conserva la verticalidad — ver `YouTubeLink`. */
export function youtubeShortsUrl(videoId: string): string {
  return `https://www.youtube.com/shorts/${videoId}`;
}

/**
 * La URL que se GUARDA: canónica, pero conservando la forma.
 *
 * Un Short se guarda como `/shorts/<id>` y un vídeo normal como `watch?v=<id>`.
 * Antes esto colapsaba todo a `watch?v=`, que es lo que dejaba muerta la rama
 * vertical del reproductor de iOS (escrita y correcta, pero inalcanzable).
 */
export function youtubeCanonicalUrl(link: YouTubeLink): string {
  return link.isShort ? youtubeShortsUrl(link.id) : youtubeWatchUrl(link.id);
}

export const youtubeUrlSchema = z
  .string()
  .max(500)
  .refine((v) => v === '' || isValidYouTubeUrl(v), {
    message: 'Must be a valid YouTube URL',
  })
  .transform((v) => {
    if (!v || v.trim() === '') return null;
    const link = parseYouTubeLink(v);
    return link ? youtubeCanonicalUrl(link) : null;
  });
