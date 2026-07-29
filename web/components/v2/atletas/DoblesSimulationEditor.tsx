'use client';

// DoblesSimulationEditor — the coach AUTHORS the Dobles HYROX simulation for a
// pair: who carries each of the 8 functional stations (athlete A, athlete B, or a
// share between them), plus the running / RoxZone / tactical notes. This is the
// WRITE screen the audit found missing — the backend (GET prefill + PUT upsert +
// Zod) already exists at /api/coach/athletes/[id]/dobles-simulation.
//
// EFFECT (why it matters): what the coach saves here is EXACTLY what each athlete
// sees in their simulation session — on the phone (the live reparto line / relay)
// and on the watch. Storage is A/B-neutral: `self_share` is athlete A's fraction;
// the athlete API flips it so B sees 1 − share. The editor is A-centric (route
// athlete = A), and speaks in REAL names, never bare "A/B".
//
// Idiom: V2 modal (matches LinkPairModal), reusing SegmentedControl + Pill + the
// --v2-* tokens. One GET on open, one PUT on save; honest loading/error states.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import { cn } from '@/lib/utils';
import type {
  DoblesAssignedTo,
  DoblesSimulationCoachResponse,
} from '@fahybrid/shared/schema/dobles-simulation';

// One station's editable state (the GET row minus nothing — label is kept for
// display and stripped when building the strict PUT body).
interface StationState {
  station_index: number;
  label: string;
  assigned_to: DoblesAssignedTo;
  /** Athlete A's share, 0..1. Meaningful for 'split'; 1 for 'a', 0 for 'b'. */
  self_share: number;
  note: string;
}

// Slider step for the share — 5% granularity reads cleanly ("60 / 40") without
// pretending to a precision a coach never means.
const SHARE_STEP = 0.05;

const BTN_BASE =
  'v2-focus inline-flex items-center justify-center gap-1.5 rounded-[var(--v2-r-s)] px-3 text-body font-semibold transition-colors disabled:opacity-50';

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? 'No se pudo completar la acción.';
  } catch {
    return 'No se pudo completar la acción.';
  }
}

/** Round a 0..1 share to whole percent for display. */
function pct(share: number): number {
  return Math.round(share * 100);
}

/** Compact Spanish relative time ("hace 2h", "hace 5 min", "ayer"). */
function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

export function DoblesSimulationEditor({
  athleteId,
  onClose,
}: {
  /** Athlete A — the route athlete whose pair simulation we author. */
  athleteId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [aName, setAName] = useState<string>('Atleta A');
  const [bName, setBName] = useState<string>('Compañero');
  const [provenanceKind, setProvenanceKind] = useState<'coach' | 'athlete' | null>(null);
  const [provenanceName, setProvenanceName] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [targetEventId, setTargetEventId] = useState<number | null>(null);
  const [stations, setStations] = useState<StationState[]>([]);
  const [runningNote, setRunningNote] = useState('');
  const [roxzoneNote, setRoxzoneNote] = useState('');
  const [tacticalNote, setTacticalNote] = useState('');

  // Load the simulation (or its prefilled default) once on open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/coach/athletes/${athleteId}/dobles-simulation`, {
          headers: { accept: 'application/json' },
        });
        if (!res.ok) {
          if (!cancelled) setLoadError(await readError(res));
          return;
        }
        const d = (await res.json()) as DoblesSimulationCoachResponse;
        if (cancelled) return;
        setAName(d.athlete_a_name ?? 'Atleta A');
        setBName(d.athlete_b_name ?? 'Compañero');
        setProvenanceKind(d.last_edited_by_kind);
        setProvenanceName(d.last_edited_by_name);
        setUpdatedAt(d.updated_at);
        setTargetEventId(d.target_event_id);
        setStations(
          d.station_splits.map((s) => ({
            station_index: s.station_index,
            label: s.label,
            assigned_to: s.assigned_to,
            self_share: s.self_share,
            note: s.note ?? '',
          })),
        );
        setRunningNote(d.running_note ?? '');
        setRoxzoneNote(d.roxzone_note ?? '');
        setTacticalNote(d.tactical_note ?? '');
      } catch {
        if (!cancelled) setLoadError('Error de red al cargar la simulación.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  // Change a station's carrier. Switching to a full carrier pins the share (A→1,
  // B→0); switching to a share seeds a 50/50 so the slider starts sensible.
  const setAssigned = useCallback((index: number, assigned_to: DoblesAssignedTo) => {
    setStations((prev) =>
      prev.map((s) => {
        if (s.station_index !== index) return s;
        const self_share = assigned_to === 'a' ? 1 : assigned_to === 'b' ? 0 : s.assigned_to === 'split' ? s.self_share : 0.5;
        return { ...s, assigned_to, self_share };
      }),
    );
  }, []);

  const setShare = useCallback((index: number, self_share: number) => {
    setStations((prev) =>
      prev.map((s) => (s.station_index === index ? { ...s, self_share } : s)),
    );
  }, []);

  const setNote = useCallback((index: number, note: string) => {
    setStations((prev) =>
      prev.map((s) => (s.station_index === index ? { ...s, note } : s)),
    );
  }, []);

  // "Propuesta de Pablo" (coach) / "Ajustado por Guillem · hace 2h" (athlete).
  const provenanceLabel = useMemo(() => {
    if (!provenanceName) return null;
    if (provenanceKind === 'coach') return `Propuesta de ${provenanceName}`;
    if (provenanceKind === 'athlete') {
      const when = relativeTime(updatedAt);
      return when ? `Ajustado por ${provenanceName} · ${when}` : `Ajustado por ${provenanceName}`;
    }
    return null;
  }, [provenanceKind, provenanceName, updatedAt]);

  const assignedOptions = useMemo(
    () =>
      [
        { value: 'a' as const, label: aName },
        { value: 'split' as const, label: 'Repartida' },
        { value: 'b' as const, label: bName },
      ],
    [aName, bName],
  );

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      // Build the STRICT PUT body: drop `label`, omit empty notes, and let the
      // server re-normalize self_share against assigned_to (belt-and-suspenders —
      // we already pin it in the UI).
      const body = {
        target_event_id: targetEventId,
        station_splits: stations.map((s) => ({
          station_index: s.station_index,
          assigned_to: s.assigned_to,
          self_share: s.self_share,
          ...(s.note.trim() ? { note: s.note.trim() } : {}),
        })),
        running_note: runningNote.trim() || null,
        roxzone_note: roxzoneNote.trim() || null,
        tactical_note: tacticalNote.trim() || null,
      };
      const res = await fetch(`/api/coach/athletes/${athleteId}/dobles-simulation`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setSaveError(await readError(res));
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setSaveError('Error de red al guardar la simulación.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[color:var(--v2-scrim)] p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Reparto de la simulación"
      onClick={onClose}
    >
      <div
        className="my-4 w-full max-w-2xl rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-bg)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="v2-display text-xl text-[color:var(--v2-fg)]">Reparto de la simulación</h2>
            <p className="mt-0.5 truncate text-body text-[color:var(--v2-muted)]">
              {aName} <span className="text-[color:var(--v2-accent)]">·</span> {bName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="v2-focus shrink-0 rounded-[var(--v2-r-s)] p-1 text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={18} />
          </button>
        </div>

        {/* Provenance — the reparto is the pair's; the coach recommends and either
            athlete can adjust it from the app. Shows who last touched it. */}
        {provenanceLabel ? (
          <p className="mb-2 text-label font-semibold text-[color:var(--v2-muted)]">{provenanceLabel}</p>
        ) : null}

        {/* Effect explainer — what the coach edits here is what each athlete sees,
            reframed as a recommendation the pair can adjust. */}
        <div className="mb-4 flex items-start gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2.5">
          <MIcon name="info" size={15} className="mt-0.5 shrink-0 text-[color:var(--v2-accent)]" />
          <p className="text-xs leading-snug text-[color:var(--v2-muted)]">
            Tu recomendación de reparto para la simulación HYROX. La pareja puede ajustarla
            desde la app; cada atleta ve lo que esté puesto en su sesión (móvil y reloj):
            quién arranca cada estación, su parte y la nota.
          </p>
        </div>

        {loading ? (
          <p className="py-8 text-center text-body text-[color:var(--v2-muted)]">Cargando…</p>
        ) : loadError ? (
          <p className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3 text-body text-[color:var(--v2-danger)]">
            {loadError}
          </p>
        ) : (
          <>
            {/* 8 stations, race order */}
            <div className="flex flex-col gap-2">
              {stations.map((s) => (
                <StationRow
                  key={s.station_index}
                  station={s}
                  aName={aName}
                  bName={bName}
                  options={assignedOptions}
                  onAssign={(v) => setAssigned(s.station_index, v)}
                  onShare={(v) => setShare(s.station_index, v)}
                  onNote={(v) => setNote(s.station_index, v)}
                />
              ))}
            </div>

            {/* Coach notes */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <NoteBox label="Carrera" value={runningNote} onChange={setRunningNote} placeholder="Ritmo, quién marca…" />
              <NoteBox label="RoxZone" value={roxzoneNote} onChange={setRoxzoneNote} placeholder="Transiciones, relevos…" />
              <NoteBox label="Táctica" value={tacticalNote} onChange={setTacticalNote} placeholder="Plan general del equipo…" />
            </div>

            {saveError ? (
              <p className="mt-3 text-xs font-medium text-[color:var(--v2-danger)]">{saveError}</p>
            ) : null}

            {/* Footer */}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className={cn(
                  BTN_BASE,
                  'h-10 border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
                )}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className={cn(
                  BTN_BASE,
                  'h-10 bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]',
                )}
              >
                <MIcon name="check" size={16} />
                {saving ? 'Guardando…' : 'Guardar reparto'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── One station row ─────────────────────────────────────────────────────────────

function StationRow({
  station,
  aName,
  bName,
  options,
  onAssign,
  onShare,
  onNote,
}: {
  station: StationState;
  aName: string;
  bName: string;
  options: ReadonlyArray<{ value: DoblesAssignedTo; label: string }>;
  onAssign: (v: DoblesAssignedTo) => void;
  onShare: (v: number) => void;
  onNote: (v: string) => void;
}) {
  const isSplit = station.assigned_to === 'split';
  const aPct = pct(station.self_share);

  // The plain-language effect line for this station.
  const effect =
    station.assigned_to === 'a'
      ? `${aName} hace la estación completa`
      : station.assigned_to === 'b'
        ? `${bName} hace la estación completa`
        : `${aName} ${aPct}% · ${bName} ${100 - aPct}%`;

  return (
    <div className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[color:var(--v2-surface-2)] text-label font-bold text-[color:var(--v2-muted)]">
            {station.station_index}
          </span>
          <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">{station.label}</span>
        </div>
        <SegmentedControl<DoblesAssignedTo>
          options={options}
          value={station.assigned_to}
          onChange={onAssign}
          size="sm"
          ariaLabel={`Quién hace ${station.label}`}
        />
      </div>

      {/* Effect line — always visible so the coach reads what each athlete will get. */}
      <p className="mt-2 text-xs font-medium text-[color:var(--v2-muted)]">{effect}</p>

      {/* Share slider — only when the station is shared. */}
      {isSplit ? (
        <div className="mt-2 flex items-center gap-3">
          <span className="w-16 shrink-0 text-right text-label font-semibold text-[color:var(--v2-fg)]">
            {aName.split(' ')[0]} {aPct}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={SHARE_STEP}
            value={station.self_share}
            onChange={(e) => onShare(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-[color:var(--v2-accent)]"
            aria-label={`Parte de ${aName} en ${station.label}`}
          />
          <span className="w-16 shrink-0 text-label font-semibold text-[color:var(--v2-fg)]">
            {bName.split(' ')[0]} {100 - aPct}%
          </span>
        </div>
      ) : null}

      {/* Optional per-station note. */}
      <input
        type="text"
        value={station.note}
        onChange={(e) => onNote(e.target.value)}
        maxLength={120}
        placeholder="Nota (ej. alterna 250m)"
        className="v2-focus mt-2 h-8 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-bg)] px-2.5 text-xs text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-muted)] focus:border-[color:var(--v2-border-strong)]"
      />
    </div>
  );
}

// ── Coach note textarea ─────────────────────────────────────────────────────────

function NoteBox({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder={placeholder}
        className="v2-focus min-h-[52px] w-full resize-y rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2.5 py-2 text-xs text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-muted)] focus:border-[color:var(--v2-border-strong)]"
      />
    </label>
  );
}
