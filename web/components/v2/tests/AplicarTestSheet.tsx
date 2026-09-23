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

import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Dialog, Field, Input, SegmentedControl } from '@/components/v2/ui';
import { effectiveTestRetestWeeks, testRetestOptions } from '@fahybrid/shared/domain/coach/test-cadence';

// Cada cuánto se repite un test es método del coach (`coaches.test_retest_weeks`,
// Ajustes › Método): se leen sus semanas al abrir; mientras llegan, el defecto.
function useRetestOptions() {
  const [weeks, setWeeks] = useState<number[] | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/coach/settings', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { test_retest_weeks?: { effective?: number[] } } | null) => {
        if (b?.test_retest_weeks?.effective) setWeeks(b.test_retest_weeks.effective);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);
  return testRetestOptions(effectiveTestRetestWeeks(weeks));
}

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
  const REPEAT_OPTIONS = useRetestOptions();
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

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`Aplicar «${test.name}»`}
      description="Entra en su plan como una sesión más. Puedes moverla o quitarla después."
      footer={
        <>
          {error ? (
            <p role="alert" className="mr-auto t-body-sm text-v2-danger">
              {error}
            </p>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} disabled={selected.size === 0} onClick={() => void submit()}>
            {selected.size > 0 ? `Ponérselo a ${selected.size}` : 'Ponérselo'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="t-meta text-v2-muted">
              A quién · {selected.size} de {roster.length}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(roster.map((a) => a.athlete_id)))}>
              Todos
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(neverDone))}>
              Los que no lo han hecho nunca
            </Button>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-ctl border border-v2-border">
            {roster.length === 0 ? (
              <p className="px-3 py-3 t-body-sm text-v2-muted">Todavía no tienes atletas.</p>
            ) : (
              roster.map((a) => (
                <div key={a.athlete_id} className="flex min-h-10 items-center gap-3 border-b border-v2-border px-3 last:border-b-0">
                  <Checkbox
                    checked={selected.has(a.athlete_id)}
                    onCheckedChange={() => toggle(a.athlete_id)}
                    label={a.full_name}
                    className="min-w-0 flex-1"
                  />
                  <span className="shrink-0 t-meta text-v2-faint">
                    {a.pending_by_test[test.id]
                      ? `programado · ${scheduledLabel(a.pending_by_test[test.id]!)}`
                      : a.lifecycle_status === 'pausado'
                        ? 'en pausa'
                        : `último: ${lastDoneLabel(a.last_done_by_test[test.id])}`}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <Field label="Qué día">
          {({ id }) => (
            <Input id={id} type="date" size="lg" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} className="w-48" />
          )}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="t-meta text-v2-muted">Repetirlo</span>
          <SegmentedControl
            aria-label="Repetirlo"
            value={String(repeat)}
            onValueChange={(v) => setRepeat(Number(v))}
            items={REPEAT_OPTIONS.map((o) => ({ value: String(o.weeks), label: o.label }))}
            className="self-start"
          />
        </div>
      </div>
    </Dialog>
  );
}
