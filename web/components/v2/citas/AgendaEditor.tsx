'use client';

// Agenda y cupo — plazas, horarios de llamada y días libres. Un solo modelo de
// guardado, como todo Ajustes: el cupo y cada franja se guardan al salir del
// campo; añadir o quitar una franja o un día libre se guarda al momento.
// Horarios: dos independientes (videollamada y presencial, #40); la misma hora
// en los dos = puedes cualquiera, y al reservarse desaparece de ambos (lo hace
// el servidor). La dirección de las presenciales se edita en Tu club.

import { useId, useState } from 'react';
import { CalendarOff, Plus, Trash2, X } from 'lucide-react';
import type { CitaModality } from '@fahybrid/shared/schema';
import type { AvailabilityRow, ExceptionRow } from '@/lib/citas/store';
import type { CapacityState } from '@/lib/coach/capacity';
import { Link } from '@/i18n/navigation';
import { Button, EmptyState, IconButton, Input, SegmentedControl } from '@/components/v2/ui';
import { SettingRow, SettingsSection } from '@/components/v2/ajustes/SettingsKit';
import { SaveStatus, sendJson, useSaveState } from '@/components/v2/ajustes/autosave';
import { formatCitaDate } from './format';
import { zonedDayString } from '@fahybrid/shared/domain/dates';
import { useCoachTimeZone } from '@/lib/coach/coach-timezone-context';

interface Range {
  start: string;
  end: string;
}
type Week = Record<number, Range[]>;

// Lunes primero; `weekday` es el de la base (0 = domingo).
const WEEKDAYS: ReadonlyArray<{ weekday: number; label: string }> = [
  { weekday: 1, label: 'Lunes' },
  { weekday: 2, label: 'Martes' },
  { weekday: 3, label: 'Miércoles' },
  { weekday: 4, label: 'Jueves' },
  { weekday: 5, label: 'Viernes' },
  { weekday: 6, label: 'Sábado' },
  { weekday: 0, label: 'Domingo' },
];
const MODALITIES: readonly CitaModality[] = ['video', 'presencial'];
const DEFAULT_RANGE: Range = { start: '09:00', end: '10:00' };

function emptyWeek(): Week {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}
function split(windows: AvailabilityRow[]): Record<CitaModality, Week> {
  const out: Record<CitaModality, Week> = { video: emptyWeek(), presencial: emptyWeek() };
  for (const w of windows) out[w.modality][w.weekday].push({ start: w.start_time, end: w.end_time });
  for (const m of MODALITIES) for (let d = 0; d <= 6; d += 1) out[m][d].sort((a, b) => a.start.localeCompare(b.start));
  return out;
}
const valid = (r: Range) => Boolean(r.start) && Boolean(r.end) && r.end > r.start;

export function AgendaEditor({
  windows,
  exceptions,
  capacity,
}: {
  windows: AvailabilityRow[];
  exceptions: ExceptionRow[];
  capacity: CapacityState | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <CupoSection capacity={capacity} />
      <HorariosSection initial={windows} />
      <DiasLibresSection initial={exceptions} />
    </div>
  );
}

// ── Cupo ────────────────────────────────────────────────────────────────────

function CupoSection({ capacity }: { capacity: CapacityState | null }) {
  const id = useId();
  const initial = capacity?.max == null ? '' : String(capacity.max);
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [localError, setLocalError] = useState<string | null>(null);
  const { state, error, run } = useSaveState();

  const commit = async () => {
    const t = draft.trim();
    if (t === saved) return;
    let value: number | null = null;
    if (t !== '') {
      const n = Number(t);
      if (!Number.isInteger(n) || n < 0) {
        setLocalError('Un número entero, o vacío para no poner límite.');
        return;
      }
      value = n;
    }
    setLocalError(null);
    const ok = await run(async () => {
      const res = await sendJson('/api/coach/capacity', 'POST', { max_athletes: value });
      return res.ok ? { ok: true } : res;
    });
    if (ok) setSaved(t);
  };

  return (
    <SettingsSection title="Cupo">
      <SettingRow
        layout="inline"
        label="Plazas de atletas"
        htmlFor={id}
        hintId={`${id}-hint`}
        status={localError ? 'error' : state}
        error={localError ?? error}
        hint={
          <>
            Al llenarse, los leads nuevos entran en lista de espera. Vacío = sin límite.
            {capacity ? (
              <span className="text-v2-faint t-tnum">
                {' '}
                Ahora ocupan plaza {capacity.active}
                {capacity.paused > 0 ? ` (${capacity.paused} en pausa)` : ''}.
              </span>
            ) : null}
          </>
        }
      >
        <Input
          id={id}
          inputMode="numeric"
          value={draft}
          placeholder="Sin límite"
          invalid={Boolean(localError) || state === 'error'}
          aria-describedby={`${id}-hint`}
          onChange={(e) => {
            setDraft(e.target.value);
            if (localError) setLocalError(null);
          }}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
          className="w-28 text-right t-tnum"
        />
      </SettingRow>
    </SettingsSection>
  );
}

// ── Horarios ────────────────────────────────────────────────────────────────

function HorariosSection({ initial }: { initial: AvailabilityRow[] }) {
  const [modality, setModality] = useState<CitaModality>('video');
  const [weeks, setWeeks] = useState(() => split(initial));
  const { state, error, run } = useSaveState();

  const anyWindow = MODALITIES.some((m) => WEEKDAYS.some((d) => weeks[m][d.weekday].length > 0));

  /** Guarda el horario ENTERO (el servidor reemplaza), si todo es válido. */
  const persist = async (next: Record<CitaModality, Week>) => {
    const flat: { weekday: number; start_time: string; end_time: string; modality: CitaModality }[] = [];
    for (const m of MODALITIES)
      for (const { weekday } of WEEKDAYS)
        for (const r of next[m][weekday]) flat.push({ weekday, start_time: r.start, end_time: r.end, modality: m });
    if (flat.some((w) => !valid({ start: w.start_time, end: w.end_time }))) return;
    await run(async () => {
      const res = await sendJson('/api/coach/availability', 'PUT', { windows: flat });
      return res.ok ? { ok: true } : res;
    });
  };

  const setDay = (weekday: number, ranges: Range[], save: boolean) => {
    const next = { ...weeks, [modality]: { ...weeks[modality], [weekday]: ranges } };
    setWeeks(next);
    if (save) void persist(next);
  };

  return (
    <SettingsSection title="Horarios de llamada" action={<SaveStatus state={state} error={error} />}>
      <div className="flex flex-col gap-2 px-4 py-3.5">
        <SegmentedControl
          aria-label="Qué horario editas"
          items={[
            { value: 'video', label: 'Videollamada' },
            { value: 'presencial', label: 'Presencial' },
          ]}
          value={modality}
          onValueChange={setModality}
          className="w-fit"
        />
        <p className="t-body-sm text-v2-muted">
          {anyWindow
            ? 'Los huecos que tus leads pueden reservar (hora de Madrid). Una misma hora puede estar en los dos horarios.'
            : 'Sin horarios, tus leads no ven huecos: les escribes tú para cuadrar la llamada.'}
          {modality === 'presencial' ? (
            <>
              {' '}
              La dirección que reciben es la de{' '}
              <Link href="/ajustes/club" className="text-v2-fg underline underline-offset-2">
                Tu club
              </Link>
              .
            </>
          ) : null}
        </p>
      </div>
      {WEEKDAYS.map(({ weekday, label }) => (
        <DayRow
          key={`${modality}-${weekday}`}
          label={label}
          ranges={weeks[modality][weekday]}
          onChange={(ranges, save) => setDay(weekday, ranges, save)}
        />
      ))}
    </SettingsSection>
  );
}

function DayRow({
  label,
  ranges,
  onChange,
}: {
  label: string;
  ranges: Range[];
  onChange: (ranges: Range[], save: boolean) => void;
}) {
  const addButton = (
    <Button
      size="sm"
      variant="ghost"
      icon={Plus}
      className="w-fit"
      onClick={() => onChange([...ranges, { ...DEFAULT_RANGE }], true)}
    >
      Añadir franja
    </Button>
  );
  if (ranges.length === 0) {
    return (
      <div className="flex min-h-12 items-center gap-4 px-4 py-2">
        <span className="w-24 shrink-0 t-body font-medium text-v2-fg">{label}</span>
        <span className="flex-1 t-body-sm text-v2-faint">Sin franjas</span>
        {addButton}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-24 shrink-0 pt-1.5 t-body font-medium text-v2-fg">{label}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {ranges.map((r, i) => {
          const bad = !valid(r);
          const update = (field: keyof Range, value: string) =>
            onChange(
              ranges.map((x, j) => (j === i ? { ...x, [field]: value } : x)),
              false,
            );
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input
                type="time"
                value={r.start}
                aria-label={`${label}, desde`}
                invalid={bad}
                onChange={(e) => update('start', e.target.value)}
                onBlur={() => onChange(ranges, true)}
                className="w-28 t-tnum"
              />
              <span className="text-v2-faint">–</span>
              <Input
                type="time"
                value={r.end}
                aria-label={`${label}, hasta`}
                invalid={bad}
                onChange={(e) => update('end', e.target.value)}
                onBlur={() => onChange(ranges, true)}
                className="w-28 t-tnum"
              />
              <IconButton
                icon={X}
                label={`Quitar franja del ${label.toLowerCase()}`}
                onClick={() => onChange(ranges.filter((_, j) => j !== i), true)}
              />
              {bad ? <span className="t-meta text-v2-danger">El final tiene que ir después del inicio.</span> : null}
            </div>
          );
        })}
        {addButton}
      </div>
    </div>
  );
}

// ── Días libres ─────────────────────────────────────────────────────────────

function DiasLibresSection({ initial }: { initial: ExceptionRow[] }) {
  // «Hoy» en la hora del club: no se puede bloquear un día que ya pasó allí.
  const today = zonedDayString(new Date(), useCoachTimeZone());
  const dateId = useId();
  const motivoId = useId();
  const [items, setItems] = useState(initial);
  const [fecha, setFecha] = useState('');
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const { state, error, run } = useSaveState();

  const add = async () => {
    if (!fecha || busy) return;
    setBusy('add');
    await run(async () => {
      const res = await sendJson<{ exception: ExceptionRow }>('/api/coach/availability/exceptions', 'POST', {
        fecha,
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
      });
      if (!res.ok) return res;
      setItems((prev) => [...prev.filter((e) => e.id !== res.data.exception.id), res.data.exception].sort((a, b) => a.fecha.localeCompare(b.fecha)));
      setFecha('');
      setMotivo('');
      return { ok: true };
    });
    setBusy(null);
  };

  const remove = async (id: string) => {
    setBusy(id);
    await run(async () => {
      const res = await sendJson(`/api/coach/availability/exceptions/${id}`, 'DELETE');
      if (!res.ok) return res;
      setItems((prev) => prev.filter((e) => e.id !== id));
      return { ok: true };
    });
    setBusy(null);
  };

  return (
    <SettingsSection title="Días libres" action={<SaveStatus state={state} error={error} />}>
      <div className="flex flex-wrap items-end gap-2 px-4 py-3.5">
        <label className="flex flex-col gap-1.5" htmlFor={dateId}>
          <span className="t-meta text-v2-muted">Día</span>
          <Input id={dateId} type="date" min={today} value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-40 t-tnum" />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1.5" htmlFor={motivoId}>
          <span className="t-meta text-v2-muted">Motivo (opcional)</span>
          <Input id={motivoId} maxLength={200} value={motivo} placeholder="Vacaciones, viaje…" onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <Button icon={CalendarOff} disabled={!fecha} loading={busy === 'add'} onClick={() => void add()}>
          Bloquear día
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState className="px-4 py-3" title="Sin días bloqueados" description="todos los días con horario se pueden reservar" />
      ) : (
        items.map((e) => (
          <div key={e.id} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="t-body font-medium text-v2-fg first-letter:uppercase">{formatCitaDate(e.fecha)}</span>
              {e.motivo ? <span className="truncate t-body-sm text-v2-muted">{e.motivo}</span> : null}
            </div>
            <IconButton
              icon={Trash2}
              label={`Desbloquear el ${formatCitaDate(e.fecha)}`}
              loading={busy === e.id}
              disabled={busy !== null}
              onClick={() => void remove(e.id)}
            />
          </div>
        ))
      )}
    </SettingsSection>
  );
}
