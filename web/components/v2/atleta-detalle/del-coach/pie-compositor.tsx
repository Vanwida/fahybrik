'use client';

// EL PIE DEL COMPOSITOR — el botón que lo manda, y qué va a pasar cuando lo pulses.
//
// Vive aparte porque es lo que NO cambia con el tipo: los cinco formularios se
// mandan igual. Y porque es donde se dicen las tres cosas que el coach necesita
// antes de pulsar — qué falla, qué se pierde si cierra, y qué le va a pasar al
// atleta — que juntas pesan tanto como el formulario entero.

import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

/** Qué está mandándose ahora mismo. Null = nada en vuelo. */
export type Enviando = 'publicar' | 'borrador' | 'plantilla' | null;

/** El acto principal, que lo decide el modo del compositor y sus destinatarios. */
export interface AccionPrincipal {
  texto: string;
  hacer: () => Promise<void> | void;
  clave: Exclude<Enviando, null>;
}

export function PieCompositor({
  fallo,
  faltaAlgo,
  confirmarCierre,
  onSeguirEscribiendo,
  onCerrarYPerder,
  principal,
  ofreceBorrador,
  onGuardarBorrador,
  enviando,
  nota,
}: {
  /** Lo que contestó el servidor cuando dijo que no. */
  fallo: string | null;
  /** Hay campos sin rellenar y ya se han enseñado en rojo. */
  faltaAlgo: boolean;
  confirmarCierre: boolean;
  onSeguirEscribiendo: () => void;
  onCerrarYPerder: () => void;
  principal: AccionPrincipal;
  /** Publicar admite además dejarlo guardado sin publicar. */
  ofreceBorrador: boolean;
  onGuardarBorrador: () => void;
  enviando: Enviando;
  /** Qué le va a pasar al atleta con ESTE borrador. */
  nota: string;
}) {
  const ocupado = enviando !== null;

  return (
    <div className="flex shrink-0 flex-col gap-2.5 border-t border-[color:var(--v2-border)] p-4 sm:p-5">
      {fallo ? (
        <p className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-danger)] bg-[color:var(--v2-danger-soft)] px-3 py-2 text-label font-medium text-[color:var(--v2-danger)]">
          {fallo}
        </p>
      ) : null}
      {faltaAlgo ? (
        <p className="text-label font-medium text-[color:var(--v2-danger)]">
          Falta algo por rellenar. Los campos en rojo dicen qué.
        </p>
      ) : null}
      {confirmarCierre ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-warn)] bg-[color:var(--v2-warn-soft)] px-3 py-2">
          <span className="text-label font-medium text-[color:var(--v2-fg)]">
            Tienes cosas escritas. Si cierras ahora se pierden.
          </span>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onSeguirEscribiendo}
              className="v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-s)] px-2.5 text-label font-semibold text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
            >
              Seguir escribiendo
            </button>
            <button
              type="button"
              onClick={onCerrarYPerder}
              className="v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] px-2.5 text-label font-semibold text-[color:var(--v2-fg)]"
            >
              Cerrar y perderlo
            </button>
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => void principal.hacer()}
          disabled={ocupado}
          className={cn(
            'v2-focus inline-flex h-10 items-center gap-2 rounded-[var(--v2-r-s)] px-5 text-body font-bold transition-opacity',
            'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:opacity-90 disabled:opacity-50',
          )}
        >
          {enviando === principal.clave ? (
            <MIcon name="progress_activity" size={16} className="animate-spin" />
          ) : null}
          {principal.texto}
        </button>
        {ofreceBorrador ? (
          <button
            type="button"
            onClick={onGuardarBorrador}
            disabled={ocupado}
            className="v2-focus inline-flex h-10 items-center gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] px-4 text-body font-semibold text-[color:var(--v2-fg)] transition-colors hover:bg-[color:var(--v2-surface-2)] disabled:opacity-50"
          >
            {enviando === 'borrador' ? (
              <MIcon name="progress_activity" size={16} className="animate-spin" />
            ) : null}
            Guardar sin publicar
          </button>
        ) : null}
        <span className="min-w-[200px] flex-1 text-label leading-relaxed text-[color:var(--v2-muted)]">
          {nota}
        </span>
      </div>
    </div>
  );
}
