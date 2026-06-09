'use client';

import { parseYouTubeVideoId, youtubeEmbedUrl } from '@fahybrid/shared/youtube';
import { cn } from '@/lib/utils';

interface YouTubeEmbedProps {
  url: string;
  title?: string;
  className?: string;
  aspect?: '16/9' | '4/3';
}

/** In-app YouTube player — iframe stays inside the dashboard / preview shell. */
export function YouTubeEmbed({
  url,
  title = 'Video demo',
  className,
  aspect = '16/9',
}: YouTubeEmbedProps) {
  const id = parseYouTubeVideoId(url);
  if (!id) return null;

  const aspectClass = aspect === '4/3' ? 'aspect-[4/3]' : 'aspect-video';

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-[var(--r-m)] border border-[color:var(--hairline)] bg-black',
        aspectClass,
        className,
      )}
    >
      <iframe
        src={youtubeEmbedUrl(id)}
        title={title}
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
