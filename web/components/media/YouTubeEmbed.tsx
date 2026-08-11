'use client';

// El reproductor de dentro del panel: el vídeo se ve AQUÍ, sin abrir otra pestaña.
// Va contra `youtube-nocookie.com` para no plantarle cookies de seguimiento al
// coach sólo por comprobar que ha pegado el enlace que creía.
//
// LA FORMA LA DICE EL ENLACE, no quien lo llama. Un Short es vertical (9:16) y un
// vídeo normal horizontal (16:9); `parseYouTubeLink` ya sabe distinguirlos, así que
// pintarlo todo en 16:9 sería meterle bandas negras a la mitad de los vídeos de
// técnica, que se graban con el móvil de pie. Es la misma regla que ya aplica el
// reproductor de iOS (Media/YouTubeEmbedView.swift).

import { parseYouTubeLink, youtubeEmbedUrl } from '@fahybrid/shared/youtube';
import { cn } from '@/lib/utils';

// Un vertical a todo el ancho de la ficha sería una columna de casi 900px de alto:
// se acota para que quepa en la misma pantalla que el campo que lo pegó.
const VERTICAL_MAX_WIDTH = 'max-w-[190px]';

export function YouTubeEmbed({
  url,
  title = 'Vídeo de técnica',
  className,
}: {
  url: string;
  title?: string;
  className?: string;
}) {
  const link = parseYouTubeLink(url);
  if (!link) return null;

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-black',
        link.isShort ? `aspect-[9/16] ${VERTICAL_MAX_WIDTH}` : 'aspect-video',
        className,
      )}
    >
      <iframe
        src={youtubeEmbedUrl(link.id)}
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
