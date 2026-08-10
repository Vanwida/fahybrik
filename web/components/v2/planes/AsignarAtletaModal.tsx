'use client';

// ASIGNAR MICROCICLO A UN ATLETA — the library editor has no athlete in scope, so
// "delivering" a microciclo template means assigning it to a chosen athlete. This
// modal closes that loop with REAL backend calls:
//   1. GET  /api/coach/athletes                       → the coach's roster.
//   2. POST /api/coach/athletes/{id}/assign-draft     → materializes the microciclo
//      for that athlete and marks every week as DRAFT (hidden from the athlete).
// The coach then opens the athlete's plan and presses "Publicar microciclo" to
// deliver it (the draft → review → publish loop). assign-draft (not assign-month)
// is the correct counterpart to that publish action: nothing reaches the athlete
// until the coach deliberately publishes.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { upcomingMondayIso } from '@/lib/dashboard/v2/upcoming-monday';

interface RosterAthlete {
  athlete_id: string;
  full_name: string;
  level_name: string | null;
}

export function AsignarAtletaModal({
  monthTemplateId,
  monthName,
  onClose,
}: {
  monthTemplateId: string;
  monthName?: string;
  onClose: () => void;
}) {
  const router = useRouter();

  const [loadingRoster, setLoadingRoster] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [athletes, setAthletes] = useState<RosterAthlete[]>([]);

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>(upcomingMondayIso());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<RosterAthlete | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/coach/athletes', { credentials: 'include' });
        const body = (await res.json().catch(() => null)) as
          | { athletes?: RosterAthlete[]; error?: { message?: string } }
          | null;
        if (!alive) return;
        if (!res.ok || !body?.athletes) {
          setRosterError(body?.error?.message ?? 'No se pudo cargar la lista de atletas.');
          return;
        }
        setAthletes(body.athletes);
      } catch {
        if (alive) setRosterError('No se pudo cargar la lista de atletas.');
      } finally {
        if (alive) setLoadingRoster(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return athletes;
    return athletes.filter((a) => a.full_name.toLowerCase().includes(q));
  }, [athletes, query]);

  const canSubmit = selectedId != null && startDate.length === 10 && !submitting;

  async function handleAssign() {
    if (!canSubmit || !selectedId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${selectedId}/assign-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ month_template_id: monthTemplateId, start_date: startDate }),
      });
      const body = (await res.json().catch(() => null)) as
        | { assign_draft?: { assignment_count?: number }; error?: { message?: string } }
        | null;
      if (!res.ok || !body?.assign_draft) {
        setError(body?.error?.message ?? 'No se pudo asignar el microciclo.');
        return;
      }
      setAssignedTo(athletes.find((a) => a.athlete_id === selectedId) ?? null);
    } catch {
      setError('No se pudo asignar el microciclo. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  function goToPlan() {
    if (!assignedTo) return;
    router.push(`/atletas/${assignedTo.athlete_id}?tab=plan`);
    onClose();
  }

  const inputCls = cn(
    'v2-focus h-10 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 text-sm',
    'text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)]',
    'focus:border-[color:var(--v2-border-strong)]',
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Asignar microciclo a un atleta"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-[color:var(--v2-scrim)]"
      />

      <div className="relative flex max-h-[88vh] w-full max-w-md flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-5 shadow-[var(--v2-shadow-pop)]">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">
            {assignedTo ? 'Microciclo asignado' : 'Asignar a un atleta'}
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="v2-focus inline-flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </div>
        <p className="mb-4 text-xs text-[color:var(--v2-muted)]">
          {monthName ? <>Microciclo «{monthName}»</> : 'Microciclo de tu biblioteca'}
        </p>

        {assignedTo ? (
          <div className="flex flex-col gap-3.5">
            <div className="flex items-start gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
              <MIcon name="check_circle" size={18} filled className="mt-0.5 shrink-0 text-[color:var(--v2-ok)]" />
              <p className="text-sm text-[color:var(--v2-muted)]">
                Asignado a{' '}
                <span className="font-semibold text-[color:var(--v2-fg)]">{assignedTo.full_name}</span>{' '}
                en <span className="font-semibold text-[color:var(--v2-fg)]">borrador</span>. Aún no lo
                ve. Ábrelo en su plan y pulsa «Publicar microciclo» para entregarlo.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] px-3 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={goToPlan}
                className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
              >
                <MIcon name="arrow_forward" size={16} />
                Abrir plan y publicar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-col gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="v2-micro">Atleta</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre…"
                className={inputCls}
                autoFocus
              />
            </label>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)]">
              {loadingRoster ? (
                <p className="px-3 py-6 text-center text-xs text-[color:var(--v2-muted)]">
                  Cargando atletas…
                </p>
              ) : rosterError ? (
                <p className="px-3 py-6 text-center text-xs text-[color:var(--v2-danger)]">
                  {rosterError}
                </p>
              ) : filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-[color:var(--v2-muted)]">
                  {athletes.length === 0 ? 'No tienes atletas todavía.' : 'Sin resultados.'}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {filtered.map((a) => {
                    const active = a.athlete_id === selectedId;
                    return (
                      <li key={a.athlete_id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(a.athlete_id)}
                          aria-pressed={active}
                          className={cn(
                            'v2-focus flex w-full items-center justify-between gap-2 border-b border-[color:var(--v2-border)] px-3 py-2.5 text-left transition-colors last:border-0',
                            active
                              ? 'bg-[color:var(--v2-accent-soft)]'
                              : 'hover:bg-[color:var(--v2-surface-2)]',
                          )}
                        >
                          <span className="truncate text-sm font-medium text-[color:var(--v2-fg)]">
                            {a.full_name}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {a.level_name ? (
                              <span className="v2-num text-eyebrow font-semibold text-[color:var(--v2-muted)]">
                                {a.level_name}
                              </span>
                            ) : null}
                            {active ? (
                              <MIcon name="check" size={16} className="text-[color:var(--v2-accent)]" />
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="v2-micro">Fecha de inicio (lunes)</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={cn(inputCls, 'v2-num')}
              />
            </label>

            {error ? (
              <p className="text-xs font-medium text-[color:var(--v2-danger)]">{error}</p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] px-3 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAssign}
                disabled={!canSubmit}
                className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <MIcon name="progress_activity" size={16} className="animate-spin" />
                    Asignando…
                  </>
                ) : (
                  <>
                    <MIcon name="assignment_ind" size={16} />
                    Asignar en borrador
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
