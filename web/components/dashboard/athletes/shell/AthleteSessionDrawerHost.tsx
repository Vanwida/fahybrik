'use client';

// Host del SessionDrawer para sesiones de ATLETA (UX redesign §2b, fase 2).
//
// Una sesión de atleta es un `workout_assignment` materializado: referencia
// una plantilla COMPARTIDA (sus bloques se muestran read-only — editarlos
// mutaría el plan de otros atletas) + overrides por-asignación (título y notas
// del coach) que SÍ se editan aquí y persisten por las APIs existentes de
// edición de día (PATCH /api/coach/athletes/[id]/sessions/[session_id]).
// Para sesiones completadas muestra los datos reales del atleta (tiempo, RPE,
// notas) junto a la prescripción.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlanSession } from '@/lib/dashboard/coach/athlete-plan';
import {
  adaptAthleteSessionToDrawer,
  type CoachSessionDetail,
} from '@/lib/dashboard/coach/athlete-session-adapter';
import { SESSION_STATUS_LABEL } from '@/lib/dashboard/constants/session-status';
import { DAY_LABELS_FULL } from '@/lib/dashboard/constants/calendar';
import { useDebouncedAutosave } from '@/lib/dashboard/hooks/use-autosave';
import { SessionDrawer } from '@/components/dashboard/session-drawer';
import { MIcon } from '@/components/dashboard/MIcon';

const AUTOSAVE_DELAY_MS = 900;
const SAVED_FLASH_MS = 2000;

interface AthleteSessionDrawerHostProps {
  athleteId: string;
  session: PlanSession;
  /** Día de la semana 1–7 de la sesión (para el kicker "Jueves 11 jun"). */
  dayOfWeek: number;
  /** Etiqueta de contexto de bloque ATR, p.ej. "Acumulación · Semana 3". */
  blockLabel: string | null;
  onClose: () => void;
  /** Hubo cambios persistidos — el padre recarga el plan al cerrar. */
  onSaved: () => void;
}

type Snapshot = { title: string; notes: string };

function snapshotEqual(a: Snapshot | null, b: Snapshot | null): boolean {
  return a != null && b != null && a.title === b.title && a.notes === b.notes;
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; detail: CoachSessionDetail };

function kickerFor(isoDate: string, dayOfWeek: number, blockLabel: string | null): string {
  const dayName = DAY_LABELS_FULL[dayOfWeek - 1] ?? '';
  const dayNum = Number(isoDate.slice(8, 10));
  const monthShort = new Date(`${isoDate}T12:00:00`).toLocaleDateString('es-ES', {
    month: 'short',
  });
  const datePart = `${dayName} ${dayNum} ${monthShort}`;
  return blockLabel ? `${datePart} · ${blockLabel}` : datePart;
}

export function AthleteSessionDrawerHost({
  athleteId,
  session,
  dayOfWeek,
  blockLabel,
  onClose,
  onSaved,
}: AthleteSessionDrawerHostProps) {
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' });
  // Historial de {título, notas} para undo/redo del footer del drawer.
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const persistedRef = useRef<Snapshot | null>(null);
  const hadChangesRef = useRef(false);
  // Guard de guardado por ref (no por estado): evita que un PATCH en vuelo
  // pierda una edición hecha mientras se guardaba (ver persist).
  const savingRef = useRef(false);
  const latestSnapRef = useRef<Snapshot | null>(null);

  const editable = session.status === 'scheduled';
  const current: Snapshot = history[historyIdx] ?? { title: session.title, notes: '' };

  useEffect(() => {
    latestSnapRef.current = history[historyIdx] ?? null;
  }, [history, historyIdx]);

  // Carga del detalle al abrir / cambiar de sesión. El reset síncrono de
  // loading es sincronización legítima al cambio de `assignment_id`, no un
  // setState derivado en cada render. Disable acotado (mismo patrón que
  // AthleteBodyView).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setLoad({ phase: 'loading' });
    fetch(`/api/coach/athletes/${athleteId}/sessions/${session.assignment_id}/detail`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setLoad({ phase: 'error' });
          return;
        }
        const json = (await res.json()) as { session: CoachSessionDetail };
        if (cancelled) return;
        const snapshot: Snapshot = {
          title: json.session.display_title ?? json.session.workout?.name ?? session.title,
          notes: json.session.coach_notes ?? '',
        };
        persistedRef.current = snapshot;
        setHistory([snapshot]);
        setHistoryIdx(0);
        setDirty(false);
        setSaveError(null);
        setLoad({ phase: 'ready', detail: json.session });
      })
      .catch(() => {
        if (!cancelled) setLoad({ phase: 'error' });
      });
    return () => {
      cancelled = true;
    };
    // session.title solo se usa como fallback inicial — no relanzar por él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId, session.assignment_id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pushSnapshot = useCallback(
    (next: Snapshot) => {
      setHistory((prev) => [...prev.slice(0, historyIdx + 1), next]);
      setHistoryIdx((idx) => idx + 1);
      setDirty(true);
      setSaveError(null);
    },
    [historyIdx],
  );

  const persist = useCallback(async () => {
    if (!editable || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // Bucle: guarda SIEMPRE el snapshot más nuevo (ref). Si el coach edita
      // MIENTRAS se guarda, repite con el snapshot nuevo — nada se pierde.
      for (;;) {
        const snapshot = latestSnapRef.current;
        if (!snapshot) return;
        if (snapshotEqual(persistedRef.current, snapshot)) {
          setDirty(false);
          return;
        }
        const res = await fetch(
          `/api/coach/athletes/${athleteId}/sessions/${session.assignment_id}`,
          {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              display_title: snapshot.title.trim() || session.title,
              notes: snapshot.notes,
            }),
          },
        );
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          setSaveError(json?.error?.message ?? 'No se pudo guardar');
          return;
        }
        persistedRef.current = snapshot;
        hadChangesRef.current = true;
        if (snapshotEqual(latestSnapRef.current, snapshot)) {
          setDirty(false);
          setSavedFlash(true);
          window.setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
          return;
        }
      }
    } catch {
      setSaveError('Error de red al guardar');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [athleteId, editable, session.assignment_id, session.title]);

  useDebouncedAutosave({
    dirty,
    revision: historyIdx,
    enabled: editable && load.phase === 'ready',
    delayMs: AUTOSAVE_DELAY_MS,
    onSave: persist,
  });

  const handleClose = useCallback(() => {
    onClose();
    if (dirty && editable) {
      // Flush implícito: si quedaba un cambio sin debounce, persiste al cerrar
      // y recarga el plan DESPUÉS para no leer datos a medio guardar.
      void persist().finally(() => onSaved());
    } else if (hadChangesRef.current) {
      onSaved();
    }
  }, [dirty, editable, onClose, onSaved, persist]);

  const drawerSession = useMemo(() => {
    if (load.phase !== 'ready') return undefined;
    const adapted = adaptAthleteSessionToDrawer(load.detail);
    return { ...adapted, focus: current.title };
  }, [load, current.title]);

  const noop = () => undefined;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Cerrar panel de sesión"
        onClick={handleClose}
        className="absolute inset-0 cursor-default bg-[color:var(--scrim)]"
        tabIndex={-1}
      />
      <div className="relative flex h-full w-full max-w-full flex-col sm:max-w-xl lg:w-[40%] lg:min-w-[480px]">
        {load.phase === 'ready' ? (
          <SessionDrawer
            kicker={kickerFor(session.iso_date, dayOfWeek, blockLabel)}
            statePill={SESSION_STATUS_LABEL[session.status]}
            session={drawerSession}
            exercises={[]}
            saveState={{
              dirty,
              saving,
              savedFlash,
              saveError,
              canUndo: editable && historyIdx > 0,
              canRedo: editable && historyIdx < history.length - 1,
              onUndo: () => {
                if (historyIdx > 0) {
                  setHistoryIdx(historyIdx - 1);
                  setDirty(true);
                }
              },
              onRedo: () => {
                if (historyIdx < history.length - 1) {
                  setHistoryIdx(historyIdx + 1);
                  setDirty(true);
                }
              },
            }}
            onClose={handleClose}
            onChangeTitle={(title) => pushSnapshot({ ...current, title })}
            onChangePart={noop}
            onRemovePart={noop}
            onDuplicatePart={noop}
            onDuplicateAsOwn={noop}
            onAddExercise={noop}
            onAddBlockLibrary={noop}
            onAddBlockPabloIA={noop}
            onAddBlockCustom={noop}
            read_only={!editable}
            blocks_read_only
            before_blocks={
              <DrawerContext
                detail={load.detail}
                notes={current.notes}
                editable={editable}
                onChangeNotes={(notes) => pushSnapshot({ ...current, notes })}
              />
            }
            className="h-full"
          />
        ) : (
          <DrawerFallback
            error={load.phase === 'error'}
            kicker={kickerFor(session.iso_date, dayOfWeek, blockLabel)}
            onClose={handleClose}
          />
        )}
      </div>
    </div>
  );
}

// ── Datos reales del atleta + notas del coach (antes de los bloques) ────────
function DrawerContext({
  detail,
  notes,
  editable,
  onChangeNotes,
}: {
  detail: CoachSessionDetail;
  notes: string;
  editable: boolean;
  onChangeNotes: (notes: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {detail.execution ? (
        <section
          aria-label="Datos reales del atleta"
          className="rounded-[var(--r-l)] border border-[color:color-mix(in_srgb,var(--status-success)_30%,var(--border-subtle))] bg-[color:color-mix(in_srgb,var(--status-success)_5%,var(--surface-card))] p-3"
        >
          <p className="micro-label mb-2 flex items-center gap-1.5 text-[color:var(--status-success)]">
            <MIcon name="check_circle" size={13} filled aria-hidden />
            Real del atleta
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            <Metric label="Tiempo" value={detail.execution.duration_min != null ? `${detail.execution.duration_min}'` : '—'} />
            <Metric label="RPE reportado" value={detail.execution.rpe != null ? `${detail.execution.rpe}/10` : '—'} />
          </div>
          {detail.execution.athlete_notes ? (
            <p className="mt-2 text-xs text-[color:var(--text-muted)]">
              “{detail.execution.athlete_notes}”
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="athlete-session-coach-notes" className="micro-label">
          Notas del coach
        </label>
        {editable ? (
          <textarea
            id="athlete-session-coach-notes"
            value={notes}
            rows={2}
            maxLength={2000}
            placeholder="Instrucciones para el atleta en esta sesión…"
            onChange={(e) => onChangeNotes(e.target.value)}
            className="focus-ring rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-2.5 py-2 text-xs text-[color:var(--fg)] placeholder:text-[color:var(--text-muted)]"
          />
        ) : (
          <p className="rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-2.5 py-2 text-xs text-[color:var(--text-muted)]">
            {notes || 'Sin notas del coach.'}
          </p>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex flex-col">
      <span className="metric-num text-sm font-semibold text-[color:var(--fg)]">{value}</span>
      <span className="micro-label mt-0.5">{label}</span>
    </p>
  );
}

// ── Skeleton / error mientras carga el detalle ──────────────────────────────
function DrawerFallback({
  error,
  kicker,
  onClose,
}: {
  error: boolean;
  kicker: string;
  onClose: () => void;
}) {
  return (
    <aside
      role="complementary"
      aria-label={`Sesión — ${kicker}`}
      className="flex h-full flex-col border-l border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-[color:var(--border-subtle)] px-5 pb-4 pt-5">
        <span className="micro-label tracking-[0.12em]">{kicker}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel de sesión"
          className="focus-ring shrink-0 rounded-[var(--r-s)] p-2 text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--fg)]"
        >
          <MIcon name="close" size={18} aria-hidden />
        </button>
      </header>
      <div className="flex flex-1 flex-col gap-3 p-5">
        {error ? (
          <p className="rounded-[var(--r-m)] border border-[color:color-mix(in_srgb,var(--danger)_40%,var(--border-subtle))] bg-[color:var(--surface-card)] p-3 text-xs text-[color:var(--danger)]">
            No se pudo cargar la sesión — cierra y vuelve a intentarlo.
          </p>
        ) : (
          <>
            <div className="h-7 w-2/3 animate-pulse rounded-[var(--r-s)] bg-[color:var(--surface-container-high)]" />
            <div className="h-28 animate-pulse rounded-[var(--r-l)] bg-[color:var(--surface-container-low)]" />
            <div className="h-28 animate-pulse rounded-[var(--r-l)] bg-[color:var(--surface-container-low)]" />
          </>
        )}
      </div>
    </aside>
  );
}
