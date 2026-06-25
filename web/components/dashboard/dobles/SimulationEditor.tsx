'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/dashboard/ui/Card';
import {
  doblesSimulationPutSchema,
  type DoblesAssignedTo,
  type DoblesStationSplit,
  type DoblesSimulationCoachResponse,
} from '@fahybrid/shared/schema/dobles-simulation';

// Coach Dobles SIMULATION editor — the #1 goal is "as EASY as possible".
//
// EASE DECISIONS
// --------------
//  - The 8 HYROX stations arrive pre-filled (50/50 default) — never a blank page.
//  - Each station = ONE row: a 3-way segmented control (A / Juntos / B) + a
//    share slider that appears only when "Juntos" (split) is chosen.
//  - "A" / "B" use the brand color convention shared with iOS: self (athlete A)
//    = orange (--accent), partner (athlete B) = blue (--info).
//  - Three short note fields (running together / RoxZone relay / one tactical
//    line). Optional — the structured splits already carry the strategy.
//  - One Save button with optimistic inline feedback (idle → saving → saved /
//    error). No modal, no ceremony.
//
// "self" everywhere = athlete A (the athlete in the route). self_share is A's
// share; the API stores A-neutral and the athlete app flips it per reader.

type LabeledSplit = DoblesStationSplit & { label: string };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface SimulationEditorProps {
  athleteId: number;
  initial: DoblesSimulationCoachResponse;
}

const SEGMENTS: ReadonlyArray<{ key: DoblesAssignedTo; short: string }> = [
  { key: 'a', short: 'A' },
  { key: 'split', short: 'Juntos' },
  { key: 'b', short: 'B' },
];

// Quick share presets so the coach rarely needs the fine slider.
const SHARE_PRESETS = [0.4, 0.5, 0.6] as const;

function nameOrFallback(name: string | null, fallback: string): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function sharePct(share: number): number {
  return Math.round(share * 100);
}

export function SimulationEditor({ athleteId, initial }: SimulationEditorProps) {
  const [splits, setSplits] = useState<LabeledSplit[]>(initial.station_splits);
  const [runningNote, setRunningNote] = useState(initial.running_note ?? '');
  const [roxzoneNote, setRoxzoneNote] = useState(initial.roxzone_note ?? '');
  const [tacticalNote, setTacticalNote] = useState(initial.tactical_note ?? '');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Snapshot of the last successfully-saved state so feedback rolls back on error.
  const lastSavedRef = useRef<DoblesSimulationCoachResponse>(initial);

  const aName = nameOrFallback(initial.athlete_a_name, 'Atleta A');
  const bName = nameOrFallback(initial.athlete_b_name, 'Pareja');

  const setStation = useCallback(
    (stationIndex: number, patch: Partial<DoblesStationSplit>) => {
      setSplits((prev) =>
        prev.map((s) =>
          s.station_index === stationIndex ? { ...s, ...patch } : s,
        ),
      );
      setSaveState('idle');
    },
    [],
  );

  const onAssign = useCallback(
    (stationIndex: number, assigned_to: DoblesAssignedTo) => {
      // Snap share to the unambiguous value when fully assigned; keep/seed 0.5
      // when entering split so the slider has a sensible start.
      const self_share =
        assigned_to === 'a' ? 1 : assigned_to === 'b' ? 0 : 0.5;
      setStation(stationIndex, { assigned_to, self_share });
    },
    [setStation],
  );

  const onShare = useCallback(
    (stationIndex: number, self_share: number) => {
      setStation(stationIndex, { assigned_to: 'split', self_share });
    },
    [setStation],
  );

  const onNote = useCallback(
    (stationIndex: number, note: string) => {
      const trimmed = note.slice(0, 120);
      setStation(stationIndex, { note: trimmed.length ? trimmed : undefined });
    },
    [setStation],
  );

  const summary = useMemo(() => {
    const aLed = splits.filter((s) => s.assigned_to === 'a').length;
    const bLed = splits.filter((s) => s.assigned_to === 'b').length;
    const shared = splits.filter((s) => s.assigned_to === 'split').length;
    return { aLed, bLed, shared };
  }, [splits]);

  const onSave = useCallback(async () => {
    if (!initial.has_partner) return;
    setSaveState('saving');
    setErrorMsg(null);

    const payload = {
      target_event_id: initial.target_event_id,
      station_splits: splits.map(({ label: _label, ...rest }) => rest),
      running_note: runningNote.trim() || null,
      roxzone_note: roxzoneNote.trim() || null,
      tactical_note: tacticalNote.trim() || null,
    };

    // Client-side guard mirrors the server Zod (so obvious mistakes surface
    // instantly); the server re-validates regardless.
    const parsed = doblesSimulationPutSchema.safeParse(payload);
    if (!parsed.success) {
      setSaveState('error');
      setErrorMsg('Revisa el reparto de estaciones.');
      return;
    }

    try {
      const res = await fetch(
        `/api/coach/athletes/${athleteId}/dobles-simulation`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(parsed.data),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setSaveState('error');
        setErrorMsg(body?.error?.message ?? 'No se pudo guardar.');
        return;
      }
      const saved = (await res.json()) as DoblesSimulationCoachResponse;
      lastSavedRef.current = saved;
      setSplits(saved.station_splits);
      setSaveState('saved');
    } catch {
      setSaveState('error');
      setErrorMsg('Error de red. Inténtalo de nuevo.');
    }
  }, [
    athleteId,
    initial.has_partner,
    initial.target_event_id,
    splits,
    runningNote,
    roxzoneNote,
    tacticalNote,
  ]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
          Simulación Dobles
        </p>
        <h1 className="text-2xl font-bold italic text-[color:var(--fg)]">
          Reparto de carrera
        </h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Quién hace cada estación entre{' '}
          <span className="font-semibold text-[color:var(--accent)]">{aName}</span>{' '}
          y{' '}
          <span className="font-semibold text-[color:var(--info)]">{bName}</span>.
          Los 8 muros vienen repartidos al 50/50; ajusta con un toque.
        </p>
      </header>

      {!initial.has_partner && (
        <Card className="p-4">
          <p className="text-sm text-[color:var(--text-muted)]">
            Este atleta todavía no tiene pareja de Dobles vinculada. Vincula la
            pareja para poder guardar la simulación.
          </p>
        </Card>
      )}

      {/* Station splits */}
      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[color:var(--fg)]">
            Estaciones
          </h2>
          <p className="text-xs text-[color:var(--text-muted)]">
            <span className="text-[color:var(--accent)]">{aName}</span> {summary.aLed}
            {' · '}
            <span className="text-[color:var(--text-muted)]">Juntos</span> {summary.shared}
            {' · '}
            <span className="text-[color:var(--info)]">{bName}</span> {summary.bLed}
          </p>
        </div>

        <ul className="flex flex-col divide-y divide-[color:var(--border-subtle)]">
          {splits.map((s) => (
            <StationRow
              key={s.station_index}
              split={s}
              aName={aName}
              bName={bName}
              onAssign={onAssign}
              onShare={onShare}
              onNote={onNote}
            />
          ))}
        </ul>
      </Card>

      {/* Running together + RoxZone */}
      <div className="grid gap-4 sm:grid-cols-2">
        <NoteCard
          title="Carrera (siempre juntos)"
          hint="En Dobles ambos corren cada km. Marca aquí el ritmo o quién marca paso."
          value={runningNote}
          onChange={(v) => {
            setRunningNote(v);
            setSaveState('idle');
          }}
          placeholder="p. ej. Ritmo 4:45/km, A marca paso los 4 primeros."
        />
        <NoteCard
          title="RoxZone (relevos)"
          hint="Transiciones y handoffs: quién entra, quién recupera."
          value={roxzoneNote}
          onChange={(v) => {
            setRoxzoneNote(v);
            setSaveState('idle');
          }}
          placeholder="p. ej. B prepara material mientras A acaba el remo."
        />
      </div>

      {/* One tactical note */}
      <NoteCard
        title="Nota táctica"
        hint="Una línea que resume el plan. Es lo que ve el atleta como intro."
        value={tacticalNote}
        onChange={(v) => {
          setTacticalNote(v);
          setSaveState('idle');
        }}
        placeholder="p. ej. A lidera trineos, B remate de wall balls."
      />

      {/* Sticky save bar */}
      <div className="sticky bottom-0 z-10 -mx-1 mt-2 flex items-center justify-end gap-3 rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:color-mix(in_srgb,var(--surface-card)_92%,transparent)] px-4 py-3 backdrop-blur">
        <SaveFeedback state={saveState} errorMsg={errorMsg} />
        <button
          type="button"
          onClick={onSave}
          disabled={saveState === 'saving' || !initial.has_partner}
          className={cn(
            'focus-ring rounded-[var(--r-pill)] px-5 py-2 text-sm font-semibold transition',
            'bg-[color:var(--accent)] text-[color:var(--accent-on)]',
            'hover:bg-[color:var(--accent-press)] disabled:opacity-60',
          )}
        >
          {saveState === 'saving' ? 'Guardando…' : 'Guardar simulación'}
        </button>
      </div>
    </div>
  );
}

interface StationRowProps {
  split: LabeledSplit;
  aName: string;
  bName: string;
  onAssign: (stationIndex: number, assigned: DoblesAssignedTo) => void;
  onShare: (stationIndex: number, share: number) => void;
  onNote: (stationIndex: number, note: string) => void;
}

function StationRow({
  split,
  aName,
  bName,
  onAssign,
  onShare,
  onNote,
}: StationRowProps) {
  const isSplit = split.assigned_to === 'split';
  return (
    <li className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[color:var(--fg)]">
          {split.label}
        </p>
        {isSplit && (
          <p className="mt-0.5 text-xs text-[color:var(--text-muted)]">
            <span className="text-[color:var(--accent)]">{aName} {sharePct(split.self_share)}%</span>
            {' · '}
            <span className="text-[color:var(--info)]">
              {bName} {100 - sharePct(split.self_share)}%
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        {/* Segmented A / Juntos / B */}
        <div
          role="radiogroup"
          aria-label={`Reparto de ${split.label}`}
          className="inline-flex overflow-hidden rounded-[var(--r-pill)] border border-[color:var(--border-subtle)]"
        >
          {SEGMENTS.map(({ key, short }) => {
            const active = split.assigned_to === key;
            const tone =
              key === 'a'
                ? 'var(--accent)'
                : key === 'b'
                  ? 'var(--info)'
                  : 'var(--fg)';
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onAssign(split.station_index, key)}
                className={cn(
                  'focus-ring px-3 py-1.5 text-xs font-semibold transition',
                  active
                    ? 'text-[color:var(--surface-card)]'
                    : 'text-[color:var(--text-muted)] hover:text-[color:var(--fg)]',
                )}
                style={
                  active
                    ? { backgroundColor: tone, color: 'var(--surface-card)' }
                    : undefined
                }
              >
                {key === 'a' ? aName.split(' ')[0] : key === 'b' ? bName.split(' ')[0] : short}
              </button>
            );
          })}
        </div>

        {/* Share slider — only when split */}
        {isSplit && (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {SHARE_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onShare(split.station_index, p)}
                  className={cn(
                    'focus-ring rounded-[var(--r-s)] border px-2 py-0.5 text-[11px] font-semibold transition',
                    Math.abs(split.self_share - p) < 0.001
                      ? 'border-[color:var(--accent)] text-[color:var(--accent)]'
                      : 'border-[color:var(--border-subtle)] text-[color:var(--text-muted)] hover:text-[color:var(--fg)]',
                  )}
                >
                  {sharePct(p)}/{100 - sharePct(p)}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={sharePct(split.self_share)}
              onChange={(e) =>
                onShare(split.station_index, Number(e.target.value) / 100)
              }
              aria-label={`Porcentaje de ${aName} en ${split.label}`}
              className="h-1.5 w-28 cursor-pointer accent-[color:var(--accent)]"
            />
          </div>
        )}

        {/* Optional reparto note */}
        <input
          type="text"
          value={split.note ?? ''}
          onChange={(e) => onNote(split.station_index, e.target.value)}
          maxLength={120}
          placeholder="nota de reparto (opcional)"
          className={cn(
            'focus-ring w-full rounded-[var(--r-s)] border border-[color:var(--border-subtle)] bg-transparent px-2.5 py-1 text-xs text-[color:var(--fg)] placeholder:text-[color:var(--text-muted)] sm:w-56',
          )}
        />
      </div>
    </li>
  );
}

interface NoteCardProps {
  title: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

function NoteCard({ title, hint, value, onChange, placeholder }: NoteCardProps) {
  return (
    <Card className="p-4">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-[color:var(--fg)]">{title}</span>
        <span className="text-xs text-[color:var(--text-muted)]">{hint}</span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 500))}
          placeholder={placeholder}
          rows={2}
          maxLength={500}
          className={cn(
            'focus-ring mt-1 w-full resize-y rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-transparent px-3 py-2 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--text-muted)]',
          )}
        />
      </label>
    </Card>
  );
}

function SaveFeedback({
  state,
  errorMsg,
}: {
  state: SaveState;
  errorMsg: string | null;
}) {
  if (state === 'saved') {
    return (
      <span className="text-xs font-medium text-[color:var(--accent)]">
        Guardado ✓
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span className="text-xs font-medium text-[color:var(--danger,#E5484D)]">
        {errorMsg ?? 'Error al guardar'}
      </span>
    );
  }
  return null;
}
