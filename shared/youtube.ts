import { z } from 'zod';

const YT_ID_RE = /^[\w-]{11}$/;

/** Normalize a pasted YouTube URL to a canonical watch URL, or null if invalid. */
export function parseYouTubeVideoId(input: string): string | null {
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
    return id && YT_ID_RE.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = url.searchParams.get('v');
    if (v && YT_ID_RE.test(v)) return v;

    const embed = url.pathname.match(/^\/embed\/([\w-]{11})/);
    if (embed?.[1]) return embed[1];

    const shorts = url.pathname.match(/^\/shorts\/([\w-]{11})/);
    if (shorts?.[1]) return shorts[1];
  }

  return null;
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

export const youtubeUrlSchema = z
  .string()
  .max(500)
  .refine((v) => v === '' || isValidYouTubeUrl(v), {
    message: 'Must be a valid YouTube URL',
  })
  .transform((v) => {
    if (!v || v.trim() === '') return null;
    const id = parseYouTubeVideoId(v);
    return id ? youtubeWatchUrl(id) : null;
  });
