'use client';

// BorrarEjercicioDialog — el "lo creé sin querer" de un ejercicio PROPIO.
//
// SÓLO SE PREGUNTA LO QUE PUEDE PASAR. El botón que abre esto sólo existe en las
// filas propias (EjercicioRow), así que aquí no hay caso "de la base": ese 409 no se
// gana ofreciendo una acción y negándola después.
//
// LAS DOS RESPUESTAS DEL SERVIDOR NO SE PARECEN EN NADA, y por eso hay dos estados:
//   • BORRADO — no estaba usado en ningún sitio. Era un typo, no historia.
//   • NEGADO (409 `in_use`) — está en sesiones, en bloques o ya lo han entrenado. El
//     servidor no dice "no": dice DÓNDE ("Lo estás usando en 3 sesiones y 1 bloque…").
//     Eso es lo único accionable que hay, así que se enseña VERBATIM y el diálogo se
//     queda en un estado sin "Borrar": reintentar daría exactamente lo mismo hasta
//     que el coach lo quite de donde está. Ver lib/dashboard/exercises/delete-exercise.ts.
//
// No hay un diálogo de confirmación genérico en el repo (los de planes y periodización
// son locales y llevan su dominio escrito dentro), así que éste se monta sobre la
// pieza que SÍ es común — ModalPortal: Escape, trampa de foco, bloqueo de scroll y
// portal al `.v2-root` del tema correcto.

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { ModalPortal } from '@/components/v2/editor/ModalPortal';
import type { CoachExerciseRow } from '@/lib/exercises/coach-override';

export function BorrarEjercicioDialog({
  ex,
  onClose,
  onDeleted,
}: {
  ex: CoachExerciseRow;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  // El "no" razonado del servidor (409 / 404). Mientras esté puesto no hay botón de
  // borrar: no es un fallo que reintentar, es una respuesta.
  const [refusal, setRefusal] = useState<string | null>(null);
  // Lo que sí se reintenta: red caída o un 500. Aquí NO se enseña el mensaje del
  // servidor — un `internal_error` trae el error crudo dentro y eso no es para el coach.
  const [retryable, setRetryable] = useState(false);

  const remove = async () => {
    setBusy(true);
    setRetryable(false);
    try {
      const res = await fetch(`/api/exercises/${ex.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        onDeleted(ex.id);
        return;
      }

      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      const message = body?.error?.message;
      // 409 / 404 son respuestas PENSADAS y ya redactadas para el coach (nombran
      // dónde se usa, o que ya no existe): se enseñan tal cual. Cualquier otra cosa
      // es un fallo nuestro y se dice en corto.
      if ((res.status === 409 || res.status === 404) && message) setRefusal(message);
      else setRetryable(true);
      setBusy(false);
    } catch {
      setRetryable(true);
      setBusy(false);
    }
  };

  const denied = refusal !== null;

  return (
    <ModalPortal onEscape={onClose} escapeEnabled={!busy}>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-[color:var(--v2-scrim)] p-4 backdrop-blur-sm"
        onClick={busy ? undefined : onClose}
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={denied ? `No se puede borrar ${ex.name}` : `Borrar ${ex.name}`}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className="v2-focus w-full max-w-[440px] rounded-[var(--v2-r-l)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-elevated)] p-5 shadow-[var(--v2-shadow-pop)]"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className={
                denied
                  ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--v2-r-m)] bg-[color:var(--v2-info-soft)] text-[color:var(--v2-info)]'
                  : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--v2-r-m)] bg-[color:var(--v2-danger-soft)] text-[color:var(--v2-danger)]'
              }
            >
              <MIcon name={denied ? 'info' : 'delete'} size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="v2-display text-xl">
                {denied ? 'Este no se puede borrar' : 'Borrar ejercicio'}
              </h2>
              {denied ? (
                // VERBATIM. El servidor cuenta las sesiones y los bloques de verdad y
                // los nombra; cambiarlo por un "está en uso" sería borrar la única
                // parte útil del mensaje.
                <p className="mt-1 text-sm leading-relaxed text-[color:var(--v2-fg)]">{refusal}</p>
              ) : (
                <>
                  <p className="mt-1 text-sm leading-relaxed text-[color:var(--v2-muted)]">
                    Vas a borrar «<b className="text-[color:var(--v2-fg)]">{ex.name}</b>» de tu
                    catálogo. No se puede deshacer.
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--v2-faint)]">
                    Si lo tienes puesto en alguna sesión o bloque, te lo diremos y no se borrará.
                  </p>
                </>
              )}
            </div>
          </div>

          {retryable ? (
            <p role="alert" className="mt-3 text-body font-semibold text-[color:var(--v2-danger)]">
              No se pudo borrar. Reinténtalo.
            </p>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            {denied ? (
              <button
                type="button"
                onClick={onClose}
                className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
              >
                Entendido
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3.5 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] disabled:opacity-60"
                >
                  Cancelar
                </button>
                {/* El rojo va en el TEXTO y el borde, no de relleno: no hay token de
                    tinta sobre --v2-danger, y blanco sobre ese rojo da 3.5:1 en el
                    tema oscuro (AA pide 4.5:1). Es además el mismo trato que ya usa
                    el `danger` de PanelButton, así que un botón destructivo se ve
                    igual en toda la app. */}
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-danger)] px-3.5 text-sm font-bold text-[color:var(--v2-danger)] transition-colors hover:bg-[color:var(--v2-danger-soft)] disabled:opacity-60"
                >
                  <MIcon name={busy ? 'progress_activity' : 'delete'} size={16} />
                  {busy ? 'Borrando…' : 'Borrar'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
