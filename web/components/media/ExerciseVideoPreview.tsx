'use client';

// EL VÍDEO DE UN EJERCICIO, REPRODUCIDO — sea cual sea su forma.
//
// La forma la dice el localizador, nunca quien llama: un enlace de YouTube va en su
// incrustado (y en 9:16 si es un Short), y el vídeo propio del entrenador va en el
// reproductor de Cloudflare Stream. Es el mismo `parseExerciseVideo` que valida el
// guardado, así que lo que se ve aquí es exactamente lo que se guardó.
//
// El incrustado de Stream tiene la MISMA forma que el de YouTube —un iframe dentro de
// un marco con relación de aspecto— a propósito: son dos alojamientos del mismo
// contenido y no dos experiencias distintas.
//
// POR QUÉ EL MARCO ES 16:9 Y NO SE ADIVINA LA ORIENTACIÓN: en YouTube la verticalidad
// viaja en el propio enlace (`/shorts/`), así que se puede leer sin preguntar a nadie.
// En Stream no viaja: el localizador es code + uid y nada más. Averiguarla exigiría una
// llamada a la API por cada vídeo pintado, y adivinarla a partir de lo que se acaba de
// subir daría un marco distinto antes y después de recargar la página. El reproductor
// de Cloudflare ya centra el vídeo dentro del marco, que es lo mismo que hace YouTube
// con un vídeo que no es un Short.

import { exerciseStreamIframeUrl, parseExerciseVideo } from '@/lib/exercises/video-source';
import { YouTubeEmbed } from './YouTubeEmbed';
import { cn } from '@/lib/utils';

export function ExerciseVideoPreview({
  url,
  title = 'Vídeo de técnica',
  className,
}: {
  url: string;
  title?: string;
  className?: string;
}) {
  const video = parseExerciseVideo(url);
  if (!video) return null;

  if (video.kind === 'youtube') {
    return <YouTubeEmbed url={video.url} title={title} className={className} />;
  }

  return (
    <div
      className={cn(
        'relative aspect-video w-full overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-black',
        className,
      )}
    >
      <iframe
        src={exerciseStreamIframeUrl(video)}
        title={title}
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; gyroscope; encrypted-media; picture-in-picture;"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}
