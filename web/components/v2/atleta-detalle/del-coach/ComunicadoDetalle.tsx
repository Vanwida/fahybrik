'use client';

// EL DETALLE de un comunicado ya publicado a ESTE atleta.
//
// La lista dice el estado de un vistazo; esto dice el DETALLE FINO, que es lo
// que hoy no existe en ninguna parte: por qué paso se quedó, qué contestó y
// desde cuándo. Es lectura: lo publicado no se edita (cambiarle el suelo a quien
// ya marcó tres pasos es corromper su historial), así que la única acción es
// retirarlo — y retirarlo lo saca de su bandeja SIN borrar lo que hizo.

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { ModalPortal } from '@/components/v2/editor/ModalPortal';
import { Pill } from '@/components/v2/Pill';
import { formatRelative } from '@/lib/dashboard/relative-time';
import {
  KIND_LABEL,
  checkableItems,
  type CoachAthleteCommunicationDTO,
} from '@fahybrid/shared/domain/coach-communications';
import { ANCHOR_COACH_LABEL, opcionElegida, seguimiento, venceEn } from '@/lib/dashboard/v2/del-coach';
import { borrarOArchivar } from './api';
import { LineaSeguimiento } from './lista';

export function ComunicadoDetalle({
  c,
  athleteName,
  onCerrar,
  onRetirado,
}: {
  c: CoachAthleteCommunicationDTO;
  athleteName: string;
  onCerrar: () => void;
  onRetirado: (mensaje: string) => void;
}) {
  const [confirmar, setConfirmar] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  const marcados = new Set(c.athlete_state.marked_item_ids);
  const elegida = opcionElegida(c);
  const archivado = c.status === 'archived';
  // Un protocolo de sólo lectura no se «cierra»: leerlo era el acto, y pedir un
  // sello de cierre que nunca va a llegar deja la ficha con un hueco eterno.
  const seMarca = checkableItems(c.items).length > 0;

  const retirar = async () => {
    setRetirando(true);
    setFallo(null);
    const r = await borrarOArchivar(c.id);
    setRetirando(false);
    if (!r.ok) {
      setFallo(r.mensaje);
      return;
    }
    onRetirado('Retirado. Deja de aparecerle, y lo que hizo se conserva aquí.');
  };

  return (
    <ModalPortal onEscape={onCerrar} escapeEnabled={!retirando}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 pb-[calc(var(--v2-tabbar-h)+0.75rem)] sm:p-6 sm:pb-[calc(var(--v2-tabbar-h)+1.5rem)] lg:pb-6">
      <button
        type="button"
        aria-label="Cerrar el detalle"
        onClick={onCerrar}
        className="absolute inset-0 bg-[color:var(--v2-scrim)]"
      />

      <div
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="detalle-comunicado-titulo"
        // `max-h-full`: el hueco que deja el envoltorio, ya sin la barra de
        // pestañas de la app por abajo.
        className="v2-focus relative flex max-h-full w-full max-w-[640px] flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--v2-border)] p-4 sm:p-5">
          <div className="flex min-w-0 flex-col gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <Pill tone={c.kind === 'note' ? 'neutral' : c.kind === 'focus' ? 'info' : 'accent'} variant="soft">
                {KIND_LABEL[c.kind]}
              </Pill>
              <span className="text-label text-[color:var(--v2-muted)]">
                {ANCHOR_COACH_LABEL[c.anchor_kind]}
                {c.published_at ? ` · publicado ${formatRelative(c.published_at)}` : ''}
              </span>
              {archivado ? (
                <Pill tone="neutral" variant="outline">
                  Retirado
                </Pill>
              ) : null}
            </span>
            <h2 id="detalle-comunicado-titulo" className="text-balance text-base font-bold text-[color:var(--v2-fg)]">
              {c.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
            className="v2-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </div>

        {/* `min-h-0`: sin él el cuerpo no encoge y el pie de «Retirar» se sale. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5">
          {/* ── Lo que hizo con ello ─────────────────────────────────────── */}
          <section className="flex flex-col gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3.5">
            <h3 className="v2-micro">Seguimiento</h3>
            <LineaSeguimiento seguimiento={seguimiento(c)} />
            <ul className="flex flex-col gap-1 pt-1">
              <Sello etiqueta="Lo abrió" iso={c.athlete_state.seen_at} vacio="Todavía no lo ha abierto." />
              {c.kind === 'question' ? (
                <Sello
                  etiqueta={elegida ? `Respondió «${elegida.content}»` : 'Respondió'}
                  iso={c.athlete_state.answered_at}
                  vacio="Sin responder."
                />
              ) : c.kind === 'task' || (c.kind === 'protocol' && seMarca) ? (
                <Sello etiqueta="Lo cerró" iso={c.athlete_state.done_at} vacio="Sin cerrar." />
              ) : null}
              {c.kind === 'task' && c.due_date ? (
                <li className="text-label text-[color:var(--v2-muted)]">{venceEn(c.due_date)}</li>
              ) : null}
            </ul>
          </section>

          {/* ── Lo que le mandaste ───────────────────────────────────────── */}
          {c.body ? (
            <p className="whitespace-pre-line text-body leading-relaxed text-[color:var(--v2-fg)]">
              {c.body}
            </p>
          ) : null}

          {c.kind === 'question' && c.blocks ? (
            <p className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-warn)] bg-[color:var(--v2-warn-soft)] px-3 py-2 text-label font-medium text-[color:var(--v2-fg)]">
              Bloquea su plan: hasta que no conteste, se queda sin cerrar.
            </p>
          ) : null}

          {c.kind === 'protocol' && c.items.length > 0 ? (
            <ul className="flex flex-col divide-y divide-[color:var(--v2-border)] overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)]">
              {c.items.map((item) => {
                const hecho = marcados.has(item.id);
                return (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                    {/* Un paso de lectura no lleva círculo (ni apagado): no está
                        pendiente, no se marca. El hueco mantiene la columna
                        alineada cuando el protocolo mezcla los dos. */}
                    {item.checkable ? (
                      <MIcon
                        name={hecho ? 'check_circle' : 'radio_button_unchecked'}
                        size={17}
                        className={
                          hecho ? 'text-[color:var(--v2-ok)]' : 'text-[color:var(--v2-faint)]'
                        }
                      />
                    ) : (
                      <span aria-hidden className="w-[17px] shrink-0" />
                    )}
                    {item.label ? (
                      <span className="v2-num w-12 shrink-0 text-right text-label font-bold text-[color:var(--v2-muted)]">
                        {item.label}
                      </span>
                    ) : null}
                    <span
                      className={
                        hecho
                          ? 'min-w-0 flex-1 text-body text-[color:var(--v2-muted)]'
                          : 'min-w-0 flex-1 text-body text-[color:var(--v2-fg)]'
                      }
                    >
                      {item.content}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {c.kind === 'question' && c.items.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {c.items.map((item) => {
                const esta = elegida?.id === item.id;
                return (
                  <li
                    key={item.id}
                    className={
                      esta
                        ? 'rounded-[var(--v2-r-m)] border border-[color:var(--v2-ok)] bg-[color:var(--v2-ok-soft)] p-3'
                        : 'rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] p-3 opacity-70'
                    }
                  >
                    <span className="flex items-center gap-2">
                      <MIcon
                        name={esta ? 'check_circle' : 'radio_button_unchecked'}
                        size={16}
                        className={esta ? 'text-[color:var(--v2-ok)]' : 'text-[color:var(--v2-faint)]'}
                      />
                      <span className="text-body font-semibold text-[color:var(--v2-fg)]">
                        {item.content}
                      </span>
                    </span>
                    {item.consequence ? (
                      <span className="mt-1 block pl-6 text-label leading-relaxed text-[color:var(--v2-muted)]">
                        {item.consequence}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {c.kind === 'note' && c.items.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {c.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-1.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] p-3"
                >
                  {item.label ? <span className="v2-micro">{item.label}</span> : null}
                  <span className="whitespace-pre-line text-body leading-relaxed text-[color:var(--v2-fg)]">
                    {item.content}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {c.final_note ? (
            <div className="flex flex-col gap-1.5 rounded-[var(--v2-r-m)] border-l-2 border-[color:var(--v2-accent)] bg-[color:var(--v2-surface-2)] p-3">
              <span className="v2-micro">Tu nota final</span>
              <span className="text-body leading-relaxed text-[color:var(--v2-muted)]">
                {c.final_note}
              </span>
            </div>
          ) : null}
        </div>

        {/* ── Retirar ──────────────────────────────────────────────────── */}
        {!archivado ? (
          <div className="flex shrink-0 flex-col gap-2 border-t border-[color:var(--v2-border)] p-4 sm:p-5">
            {fallo ? (
              <p className="text-label font-medium text-[color:var(--v2-danger)]">{fallo}</p>
            ) : null}
            {confirmar ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-label text-[color:var(--v2-muted)]">
                  Deja de aparecerle a {athleteName}. Lo que ya hizo se conserva aquí.
                </span>
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmar(false)}
                    disabled={retirando}
                    className="v2-focus inline-flex h-8 items-center rounded-[var(--v2-r-s)] px-2.5 text-label font-semibold text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void retirar()}
                    disabled={retirando}
                    className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-danger)] px-3 text-label font-bold text-[color:var(--v2-bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {retirando ? (
                      <MIcon name="progress_activity" size={14} className="animate-spin" />
                    ) : null}
                    Retirar
                  </button>
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmar(true)}
                className="v2-focus inline-flex h-8 w-fit items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-danger)] hover:text-[color:var(--v2-danger)]"
              >
                <MIcon name="archive" size={15} />
                Retirar de su bandeja
              </button>
            )}
          </div>
        ) : null}
      </div>
      </div>
    </ModalPortal>
  );
}

/** Un sello de tiempo del atleta, o la ausencia dicha en voz alta. */
function Sello({ etiqueta, iso, vacio }: { etiqueta: string; iso: string | null; vacio: string }) {
  return (
    <li className="text-label text-[color:var(--v2-muted)]">
      {iso ? (
        <>
          {etiqueta} <span className="text-[color:var(--v2-fg)]">{formatRelative(iso)}</span>
        </>
      ) : (
        vacio
      )}
    </li>
  );
}
