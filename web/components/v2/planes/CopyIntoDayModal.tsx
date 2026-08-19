'use client';

// CopyIntoDayModal — «Copiar otro día aquí»: el DESTINO es fijo (el día vacío
// donde el coach pulsó) y aquí elige el ORIGEN — cualquier día con contenido de
// cualquier semana del microciclo. Es la dirección inversa de CopyDayModal (que
// parte del día abierto en el editor); reusa el MISMO endpoint de copia
// (PUT /api/coach/program-weeks/[sourceWeek]/day/copy): se cargan las sesiones
// persistidas del origen (GET program-weeks/[id]) y se envían en el wire del
// editor (semana-model.rawDayToWireSessions). Clon puro, sin progresión.

import { useMemo, useState } from 'react';
import { ModalPortal } from '@/components/v2/editor/ModalPortal';
import { MIcon } from '@/components/ui/MIcon';
import { MODALITY_META } from '@/components/v2/constants';
import { DAY_LABELS_FULL, type DayModalityInfo } from '@/lib/dashboard/v2/planes-model';
import type { MicroWeek } from '@/components/v2/planes/MicrocicloEditor';
import { rawDayToWireSessions } from '@/components/v2/planes/semana-model';
import type { WeekSlots } from '@fahybrid/shared/schema/program-templates';
import { cn } from '@/lib/utils';

// Estado honesto de un día candidato (mismas palabras que el resto del editor).
function dayStateLabel(day: DayModalityInfo): string {
  if (day.session_count > 0) {
    const bl = `${day.block_count} bl`;
    return day.item_count > 0 ? `${bl} · ${day.item_count} ej` : bl;
  }
  return day.is_rest ? 'Descanso' : 'Vacío';
}

export function CopyIntoDayModal({
  destWeekId,
  destWeekIndex,
  destDayOfWeek,
  weeks,
  onCopied,
  onClose,
}: {
  /** Semana del día destino (program_week_templates.id). */
  destWeekId: string;
  /** Posición 0-based de la semana destino (para el copy «en S2»). */
  destWeekIndex: number;
  /** Día destino 1..7 — el día vacío que recibe la copia. */
  destDayOfWeek: number;
  /** Todas las semanas del microciclo, con sus días resumidos (origen candidato). */
  weeks: MicroWeek[];
  /** Copia hecha — el padre refresca los datos y cierra. */
  onCopied: () => void;
  onClose: () => void;
}) {
  const [sourceWeekId, setSourceWeekId] = useState(destWeekId);
  const [sourceDow, setSourceDow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceWeek = useMemo(
    () => weeks.find((w) => w.id === sourceWeekId) ?? weeks[0] ?? null,
    [weeks, sourceWeekId],
  );
  const sameWeek = sourceWeek?.id === destWeekId;
  const destLabel = DAY_LABELS_FULL[destDayOfWeek - 1] ?? `Día ${destDayOfWeek}`;

  const pickWeek = (id: string) => {
    if (busy) return;
    setSourceWeekId(id);
    setSourceDow(null);
    setError(null);
  };

  const copy = async () => {
    if (!sourceWeek || sourceDow == null || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 1 · Las sesiones persistidas del día origen (fuente de verdad servidor).
      const weekRes = await fetch(`/api/coach/program-weeks/${sourceWeek.id}`, {
        credentials: 'include',
      });
      if (!weekRes.ok) throw new Error(`week fetch ${weekRes.status}`);
      const weekData = (await weekRes.json()) as { week: { slots_json: WeekSlots } };
      const sourceDay = weekData.week.slots_json.days.find(
        (d) => d.day_of_week === sourceDow,
      );
      if (!sourceDay || sourceDay.sessions.length === 0) {
        setError('Ese día ya no tiene contenido. Recarga la página.');
        return;
      }

      // 2 · La copia por el endpoint existente (origen → este destino).
      const res = await fetch(`/api/coach/program-weeks/${sourceWeek.id}/day/copy`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          from_day_of_week: sourceDow,
          ...(sourceWeek.id !== destWeekId ? { to_week_id: Number(destWeekId) } : {}),
          to_days: [destDayOfWeek],
          sessions: rawDayToWireSessions(sourceDay),
          overwrite: false,
        }),
      });
      if (res.status === 409) {
        // El destino se pintó vacío pero ya tiene contenido (vista desfasada).
        setError(`${destLabel} ya tiene contenido. Recarga para verlo.`);
        return;
      }
      if (!res.ok) throw new Error(`copy ${res.status}`);
      onCopied();
    } catch {
      setError('No se pudo copiar. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const days = sourceWeek?.days ?? [];

  return (
    <ModalPortal onEscape={onClose} escapeEnabled={!busy}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--v2-scrim)] p-4 backdrop-blur-sm"
        onClick={busy ? undefined : onClose}
      >
        <div
          role="dialog"
          aria-modal
          aria-label={`Copiar otro día en ${destLabel}`}
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-md flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
        >
          <header className="flex items-center justify-between border-b border-[color:var(--v2-border)] px-5 py-4">
            <div className="flex min-w-0 flex-col">
              <h2 className="v2-display text-xl">Copiar otro día aquí</h2>
              <p className="text-xs text-[color:var(--v2-muted)]">
                Elige el día que quieres copiar en {destLabel}
                {weeks.length > 1 ? ` (S${destWeekIndex + 1})` : ''} · copia idéntica
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="v2-focus flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="close" size={20} />
            </button>
          </header>

          {/* Semana ORIGEN (solo si el microciclo tiene más de una). */}
          {weeks.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-[color:var(--v2-border)] px-4 py-3">
              <span className="mr-1 text-label font-semibold uppercase tracking-wide text-[color:var(--v2-faint)]">
                Desde
              </span>
              {weeks.map((w, i) => {
                const active = w.id === sourceWeekId;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => pickWeek(w.id)}
                    aria-pressed={active}
                    className={cn(
                      'v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-pill)] border px-2.5 text-label font-semibold transition-colors',
                      active
                        ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                        : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
                    )}
                  >
                    S{i + 1}
                    {w.id === destWeekId ? ' · esta' : ''}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="flex max-h-[52vh] flex-col gap-1.5 overflow-y-auto p-4">
            {days.map((day, i) => {
              const dow = day.day_of_week;
              const fullLabel = DAY_LABELS_FULL[i] ?? `Día ${dow}`;
              const isDest = sameWeek && dow === destDayOfWeek;
              const hasContent = day.session_count > 0;
              const selected = sourceDow === dow;

              if (isDest) {
                return (
                  <div
                    key={dow}
                    className="flex items-center justify-between rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border)] px-3 py-2.5 opacity-60"
                  >
                    <span className="text-sm font-semibold text-[color:var(--v2-muted)]">
                      {fullLabel}
                    </span>
                    <span className="text-label font-medium text-[color:var(--v2-faint)]">
                      aquí
                    </span>
                  </div>
                );
              }

              return (
                <button
                  key={dow}
                  type="button"
                  onClick={() => {
                    setSourceDow(dow);
                    setError(null);
                  }}
                  disabled={busy || !hasContent}
                  aria-pressed={selected}
                  className={cn(
                    'v2-focus flex items-center justify-between gap-2 rounded-[var(--v2-r-s)] border px-3 py-2.5 text-left transition-colors disabled:opacity-50',
                    selected
                      ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)]'
                      : 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] hover:border-[color:var(--v2-border-strong)]',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <MIcon
                      name={selected ? 'radio_button_checked' : 'radio_button_unchecked'}
                      size={18}
                      className={
                        selected ? 'text-[color:var(--v2-accent)]' : 'text-[color:var(--v2-faint)]'
                      }
                    />
                    <span className="text-sm font-semibold text-[color:var(--v2-fg)]">
                      {fullLabel}
                    </span>
                    {hasContent ? (
                      <span className="flex flex-wrap gap-1">
                        {day.modalities.map((m) => (
                          <span
                            key={m}
                            className="rounded-[var(--v2-r-pill)] px-1.5 py-0.5 text-nano font-semibold leading-none"
                            style={{
                              background: `var(${MODALITY_META[m].softVar})`,
                              color: `var(${MODALITY_META[m].colorVar})`,
                            }}
                          >
                            {MODALITY_META[m].label}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <span className="v2-num shrink-0 text-label text-[color:var(--v2-faint)]">
                    {dayStateLabel(day)}
                  </span>
                </button>
              );
            })}
          </div>

          <footer className="flex flex-col gap-2 border-t border-[color:var(--v2-border)] px-4 py-3">
            {error ? (
              <p className="text-xs text-[color:var(--v2-danger)]">{error}</p>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <span className="text-label text-[color:var(--v2-muted)]">
                {sourceDow == null
                  ? 'Elige el día de origen'
                  : `${DAY_LABELS_FULL[sourceDow - 1]} → ${destLabel}`}
              </span>
              <button
                type="button"
                onClick={copy}
                disabled={busy || sourceDow == null}
                className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-4 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
              >
                <MIcon name={busy ? 'progress_activity' : 'content_copy'} size={16} />
                {busy ? 'Copiando…' : 'Copiar aquí'}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
