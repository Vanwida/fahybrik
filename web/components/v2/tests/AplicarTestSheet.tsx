// "Aplicar" — one test, many athletes, one day (#34).
//
// The mirror of the ficha's "Programar test": same endpoint, opposite starting point.
// Here the coach is thinking about the TEST ("¿a quién le toca el remo?"), so the
// screen is a roster, and the two shortcuts are what turn seven clicks into one.
//
// "Último" next to each name is the load-bearing detail: without it he has to open
// seven fichas to decide, and if he has to do that he simply won't.
//
// No 'use client': only rendered from TestsView, which is already the boundary.

import { useMemo, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';

const REPEAT_OPTIONS: { label: string; weeks: number }[] = [
  { label: 'No repetir', weeks: 0 },
  { label: 'En 6 semanas', weeks: 6 },
  { label: 'En 12 semanas', weeks: 12 },
];

export interface ApplyRosterEntry {
  athlete_id: string;
  full_name: string;
  lifecycle_status: string;
  last_done_by_test: Record<string, string>;
  pending_by_test: Record<string, string>;
}

function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** "hace 3 meses" / "nunca" — relative, because the exact date is not the decision. */
function lastDoneLabel(iso: string | undefined): string {
  if (!iso) return 'nunca';
  const then = new Date(`${iso}T00:00:00Z`).getTime();
  const days = Math.max(0, Math.round((Date.now() - then) / 86_400_000));
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 14) return `hace ${days} días`;
  if (days < 60) return `hace ${Math.round(days / 7)} semanas`;
  return `hace ${Math.round(days / 30)} meses`;
}

/** "hoy" / "mañana" / "28 jul" — the athlete already has this test waiting on that day. */
function scheduledLabel(iso: string): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (iso === today.toISOString().slice(0, 10)) return 'hoy';
  if (iso === tomorrow.toISOString().slice(0, 10)) return 'mañana';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function AplicarTestSheet({
  test,
  roster,
  onClose,
  onApplied,
}: {
  test: { id: string; name: string };
  roster: ApplyRosterEntry[];
  onClose: () => void;
  onApplied: (summary: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(defaultDate());
  const [repeat, setRepeat] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Never done" excludes anyone who already has it waiting in his plan: preselecting
  // him again would stack a second occurrence, which is the loop this shortcut feeds.
  const neverDone = useMemo(
    () =>
      roster
        .filter((a) => !a.last_done_by_test[test.id] && !a.pending_by_test[test.id])
        .map((a) => a.athlete_id),
    [roster, test.id],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/tests/${test.id}/apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          athlete_ids: [...selected],
          date,
          repeat_in_weeks: repeat > 0 ? repeat : null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? 'No pudimos programar el test.');
        return;
      }
      const applied = Array.isArray(body?.applied) ? body.applied : [];
      // Say out loud who ended up with a busy day: the coach decided to stack it, but
      // he should hear it from us and not from the athlete on the day.
      const clashing = applied.filter((a: { clashes: string[] }) => a.clashes.length > 0);
      onApplied(
        clashing.length > 0
          ? `${test.name} programado a ${applied.length}. Ojo: ${clashing
              .map((a: { full_name: string }) => a.full_name)
              .join(', ')} ya tenía algo ese día.`
          : `${test.name} programado a ${applied.length} ${applied.length === 1 ? 'atleta' : 'atletas'}.`,
      );
      onClose();
    } catch {
      setError('No pudimos programar el test.');
    } finally {
      setBusy(false);
    }
  }

  const chipOn =
    'v2-focus rounded-[var(--v2-r-pill)] border border-[color:var(--v2-accent)]/40 bg-[color:var(--v2-accent-soft)] px-3 py-2 text-body font-semibold text-[color:var(--v2-accent-text)]';
  const chipOff =
    'v2-focus rounded-[var(--v2-r-pill)] border border-transparent bg-[color:var(--v2-surface-2)] px-3 py-2 text-body text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--v2-scrim)] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Aplicar ${test.name}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[var(--v2-r-l)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] sm:rounded-[var(--v2-r-l)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[color:var(--v2-border)] px-5 py-4">
          <h2 className="text-base font-bold tracking-tight text-[color:var(--v2-fg)]">
            Aplicar · {test.name}
          </h2>
          <p className="mt-1 text-xs text-[color:var(--v2-muted)]">
            Entra en su plan como una sesión normal. Podrás moverla o quitarla después.
          </p>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
          <div>
            <p className="mb-2 text-eyebrow font-bold uppercase tracking-[0.11em] text-[color:var(--v2-faint)]">
              ¿A quién?
            </p>
            <div className="overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)]">
              {roster.length === 0 ? (
                <p className="px-3.5 py-4 text-body text-[color:var(--v2-muted)]">
                  Todavía no tienes atletas.
                </p>
              ) : (
                roster.map((a) => {
                  const on = selected.has(a.athlete_id);
                  return (
                    <button
                      key={a.athlete_id}
                      type="button"
                      onClick={() => toggle(a.athlete_id)}
                      className={`v2-focus flex w-full items-center gap-3 border-b border-[color:var(--v2-border)] px-3.5 py-2.5 text-left last:border-b-0 ${
                        on ? 'bg-[color:var(--v2-accent-soft)]' : ''
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[var(--v2-r-2xs)] border ${
                          on
                            ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                            : 'border-[color:var(--v2-border-strong)]'
                        }`}
                      >
                        {on ? <MIcon name="check" size={12} /> : null}
                      </span>
                      <span className="flex-1 truncate text-body text-[color:var(--v2-fg)]">
                        {a.full_name}
                      </span>
                      {a.pending_by_test[test.id] ? (
                        <span className="shrink-0 text-label font-semibold text-[color:var(--v2-accent-text)]">
                          programado · {scheduledLabel(a.pending_by_test[test.id]!)}
                        </span>
                      ) : (
                        <span className="shrink-0 text-label text-[color:var(--v2-faint)]">
                          {a.lifecycle_status === 'pausado'
                            ? 'en pausa'
                            : `último: ${lastDoneLabel(a.last_done_by_test[test.id])}`}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--v2-faint)]">
              <span>
                Seleccionados {selected.size} de {roster.length}
              </span>
              <span>·</span>
              <button
                type="button"
                onClick={() => setSelected(new Set(roster.map((a) => a.athlete_id)))}
                className="v2-focus font-semibold text-[color:var(--v2-accent-text)]"
              >
                todos
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => setSelected(new Set(neverDone))}
                className="v2-focus font-semibold text-[color:var(--v2-accent-text)]"
              >
                los que no lo han hecho nunca
              </button>
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-eyebrow font-bold uppercase tracking-[0.11em] text-[color:var(--v2-faint)]">
              ¿Qué día?
            </span>
            <input
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className="v2-focus rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3.5 py-3 text-reading font-semibold text-[color:var(--v2-fg)]"
            />
          </label>

          <div>
            <p className="mb-2 text-eyebrow font-bold uppercase tracking-[0.11em] text-[color:var(--v2-faint)]">
              Repetirlo
            </p>
            <div className="flex flex-wrap gap-2">
              {REPEAT_OPTIONS.map((o) => (
                <button
                  key={o.weeks}
                  type="button"
                  onClick={() => setRepeat(o.weeks)}
                  className={o.weeks === repeat ? chipOn : chipOff}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-xs font-medium text-[color:var(--v2-danger)]">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-[color:var(--v2-border)] bg-[color:var(--v2-bg)] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="v2-focus rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border-strong)] px-3.5 py-2 text-body font-semibold text-[color:var(--v2-fg)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || selected.size === 0}
            className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 py-2 text-body font-semibold text-[color:var(--v2-accent-fg)] disabled:opacity-40"
          >
            {busy ? (
              <MIcon name="progress_activity" size={15} className="animate-spin" />
            ) : (
              <MIcon name="event_available" size={15} />
            )}
            {selected.size > 0 ? `Ponérselo a ${selected.size}` : 'Ponérselo'}
          </button>
        </div>
      </div>
    </div>
  );
}
