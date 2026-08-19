// "Programar test" — one athlete, one test, one day (#34).
//
// No 'use client' directive: this is only ever rendered from TestsPanel, which already
// is the client boundary. Marking it again would make it a second entry point and the
// compiler would then demand serializable props for an onClose callback that never
// crosses the wire.
//
// The whole point is speed: three fields, all pre-filled with the sane answer, and a
// button. The re-test is decided HERE and not on some other screen, because the moment
// a coach schedules a test is the exact moment he is thinking about when to repeat it —
// making him come back later means it never gets scheduled at all.
//
// The last-done line under the picker is the one piece of information that changes the
// decision: repeating a 5K three weeks after the last one is noise, and he should be
// able to see that without leaving the sheet.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { ModalPortal } from '@/components/v2/editor/ModalPortal';

const REPEAT_OPTIONS: { label: string; weeks: number }[] = [
  { label: 'No repetir', weeks: 0 },
  { label: 'En 6 semanas', weeks: 6 },
  { label: 'En 12 semanas', weeks: 12 },
];

/** Tomorrow, box-local, as the default day: today is usually already planned. */
function defaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const LONG_FMT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' });

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return LONG_FMT.format(new Date(Date.UTC(y, m - 1, d)));
}

export function ProgramarTestSheet({
  athleteId,
  athleteName,
  library,
  onClose,
}: {
  athleteId: string;
  athleteName: string;
  library: { id: string; name: string; last_done: string | null }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [testId, setTestId] = useState(library[0]?.id ?? '');
  const [date, setDate] = useState(defaultDate());
  const [repeat, setRepeat] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = library.find((t) => t.id === testId) ?? null;

  async function submit() {
    if (!testId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/tests/${testId}/apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          athlete_ids: [athleteId],
          date,
          repeat_in_weeks: repeat > 0 ? repeat : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? 'No pudimos programar el test.');
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError('No pudimos programar el test.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal onEscape={onClose} escapeEnabled={!busy}>
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--v2-scrim)] p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Programar test para ${athleteName}`}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-t-[var(--v2-r-l)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] sm:rounded-[var(--v2-r-l)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[color:var(--v2-border)] px-5 py-4">
          <h2 className="text-base font-bold tracking-tight text-[color:var(--v2-fg)]">
            Programar test · {athleteName}
          </h2>
          <p className="mt-1 text-xs text-[color:var(--v2-muted)]">
            De tu biblioteca. Entra en su plan como una sesión normal y podrás moverla o quitarla.
          </p>
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          <div>
            <p className="mb-2 text-eyebrow font-bold uppercase tracking-[0.11em] text-[color:var(--v2-faint)]">
              ¿Cuál?
            </p>
            <div className="flex flex-wrap gap-2">
              {library.map((t) => {
                const on = t.id === testId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTestId(t.id)}
                    className={
                      on
                        ? 'v2-focus rounded-[var(--v2-r-pill)] border border-[color:var(--v2-accent)]/40 bg-[color:var(--v2-accent-soft)] px-3 py-2 text-body font-semibold text-[color:var(--v2-accent)]'
                        : 'v2-focus rounded-[var(--v2-r-pill)] border border-transparent bg-[color:var(--v2-surface-2)] px-3 py-2 text-body text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]'
                    }
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
            {selected ? (
              <p className="mt-2 text-xs text-[color:var(--v2-faint)]">
                {selected.last_done
                  ? `Lo hizo por última vez el ${longDate(selected.last_done)}.`
                  : 'No lo ha hecho nunca.'}
              </p>
            ) : null}
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
              {REPEAT_OPTIONS.map((o) => {
                const on = o.weeks === repeat;
                return (
                  <button
                    key={o.weeks}
                    type="button"
                    onClick={() => setRepeat(o.weeks)}
                    className={
                      on
                        ? 'v2-focus rounded-[var(--v2-r-pill)] border border-[color:var(--v2-accent)]/40 bg-[color:var(--v2-accent-soft)] px-3 py-2 text-body font-semibold text-[color:var(--v2-accent)]'
                        : 'v2-focus rounded-[var(--v2-r-pill)] border border-transparent bg-[color:var(--v2-surface-2)] px-3 py-2 text-body text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]'
                    }
                  >
                    {o.label}
                  </button>
                );
              })}
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
            disabled={busy || !testId}
            className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 py-2 text-body font-semibold text-[color:var(--v2-accent-fg)] disabled:opacity-40"
          >
            {busy ? (
              <MIcon name="progress_activity" size={15} className="animate-spin" />
            ) : (
              <MIcon name="event_available" size={15} />
            )}
            Programar
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
