'use client';

// AvailabilityEditor — the coach's weekly windows + address + blocked dates.
//   · Cupo máximo — the athlete cap (#18).
//   · Franjas semanales — TWO independent weekly schedules (#40): videollamadas and
//     presencial. A segmented toggle swaps which schedule you edit; each is a Monday-first
//     (DB weekday 0=Sun … 6=Sat) list of time ranges. The two can OVERLAP freely (the same
//     hour in both = the coach can do either); when a slot is booked in either modality that
//     hour disappears from both (occupancy is agnostic, enforced server-side). One "Guardar"
//     PUTs the FULL windows array from BOTH schedules, each window tagged with its modality
//     (server does a full replace).
//   · Dirección presencial — el nombre del box + la calle (coaches.studio_name / location,
//     via PATCH /api/coach/profile). Aparece en el email y el .ics del atleta.
//   · Fechas bloqueadas — upcoming exceptions; add a date / remove one.
// Weekly windows + address live in local editable state; exceptions render straight off the
// server props and re-sync via router.refresh after each mutation. Honest empty state when no
// windows are defined (leads then see the "Pablo te escribirá" fallback).

import { useEffect, useState, useTransition } from 'react';
import { Link } from '@/i18n/navigation';
import { useRouter } from 'next/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/v2/EmptyState';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import { CitaActionButton } from '@/components/v2/citas/CitaActionButton';
import { formatCitaDate } from '@/components/v2/citas/format';
import type { AvailabilityRow, ExceptionRow } from '@/lib/citas/store';
import type { CitaModality } from '@fahybrid/shared/schema';
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

// #40: the two independent schedules. Order also fixes how windows are serialized on save.
const MODALITIES: ReadonlyArray<CitaModality> = ['video', 'presencial'];
const MODALITY_OPTIONS: ReadonlyArray<{ value: CitaModality; label: string }> = [
  { value: 'video', label: 'Videollamadas' },
  { value: 'presencial', label: 'Presencial' },
];

// Default box name — a placeholder hint, never forced onto the coach.
const STUDIO_PLACEHOLDER = 'Ej: nombre de tu club o estudio';

const DEFAULT_RANGE: Range = { start: '09:00', end: '10:00' };

const INPUT_CLS =
  'v2-focus h-9 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2.5 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]';

type WeekSchedule = Record<number, Range[]>;

function emptyWeek(): WeekSchedule {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

function groupWindows(windows: AvailabilityRow[]): WeekSchedule {
  const map = emptyWeek();
  for (const w of windows) map[w.weekday].push({ start: w.start_time, end: w.end_time });
  for (let d = 0; d <= 6; d += 1) map[d].sort((a, b) => a.start.localeCompare(b.start));
  return map;
}

// Split the flat windows list into the two independent weekly schedules (#40).
function splitByModality(windows: AvailabilityRow[]): Record<CitaModality, WeekSchedule> {
  return {
    video: groupWindows(windows.filter((w) => w.modality === 'video')),
    presencial: groupWindows(windows.filter((w) => w.modality === 'presencial')),
  };
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
  initialMaxAthletes,
}: {
  initialWindows: AvailabilityRow[];
  initialExceptions: ExceptionRow[];
  /** The coach's athlete cap (#18); null = no limit (waitlist off). */
  initialMaxAthletes: number | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // ── Cupo máximo de atletas (#18) ─────────────────────────────────────────────
  // Empty string = sin límite (null). Saved to coaches.max_athletes via /api/coach/capacity.
  const [cupo, setCupo] = useState<string>(initialMaxAthletes == null ? '' : String(initialMaxAthletes));
  const [cupoSaving, setCupoSaving] = useState(false);
  const [cupoSaved, setCupoSaved] = useState(false);
  const [cupoError, setCupoError] = useState<string | null>(null);
  const cupoDirty = cupo.trim() !== (initialMaxAthletes == null ? '' : String(initialMaxAthletes));

  async function saveCupo() {
    if (cupoSaving) return;
    const trimmed = cupo.trim();
    let value: number | null;
    if (trimmed === '') {
      value = null;
    } else {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0) {
        setCupoError('Introduce un número entero de 0 o más, o déjalo vacío para sin límite.');
        return;
      }
      value = n;
    }
    setCupoError(null);
    setCupoSaving(true);
    setCupoSaved(false);
    try {
      const res = await fetch('/api/coach/capacity', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ max_athletes: value }),
      });
      if (!res.ok) {
        setCupoError(await readError(res, 'No se pudo guardar el cupo. Reintenta.'));
        setCupoSaving(false);
        return;
      }
      setCupoSaving(false);
      setCupoSaved(true);
      startTransition(() => router.refresh());
    } catch {
      setCupoError('Error de red. Reintenta.');
      setCupoSaving(false);
    }
  }

  // ── Weekly windows — two independent schedules (#40) ──────────────────────────
  const [activeModality, setActiveModality] = useState<CitaModality>('video');
  const [schedules, setSchedules] = useState<Record<CitaModality, WeekSchedule>>(() =>
    splitByModality(initialWindows),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const activeDays = schedules[activeModality];
  // Warning only when BOTH schedules are empty → the lead sees the fallback.
  const hasAnyWindow = MODALITIES.some((m) => WEEKDAYS.some((d) => schedules[m][d.weekday].length > 0));

  function mutateDay(modality: CitaModality, weekday: number, next: Range[]) {
    setSchedules((prev) => ({ ...prev, [modality]: { ...prev[modality], [weekday]: next } }));
    setDirty(true);
    setSaved(false);
  }

  function addRange(modality: CitaModality, weekday: number) {
    mutateDay(modality, weekday, [...schedules[modality][weekday], { ...DEFAULT_RANGE }]);
  }
  function removeRange(modality: CitaModality, weekday: number, idx: number) {
    mutateDay(modality, weekday, schedules[modality][weekday].filter((_, i) => i !== idx));
  }
  function updateRange(modality: CitaModality, weekday: number, idx: number, field: keyof Range, value: string) {
    mutateDay(
      modality,
      weekday,
      schedules[modality][weekday].map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    );
  }

  async function saveWindows() {
    if (saving) return;
    // Full replace: flatten BOTH schedules, each window tagged with its modality.
    const windows: { weekday: number; start_time: string; end_time: string; modality: CitaModality }[] = [];
    for (const modality of MODALITIES) {
      for (const { weekday } of WEEKDAYS) {
        for (const r of schedules[modality][weekday]) {
          windows.push({ weekday, start_time: r.start, end_time: r.end, modality });
        }
      }
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

  // ── Dirección presencial (#40) ────────────────────────────────────────────────
  // studio_name + location live on coaches (same columns the ajustes profile edits); we
  // load/save them via /api/coach/profile. Fetched client-side on mount so this page's
  // prop contract stays lean.
  const [addrLoaded, setAddrLoaded] = useState(false);
  const [studioName, setStudioName] = useState('');
  const [location, setLocation] = useState('');
  const [savedAddr, setSavedAddr] = useState<{ studio_name: string; location: string }>({
    studio_name: '',
    location: '',
  });
  const [addrSaving, setAddrSaving] = useState(false);
  const [addrSaved, setAddrSaved] = useState(false);
  const [addrError, setAddrError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/coach/profile');
        if (!res.ok) {
          if (!cancelled) setAddrLoaded(true);
          return;
        }
        const data = (await res.json()) as {
          profile?: { studio_name: string | null; location: string | null };
        };
        if (cancelled) return;
        const s = data.profile?.studio_name ?? '';
        const l = data.profile?.location ?? '';
        setStudioName(s);
        setLocation(l);
        setSavedAddr({ studio_name: s, location: l });
        setAddrLoaded(true);
      } catch {
        if (!cancelled) setAddrLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addrDirty =
    addrLoaded &&
    (studioName.trim() !== savedAddr.studio_name.trim() || location.trim() !== savedAddr.location.trim());

  async function saveAddr() {
    if (addrSaving || !addrLoaded) return;
    setAddrError(null);
    setAddrSaving(true);
    setAddrSaved(false);
    try {
      const res = await fetch('/api/coach/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ studio_name: studioName, location }),
      });
      if (!res.ok) {
        setAddrError(await readError(res, 'No se pudo guardar la dirección. Reintenta.'));
        setAddrSaving(false);
        return;
      }
      const data = (await res.json()) as {
        profile?: { studio_name: string | null; location: string | null };
      };
      const s = data.profile?.studio_name ?? '';
      const l = data.profile?.location ?? '';
      setStudioName(s);
      setLocation(l);
      setSavedAddr({ studio_name: s, location: l });
      setAddrSaving(false);
      setAddrSaved(true);
    } catch {
      setAddrError('Error de red. Reintenta.');
      setAddrSaving(false);
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
        <h1 className="v2-display text-3xl sm:text-4xl text-[color:var(--v2-fg)]">
          Disponibilidad y cupo
        </h1>
        <p className="text-xs text-[color:var(--v2-muted)]">
          Las franjas semanales definen los huecos que el lead puede reservar para la videollamada
          (Europe/Madrid).
        </p>
      </div>

      {/* ── Cupo máximo de atletas (#18) ──────────────────────────────────────── */}
      <Card className="flex flex-col gap-4 p-4 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="v2-micro">Cupo máximo de atletas</h2>
          <div className="flex items-center gap-2">
            {cupoSaved && !cupoDirty ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--v2-ok)]">
                <MIcon name="check_circle" size={15} filled />
                Guardado
              </span>
            ) : null}
            <CitaActionButton
              label="Guardar"
              icon="save"
              tone="accent"
              spinning={cupoSaving}
              disabled={cupoSaving || !cupoDirty}
              onClick={saveCupo}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="cupo-max"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={cupo}
              placeholder="Sin límite"
              aria-label="Cupo máximo de atletas"
              onChange={(e) => {
                setCupo(e.target.value);
                setCupoSaved(false);
                setCupoError(null);
              }}
              className={cn(INPUT_CLS, 'v2-num w-40')}
            />
            <span className="text-sm text-[color:var(--v2-muted)]">atletas</span>
          </div>
          <p className="text-xs text-[color:var(--v2-muted)]">
            Vacío = sin límite. Cuando llegas al cupo, los leads nuevos entran en lista de espera.
          </p>
        </div>

        {cupoError ? (
          <p role="alert" className="text-xs font-medium text-[color:var(--v2-danger)]">
            {cupoError}
          </p>
        ) : null}
      </Card>

      {/* ── Franjas semanales — dos horarios independientes (#40) ─────────────── */}
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

        {/* Toggle between the two independent schedules */}
        <div className="flex flex-col gap-2">
          <SegmentedControl
            options={MODALITY_OPTIONS}
            value={activeModality}
            onChange={setActiveModality}
            ariaLabel="Horario a editar"
            className="w-fit"
          />
          <p className="text-xs text-[color:var(--v2-muted)]">
            Dos horarios independientes. Si a la misma hora puedes las dos cosas, ponla en los dos
            horarios; cuando alguien reserva ese hueco desaparece de ambos.
          </p>
        </div>

        {!hasAnyWindow ? (
          <div
            className="flex items-start gap-2.5 rounded-[var(--v2-r-m)] border px-3.5 py-2.5"
            style={{ borderColor: 'var(--v2-warn)', background: 'var(--v2-warn-soft)' }}
          >
            <MIcon name="info" size={18} className="mt-0.5 text-[color:var(--v2-warn)]" />
            <p className="text-sm text-[color:var(--v2-fg)]">
              Aún no has definido tu disponibilidad, los leads verán{' '}
              <span className="font-semibold">“Pablo te escribirá para cuadrar la llamada”</span>.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col divide-y divide-[color:var(--v2-border)]">
          {WEEKDAYS.map(({ weekday, label }) => {
            const ranges = activeDays[weekday];
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
                            aria-label={`${label} · inicio`}
                            onChange={(e) => updateRange(activeModality, weekday, idx, 'start', e.target.value)}
                            className={cn(INPUT_CLS, 'v2-num w-[7.5rem]', invalid && 'border-[color:var(--v2-danger)]')}
                          />
                          <span className="text-[color:var(--v2-faint)]">–</span>
                          <input
                            type="time"
                            value={r.end}
                            aria-label={`${label} · fin`}
                            onChange={(e) => updateRange(activeModality, weekday, idx, 'end', e.target.value)}
                            className={cn(INPUT_CLS, 'v2-num w-[7.5rem]', invalid && 'border-[color:var(--v2-danger)]')}
                          />
                          <button
                            type="button"
                            onClick={() => removeRange(activeModality, weekday, idx)}
                            aria-label={`Quitar franja de ${label}`}
                            className="v2-focus inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-danger-soft)] hover:text-[color:var(--v2-danger)]"
                          >
                            <MIcon name="close" size={16} />
                          </button>
                        </div>
                      );
                    })
                  )}
                  <button
                    type="button"
                    onClick={() => addRange(activeModality, weekday)}
                    className="v2-focus inline-flex w-fit items-center gap-1 rounded-[var(--v2-r-s)] text-xs font-semibold text-[color:var(--v2-accent-text)] transition-colors hover:opacity-80"
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

      {/* ── Dirección para las sesiones presenciales (#40) ────────────────────── */}
      <Card className="flex flex-col gap-4 p-4 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="v2-micro">Dirección para las sesiones presenciales</h2>
            <p className="text-xs text-[color:var(--v2-muted)]">
              Aparece en el email y el .ics del atleta cuando reserva presencial. Con el nombre del
              box basta; la calle es opcional.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {addrSaved && !addrDirty ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--v2-ok)]">
                <MIcon name="check_circle" size={15} filled />
                Guardado
              </span>
            ) : null}
            <CitaActionButton
              label="Guardar"
              icon="save"
              tone="accent"
              spinning={addrSaving}
              disabled={addrSaving || !addrLoaded || !addrDirty}
              onClick={saveAddr}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="studio-name" className="v2-micro">
              Nombre del box
            </label>
            <input
              id="studio-name"
              type="text"
              maxLength={120}
              value={studioName}
              disabled={!addrLoaded}
              placeholder={STUDIO_PLACEHOLDER}
              onChange={(e) => {
                setStudioName(e.target.value);
                setAddrSaved(false);
                setAddrError(null);
              }}
              className={cn(INPUT_CLS, 'w-full disabled:opacity-50')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="studio-location" className="v2-micro">
              Dirección (opcional)
            </label>
            <input
              id="studio-location"
              type="text"
              maxLength={120}
              value={location}
              disabled={!addrLoaded}
              placeholder="Calle y número"
              onChange={(e) => {
                setLocation(e.target.value);
                setAddrSaved(false);
                setAddrError(null);
              }}
              className={cn(INPUT_CLS, 'w-full disabled:opacity-50')}
            />
          </div>
        </div>

        {addrError ? (
          <p role="alert" className="text-xs font-medium text-[color:var(--v2-danger)]">
            {addrError}
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
                  className="v2-focus inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-danger-soft)] hover:text-[color:var(--v2-danger)] disabled:cursor-not-allowed disabled:opacity-50"
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
