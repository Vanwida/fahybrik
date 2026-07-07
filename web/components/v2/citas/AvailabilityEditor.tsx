'use client';

// AvailabilityEditor — the coach's weekly call windows + blocked dates. Two sections:
//   · Semanal — per weekday (Monday-first UI; DB weekday is 0=Sun … 6=Sat) a list of
//     time ranges. "Guardar" PUTs the FULL windows array (server does a full replace).
//   · Fechas bloqueadas — upcoming exceptions; add a date / remove one.
// Weekly windows live in local editable state (many inputs); exceptions render straight
// off the server props and re-sync via router.refresh after each mutation. Honest empty
// state when no windows are defined (leads then see the "Pablo te escribirá" fallback).

import { useState, useTransition } from 'react';
import { Link } from '@/i18n/navigation';
import { useRouter } from 'next/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Card } from '@/components/v2/Card';
import { EmptyState } from '@/components/v2/EmptyState';
import { CitaActionButton } from '@/components/v2/citas/CitaActionButton';
import { formatCitaDate } from '@/components/v2/citas/format';
import type { AvailabilityRow, ExceptionRow } from '@/lib/citas/store';
import { cn } from '@/lib/utils';

interface Range {
  start: string;
  end: string;
}

// Monday-first render order; `weekday` is the DB value (0=Sun … 6=Sat).
const WEEKDAYS: ReadonlyArray<{ weekday: number; label: string }> = [
  { weekday: 1, label: 'Lunes' },
  { weekday: 2, label: 'Martes' },
  { weekday: 3, label: 'Miércoles' },
  { weekday: 4, label: 'Jueves' },
  { weekday: 5, label: 'Viernes' },
  { weekday: 6, label: 'Sábado' },
  { weekday: 0, label: 'Domingo' },
];

const DEFAULT_RANGE: Range = { start: '09:00', end: '10:00' };

const INPUT_CLS =
  'v2-focus h-9 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2.5 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]';

function groupWindows(windows: AvailabilityRow[]): Record<number, Range[]> {
  const map: Record<number, Range[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const w of windows) map[w.weekday].push({ start: w.start_time, end: w.end_time });
  for (let d = 0; d <= 6; d += 1) map[d].sort((a, b) => a.start.localeCompare(b.start));
  return map;
}

function isRangeValid(r: Range): boolean {
  return Boolean(r.start) && Boolean(r.end) && r.end > r.start;
}

// Today in Madrid (YYYY-MM-DD) — the floor for blocking a date.
const TODAY_MADRID = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const parsed = (await res.json()) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    /* keep fallback */
  }
  return fallback;
}

export function AvailabilityEditor({
  initialWindows,
  initialExceptions,
}: {
  initialWindows: AvailabilityRow[];
  initialExceptions: ExceptionRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // ── Weekly windows (editable local state) ────────────────────────────────────
  const [days, setDays] = useState<Record<number, Range[]>>(() => groupWindows(initialWindows));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasAnyWindow = WEEKDAYS.some((d) => days[d.weekday].length > 0);

  function mutateDay(weekday: number, next: Range[]) {
    setDays((prev) => ({ ...prev, [weekday]: next }));
    setDirty(true);
    setSaved(false);
  }

  function addRange(weekday: number) {
    mutateDay(weekday, [...days[weekday], { ...DEFAULT_RANGE }]);
  }
  function removeRange(weekday: number, idx: number) {
    mutateDay(weekday, days[weekday].filter((_, i) => i !== idx));
  }
  function updateRange(weekday: number, idx: number, field: keyof Range, value: string) {
    mutateDay(
      weekday,
      days[weekday].map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    );
  }

  async function saveWindows() {
    if (saving) return;
    const windows: { weekday: number; start_time: string; end_time: string }[] = [];
    for (const { weekday } of WEEKDAYS) {
      for (const r of days[weekday]) windows.push({ weekday, start_time: r.start, end_time: r.end });
    }
    if (windows.some((w) => !isRangeValid({ start: w.start_time, end: w.end_time }))) {
      setSaveError('Revisa las franjas: la hora de fin debe ser mayor que la de inicio.');
      return;
    }
    setSaveError(null);
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/coach/availability', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ windows }),
      });
      if (!res.ok) {
        setSaveError(await readError(res, 'No se pudo guardar la disponibilidad. Reintenta.'));
        setSaving(false);
        return;
      }
      setSaving(false);
      setDirty(false);
      setSaved(true);
      startTransition(() => router.refresh());
    } catch {
      setSaveError('Error de red. Reintenta.');
      setSaving(false);
    }
  }

  // ── Blocked dates (render off props; mutate → refresh) ────────────────────────
  const [newDate, setNewDate] = useState('');
  const [newMotivo, setNewMotivo] = useState('');
  const [exBusy, setExBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [exError, setExError] = useState<string | null>(null);

  async function addException() {
    if (exBusy || !newDate) return;
    setExError(null);
    setExBusy(true);
    try {
      const res = await fetch('/api/coach/availability/exceptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fecha: newDate, ...(newMotivo.trim() ? { motivo: newMotivo.trim() } : {}) }),
      });
      if (!res.ok) {
        setExError(await readError(res, 'No se pudo bloquear la fecha. Reintenta.'));
        setExBusy(false);
        return;
      }
      setNewDate('');
      setNewMotivo('');
      setExBusy(false);
      startTransition(() => router.refresh());
    } catch {
      setExError('Error de red. Reintenta.');
      setExBusy(false);
    }
  }

  async function removeException(id: string) {
    if (exBusy) return;
    setExError(null);
    setExBusy(true);
    setRemovingId(id);
    try {
      const res = await fetch(`/api/coach/availability/exceptions/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setExError(await readError(res, 'No se pudo quitar la fecha. Reintenta.'));
        setExBusy(false);
        setRemovingId(null);
        return;
      }
      setExBusy(false);
      setRemovingId(null);
      startTransition(() => router.refresh());
    } catch {
      setExError('Error de red. Reintenta.');
      setExBusy(false);
      setRemovingId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6">
      {/* Back link */}
      <Link
        href="/leads"
        className="v2-focus inline-flex w-fit items-center gap-1.5 rounded-[var(--v2-r-s)] text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
      >
        <MIcon name="arrow_back" size={16} />
        Leads
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <h1 className="v2-display text-3xl sm:text-4xl text-[color:var(--v2-fg)]">Disponibilidad</h1>
        <p className="text-xs text-[color:var(--v2-muted)]">
          Las franjas semanales definen los huecos que el lead puede reservar para la videollamada
          (Europe/Madrid).
        </p>
      </div>

      {/* ── Semanal ───────────────────────────────────────────────────────────── */}
      <Card className="flex flex-col gap-4 p-4 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="v2-micro">Franjas semanales</h2>
          <div className="flex items-center gap-2">
            {saved && !dirty ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--v2-ok)]">
                <MIcon name="check_circle" size={15} filled />
                Guardado
              </span>
            ) : null}
            <CitaActionButton
              label="Guardar"
              icon="save"
              tone="accent"
              spinning={saving}
              disabled={saving || !dirty}
              onClick={saveWindows}
            />
          </div>
        </div>

        {!hasAnyWindow ? (
          <div
            className="flex items-start gap-2.5 rounded-[var(--v2-r-m)] border px-3.5 py-2.5"
            style={{ borderColor: 'var(--v2-warn)', background: 'var(--v2-warn-soft)' }}
          >
            <MIcon name="info" size={18} className="mt-0.5 text-[color:var(--v2-warn)]" />
            <p className="text-sm text-[color:var(--v2-fg)]">
              Aún no has definido tu disponibilidad — los leads verán{' '}
              <span className="font-semibold">“Pablo te escribirá para cuadrar la llamada”</span>.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col divide-y divide-[color:var(--v2-border)]">
          {WEEKDAYS.map(({ weekday, label }) => {
            const ranges = days[weekday];
            return (
              <div
                key={weekday}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4"
              >
                <span className="w-24 shrink-0 pt-2 text-sm font-semibold text-[color:var(--v2-fg)]">
                  {label}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {ranges.length === 0 ? (
                    <span className="pt-1.5 text-xs text-[color:var(--v2-faint)]">Sin franjas</span>
                  ) : (
                    ranges.map((r, idx) => {
                      const invalid = !isRangeValid(r);
                      return (
                        <div key={idx} className="flex flex-wrap items-center gap-2">
                          <input
                            type="time"
                            value={r.start}
                            aria-label={`${label} — inicio`}
                            onChange={(e) => updateRange(weekday, idx, 'start', e.target.value)}
                            className={cn(INPUT_CLS, 'v2-num w-[7.5rem]', invalid && 'border-[color:var(--v2-danger)]')}
                          />
                          <span className="text-[color:var(--v2-faint)]">–</span>
                          <input
                            type="time"
                            value={r.end}
                            aria-label={`${label} — fin`}
                            onChange={(e) => updateRange(weekday, idx, 'end', e.target.value)}
                            className={cn(INPUT_CLS, 'v2-num w-[7.5rem]', invalid && 'border-[color:var(--v2-danger)]')}
                          />
                          <button
                            type="button"
                            onClick={() => removeRange(weekday, idx)}
                            aria-label={`Quitar franja de ${label}`}
                            className="v2-focus inline-flex h-9 w-9 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-danger-soft)] hover:text-[color:var(--v2-danger)]"
                          >
                            <MIcon name="close" size={16} />
                          </button>
                        </div>
                      );
                    })
                  )}
                  <button
                    type="button"
                    onClick={() => addRange(weekday)}
                    className="v2-focus inline-flex w-fit items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-accent)] transition-colors hover:opacity-80"
                  >
                    <MIcon name="add" size={15} />
                    Añadir franja
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {saveError ? (
          <p role="alert" className="text-xs font-medium text-[color:var(--v2-danger)]">
            {saveError}
          </p>
        ) : null}
      </Card>

      {/* ── Fechas bloqueadas ─────────────────────────────────────────────────── */}
      <Card className="flex flex-col gap-4 p-4 lg:p-5">
        <div className="flex flex-col gap-1">
          <h2 className="v2-micro">Fechas bloqueadas</h2>
          <p className="text-xs text-[color:var(--v2-muted)]">
            Días concretos sin disponibilidad (vacaciones, viajes). No se ofrecen aunque haya franja
            semanal.
          </p>
        </div>

        {/* Add */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="block-date" className="v2-micro">
              Fecha
            </label>
            <input
              id="block-date"
              type="date"
              min={TODAY_MADRID}
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className={cn(INPUT_CLS, 'v2-num')}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor="block-motivo" className="v2-micro">
              Motivo (opcional)
            </label>
            <input
              id="block-motivo"
              type="text"
              maxLength={200}
              value={newMotivo}
              onChange={(e) => setNewMotivo(e.target.value)}
              placeholder="p. ej. vacaciones"
              className={cn(INPUT_CLS, 'w-full min-w-[10rem]')}
            />
          </div>
          <CitaActionButton
            label="Bloquear"
            icon="event_busy"
            tone="neutral"
            spinning={exBusy && removingId === null}
            disabled={exBusy || !newDate}
            onClick={addException}
          />
        </div>

        {/* List */}
        {initialExceptions.length === 0 ? (
          <EmptyState
            icon="event_available"
            title="Sin fechas bloqueadas"
            description="Todos los días con franja semanal están disponibles."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-[color:var(--v2-border)] rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)]">
            {initialExceptions.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold capitalize text-[color:var(--v2-fg)]">
                    {formatCitaDate(e.fecha)}
                  </span>
                  {e.motivo ? (
                    <span className="truncate text-xs text-[color:var(--v2-muted)]">{e.motivo}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => removeException(e.id)}
                  disabled={exBusy}
                  aria-label={`Quitar bloqueo del ${formatCitaDate(e.fecha)}`}
                  className="v2-focus inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-danger-soft)] hover:text-[color:var(--v2-danger)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <MIcon
                    name={exBusy && removingId === e.id ? 'progress_activity' : 'delete'}
                    size={16}
                    className={exBusy && removingId === e.id ? 'animate-spin' : undefined}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}

        {exError ? (
          <p role="alert" className="text-xs font-medium text-[color:var(--v2-danger)]">
            {exError}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
