'use client';

// EL VÍDEO DE UN EJERCICIO, REPRODUCIDO — sea cual sea su forma.
//
// La forma la dice el localizador, nunca quien llama: un enlace de YouTube va en su
// incrustado (y en 9:16 si es un Short), y un fichero del coach va en el reproductor
// del navegador contra nuestro proxy autenticado. Es el mismo `parseExerciseVideo`
// que valida el guardado, así que lo que se ve aquí es exactamente lo que se guardó.
//
// El fichero propio se pide en el mismo origen, así que la petición del `<video>`
// lleva la sesión del coach y el proxy la autoriza sin nada más.

import { parseExerciseVideo } from '@/lib/exercises/video-source';
import { YouTubeEmbed } from './YouTubeEmbed';
import { cn } from '@/lib/utils';

// Un vídeo grabado de pie es vertical: sin tope de alto sería una columna de casi
// 900 px y el campo que lo pegó se saldría de la pantalla.
const MAX_HEIGHT = 'max-h-[360px]';

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
        'overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-black',
        className,
      )}
    >
      <video
        src={video.url}
        title={title}
        controls
        playsInline
        preload="metadata"
        className={cn('mx-auto block w-auto max-w-full', MAX_HEIGHT)}
      />
    </div>
  );
}
