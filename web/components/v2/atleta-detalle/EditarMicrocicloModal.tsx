'use client';

// EDITAR NOMBRE Y DURACIÓN de un microciclo personal de la cadena. Alargar
// añade semanas vacías al final; acortar sólo puede quitar semanas sin
// sesiones ejecutadas — el stepper ya no deja bajar de ese suelo, y si las
// últimas semanas que se recortarían tienen algo PROGRAMADO (pendiente, no
// ejecutado), lo dice con el número real antes de que el coach confirme.
// Si la duración cambia, los microciclos siguientes de la cadena se recolocan
// (personal-plan-chain-mutations.ts) — se avisa también, sin cifra inventada.

import { useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';

const MAX_WEEKS = 20;

export function EditarMicrocicloModal({
  athleteId,
  monthTemplateId,
  currentName,
  currentWeekCount,
  minWeekCount,
  pendingByWeek,
  hasFollowingTramos,
  onClose,
  onSaved,
}: {
  athleteId: string;
  monthTemplateId: string;
  currentName: string;
  currentWeekCount: number;
  /** Suelo real de "acortar" — ya viene del servidor (`tramoSafety`). */
  minWeekCount: number;
  /** Pendientes por semana, índice 0 = primera semana del tramo. */
  pendingByWeek: number[];
  /** Hay algo detrás en la cadena que se recolocaría si la duración cambia. */
  hasFollowingTramos: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [weeks, setWeeks] = useState(currentWeekCount);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveMin = Math.max(1, minWeekCount);
  // Cuántas sesiones PENDIENTES (programadas, no ejecutadas) se perderían al
  // acortar a `weeks` — la suma de las semanas que quedarían fuera.
  const lostPending = useMemo(() => {
    if (weeks >= currentWeekCount) return 0;
    return pendingByWeek.slice(weeks).reduce((n, x) => n + x, 0);
  }, [weeks, currentWeekCount, pendingByWeek]);

  const nameChanged = name.trim() !== currentName;
  const weeksChanged = weeks !== currentWeekCount;
  const canSubmit =
    name.trim().length > 0 &&
    weeks >= effectiveMin &&
    weeks <= MAX_WEEKS &&
    (nameChanged || weeksChanged) &&
    !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (nameChanged) payload.name = name.trim();
      if (weeksChanged) payload.week_count = weeks;
      const res = await fetch(`/api/coach/athletes/${athleteId}/plan-chain/${monthTemplateId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? 'No se pudo guardar el microciclo.');
        setSubmitting(false);
        return;
      }
      router.refresh();
      onSaved();
    } catch {
      setError('Error de red al guardar. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Editar microciclo"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-[color:var(--v2-scrim)]"
      />
      <div className="relative flex w-full max-w-sm flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop)]">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">Editar microciclo</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="v2-focus inline-flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </div>
        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1">
            <span className="v2-micro">Nombre</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="h-9 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 text-sm text-[color:var(--v2-fg)] focus:outline-none focus:border-[color:var(--v2-accent)]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="v2-micro">Semanas</span>
            <input
              type="number"
              min={effectiveMin}
              max={MAX_WEEKS}
              value={weeks}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setWeeks(Math.min(MAX_WEEKS, Math.max(effectiveMin, Math.round(n))));
              }}
              className="v2-num h-9 w-24 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 text-sm text-[color:var(--v2-fg)] focus:outline-none focus:border-[color:var(--v2-accent)]"
            />
            {effectiveMin > 1 ? (
              <span className="text-eyebrow text-[color:var(--v2-faint)]">
                No puedes bajar de {effectiveMin} {effectiveMin === 1 ? 'semana' : 'semanas'}: las
                últimas ya tienen sesiones hechas.
              </span>
            ) : (
              <span className="text-eyebrow text-[color:var(--v2-faint)]">
                Alargar añade semanas vacías al final; acortar quita semanas del final.
              </span>
            )}
          </label>
          {lostPending > 0 ? (
            <div className="flex items-start gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-warn)] bg-[color:var(--v2-warn-soft)] p-2.5">
              <MIcon name="warning" size={16} className="mt-0.5 shrink-0 text-[color:var(--v2-warn)]" />
              <p className="text-xs text-[color:var(--v2-fg)]">
                Se borrarán <span className="v2-num font-semibold">{lostPending}</span>{' '}
                {lostPending === 1 ? 'sesión programada' : 'sesiones programadas'} en las semanas que
                se recortan.
              </p>
            </div>
          ) : null}
          {weeksChanged && hasFollowingTramos ? (
            <p className="text-xs text-[color:var(--v2-muted)]">
              Los microciclos siguientes de la cadena se recolocarán para no dejar hueco ni solape.
            </p>
          ) : null}
          {error ? <p className="text-xs font-medium text-[color:var(--v2-danger)]">{error}</p> : null}
          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] px-3 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <MIcon name="progress_activity" size={16} className="animate-spin" />
                  Guardando…
                </>
              ) : (
                'Guardar'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
