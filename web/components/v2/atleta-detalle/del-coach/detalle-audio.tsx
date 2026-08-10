'use client';

// LA NOTA DE VOZ, EN LA FICHA DEL COACH.
//
// El coach tiene que poder volver a OÍR lo que le mandó, no sólo leerlo: si el
// audio no se puede reproducir aquí, la única forma de saber qué le dijo a un
// atleta en junio es abrir su móvil. Es la misma razón por la que las secciones
// de una nota se releen con su forma en vez de aplanarse a un párrafo gris.
//
// Los bytes vienen de nuestro proxy autenticado, así que el navegador manda la
// sesión del coach sola y no hay ningún enlace firmado que pueda reenviarse.

import { MIcon } from '@/components/ui/MIcon';
import { duracionCorta } from './audio';

export function AudioDelDetalle({
  url,
  seconds,
}: {
  url: string | null;
  seconds: number | null;
}) {
  if (!url) return null;

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
      <MIcon name="graphic_eq" size={17} className="shrink-0 text-[color:var(--v2-accent)]" />
      <span className="text-label font-semibold text-[color:var(--v2-fg)]">Tu nota de voz</span>
      {seconds != null ? (
        <span className="v2-num text-label tabular-nums text-[color:var(--v2-muted)]">
          {duracionCorta(seconds)}
        </span>
      ) : null}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- es la voz del coach, no hay guion */}
      <audio src={url} controls preload="none" className="h-8 min-w-0 flex-1" />
    </div>
  );
}
