'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import type { WeekSlots } from '@fahybrid/shared/schema/program-templates';
import {
  ProgrammingWeekStudio,
  type StudioToolbarRenderState,
} from '@/components/dashboard/programming/studio/ProgrammingWeekStudio';
import { UndoRedoControls } from '@/components/dashboard/programming/studio/UndoRedoControls';
import { PabloIAInput } from '@/components/dashboard/pablo-ia/PabloIAInput';
import { AssignFlow } from '@/components/dashboard/assign-flow/AssignFlow';
import {
  WeekSettingsDisclosure,
  type WeekMetaPatch,
} from '@/components/dashboard/programming/WeekSettingsDisclosure';
import { cloneWeekSlotsWithNewUids } from '@/lib/dashboard/programming/day-composition';
import { PROGRAM_LEVEL_LABELS, type ProgramLevel } from '@/lib/dashboard/constants/program-levels';
import { atrPhaseLabel } from '@/lib/dashboard/constants/atr-phases';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

export interface MicrocycleEditorWeek {
  id: string;
  week_index: number;
  name: string;
  level: string;
  focus: string | null;
  coach_notes: string | null;
  atr_block_hint: string | null;
  slots_json: WeekSlots;
}

export interface MicrocycleEditorMonth {
  id: string;
  name: string;
  level: string;
  atr_block_hint: string | null;
}

export interface MicrocycleEditorAthlete {
  id: string;
  full_name: string;
}

interface MicrocycleEditorProps {
  month: MicrocycleEditorMonth;
  weeks: MicrocycleEditorWeek[];
  activeWeekIndex: number;
  athletes: MicrocycleEditorAthlete[];
}

interface MonthSaveState {
  saving: boolean;
  saveError: string | null;
  savedFlash: boolean;
  dirty: boolean;
}

function saveStatus(
  weekState: Pick<StudioToolbarRenderState, 'saving' | 'saveError' | 'savedFlash' | 'dirty'>,
  monthState: MonthSaveState,
) {
  const saving = weekState.saving || monthState.saving;
  const saveError = weekState.saveError || monthState.saveError;
  const savedFlash = weekState.savedFlash || monthState.savedFlash;
  const dirty = weekState.dirty || monthState.dirty;
  if (saving) return { text: 'Guardando…', tone: 'pending' as const };
  if (saveError) return { text: 'Error al guardar', tone: 'error' as const };
  if (savedFlash) return { text: 'Guardado', tone: 'ok' as const };
  if (dirty) return { text: 'Cambios pendientes', tone: 'pending' as const };
  return { text: 'Sincronizado', tone: 'ok' as const };
}

interface DuplicateWeekMenuProps {
  weeks: MicrocycleEditorWeek[];
  activeWeekIndex: number;
  busy: boolean;
  onDuplicate: (toIndex: number) => void;
}

/**
 * Menú "Duplicar semana" (F12): copia el contenido de la semana activa a otra
 * semana del microciclo (sobrescribe el destino). Accesible: botón con
 * aria-haspopup, cierre con Escape/click-fuera, opciones como menuitem.
 */
function DuplicateWeekMenu({ weeks, activeWeekIndex, busy, onDuplicate }: DuplicateWeekMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const targets = weeks.filter((w) => w.week_index !== activeWeekIndex);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (targets.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Duplicar esta semana en otra del microciclo"
        className="focus-ring inline-flex items-center gap-1 rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--accent)]/60 hover:text-[color:var(--fg)] disabled:opacity-40"
      >
        <MIcon name="content_copy" size={13} />
        <span>{busy ? 'Duplicando…' : 'Duplicar'}</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Duplicar semana en"
          className="absolute left-0 top-full z-30 mt-1 w-56 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] p-1 shadow-xl"
        >
          <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            Copiar esta semana en
          </p>
          {targets.map((w) => {
            const label =
              w.week_index === 3 ? `Semana ${w.week_index + 1} (deload)` : `Semana ${w.week_index + 1}`;
            return (
              <button
                key={w.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onDuplicate(w.week_index);
                  setOpen(false);
                }}
                className="focus-ring flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-2 text-left text-sm font-medium text-[color:var(--fg)] hover:bg-[color:var(--surface-container-highest)]"
              >
                <MIcon name="content_copy" size={15} />
                <span>{label}</span>
              </button>
            );
          })}
          <p className="px-2 pb-1 pt-1.5 text-[10px] leading-snug text-[color:var(--text-muted)]">
            Sobrescribe el contenido de la semana destino.
          </p>
        </div>
      ) : null}
    </div>
  );
}

interface MicrocycleHeaderProps {
  month: MicrocycleEditorMonth;
  weeks: MicrocycleEditorWeek[];
  activeWeekIndex: number;
  athletes: MicrocycleEditorAthlete[];
  saveState: StudioToolbarRenderState;
  monthState: MonthSaveState;
  monthName: string;
  setMonthName: (v: string) => void;
  onSelectWeek: (weekIndex: number) => void;
  /** F2 — persiste el nombre pendiente al perder el foco del input. */
  onFlushMonthName: () => void;
  /** F12 — copia el contenido de la semana activa a otra semana del microciclo. */
  onDuplicateWeek: (fromIndex: number, toIndex: number) => void;
  dupBusy: boolean;
  dupError: string | null;
  /** Semana activa con overrides aplicados (spec §3b — herencia). */
  activeWeekEffective: MicrocycleEditorWeek;
  /** Override de metadatos de la semana activa (Ajustes de semana). */
  onPatchActiveWeek: (patch: WeekMetaPatch) => void;
}

function MicrocycleHeader({
  month,
  weeks,
  activeWeekIndex,
  athletes,
  saveState,
  monthState,
  monthName,
  setMonthName,
  onSelectWeek,
  onFlushMonthName,
  onDuplicateWeek,
  dupBusy,
  dupError,
  activeWeekEffective,
  onPatchActiveWeek,
}: MicrocycleHeaderProps) {
  const [assignOpen, setAssignOpen] = useState(false);
  const status = saveStatus(saveState, monthState);
  const phaseLabel = month.atr_block_hint ? atrPhaseLabel(month.atr_block_hint) : null;
  const levelLabel = PROGRAM_LEVEL_LABELS[month.level as ProgramLevel] ?? month.level;

  return (
    <header className="shrink-0 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]">
      {/* Top bar */}
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-2 lg:h-16 lg:flex-nowrap lg:py-0">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link
            href="/programar"
            className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] hover:text-[color:var(--accent)]"
          >
            ← Programar
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 max-w-md">
                <PabloIAInput
                  value={monthName}
                  onChange={(v) => setMonthName(v)}
                  onBlur={onFlushMonthName}
                  surface="template_name"
                  context={{
                    level: month.level,
                    atr_block: month.atr_block_hint ?? undefined,
                  }}
                  placeholder="Nombre microciclo"
                  inputClassName="!py-1.5 font-display text-base font-bold"
                  aria-label="Nombre del microciclo"
                />
              </div>
              {phaseLabel ? (
                <span className="shrink-0 rounded-[var(--r-pill)] border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--accent)]">
                  {phaseLabel}
                </span>
              ) : null}
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                {levelLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-[11px] font-semibold',
              status.tone === 'ok' && 'text-[color:var(--status-success)]',
              status.tone === 'pending' && 'text-[color:var(--status-warning)]',
              status.tone === 'error' && 'text-[color:var(--danger)]',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                status.tone === 'ok' && 'bg-[color:var(--status-success)]',
                status.tone === 'pending' && 'animate-pulse bg-[color:var(--status-warning)]',
                status.tone === 'error' && 'bg-[color:var(--danger)]',
              )}
            />
            {status.text}
          </span>

          <UndoRedoControls
            canUndo={saveState.canUndo}
            canRedo={saveState.canRedo}
            onUndo={saveState.onUndo}
            onRedo={saveState.onRedo}
          />

          <button
            type="button"
            onClick={saveState.onPabloIAWeek}
            title="Pablo IA · generar semana"
            className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[color:var(--accent)]/40 bg-transparent px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[color:var(--accent)] hover:border-[color:var(--accent)] hover:bg-[color:var(--accent)]/10"
          >
            <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className="h-2.5 w-2.5">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="6" cy="6" r="1.6" fill="currentColor" />
            </svg>
            <span>Pablo IA · Semana</span>
          </button>

          {/* Asignar & publicar — abre el AssignFlow único (spec §5) con este
              microciclo preseleccionado. El modal queda montado para que el
              toast de éxito sobreviva a su cierre. */}
          <button
            type="button"
            onClick={() => setAssignOpen(true)}
            aria-haspopup="dialog"
            className="focus-ring inline-flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[color:var(--accent)] px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-[color:var(--accent-on)] hover:brightness-110"
          >
            <MIcon name="send" size={14} />
            Asignar a atleta
          </button>
          <AssignFlow
            open={assignOpen}
            onClose={() => setAssignOpen(false)}
            month_id={month.id}
            athletes={athletes}
          />
        </div>
      </div>

      {/* Pills semanas — scroll horizontal en móvil para no desbordar. */}
      <nav
        className="flex items-center gap-2 overflow-x-auto border-t border-[color:var(--border-subtle)] px-5 py-2 lg:overflow-x-visible"
        aria-label="Semanas del microciclo"
      >
        {weeks.map((w) => {
          const isActive = w.week_index === activeWeekIndex;
          const label =
            w.week_index === 3 ? `Semana ${w.week_index + 1} (deload)` : `Semana ${w.week_index + 1}`;
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => onSelectWeek(w.week_index)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-[var(--r-pill)] border px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors',
                isActive
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--accent-on)]'
                  : 'border-[color:var(--border-subtle)] bg-transparent text-[color:var(--text-muted)] hover:border-[color:var(--accent)]/60 hover:text-[color:var(--fg)]',
              )}
            >
              {label}
            </button>
          );
        })}

        <span aria-hidden className="mx-1 h-4 w-px bg-[color:var(--border-subtle)]" />

        <DuplicateWeekMenu
          weeks={weeks}
          activeWeekIndex={activeWeekIndex}
          busy={dupBusy}
          onDuplicate={(toIndex) => onDuplicateWeek(activeWeekIndex, toIndex)}
        />

        {dupError ? (
          <span role="alert" className="text-[11px] font-semibold text-[color:var(--danger)]">
            {dupError}
          </span>
        ) : null}

        {/* §3b — overrides por semana, colapsados: la herencia es lo normal. */}
        <WeekSettingsDisclosure
          week={{
            level: activeWeekEffective.level,
            atr_block_hint: activeWeekEffective.atr_block_hint,
            focus: activeWeekEffective.focus,
            coach_notes: activeWeekEffective.coach_notes,
          }}
          month={{ level: month.level, atr_block_hint: month.atr_block_hint }}
          weekLabel={
            activeWeekIndex === 3
              ? `Semana ${activeWeekIndex + 1} (deload)`
              : `Semana ${activeWeekIndex + 1}`
          }
          onPatch={onPatchActiveWeek}
          requestSave={saveState.onSave}
        />
      </nav>
    </header>
  );
}

type MonthPatch = {
  name?: string;
  level?: string;
  atr_block_hint?: string | null;
  focus?: string | null;
};

/**
 * Editor de microciclo (mes ≈ 4 semanas).
 *
 * - Header propio con back, nombre editable, badges, save status, "Asignar a atleta".
 * - Pills navegan entre las 4 semanas vía `?week=N` (server re-renderiza).
 * - Cuerpo: reusa `ProgrammingWeekStudio` con `renderToolbar` custom para no duplicar
 *   3-pane / autosave / dnd.
 *
 * El nombre del microciclo se persiste vía `PUT /api/coach/program-months/[id]`
 * con debounce de 500ms; el row devuelto sustituye el state local sin re-fetch
 * de la página.
 */
export function MicrocycleEditor({ month, weeks, activeWeekIndex, athletes }: MicrocycleEditorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [localMonth, setLocalMonth] = useState<MicrocycleEditorMonth>(month);
  const [monthName, setMonthName] = useState(month.name);
  const [monthSaving, setMonthSaving] = useState(false);
  const [monthSaveError, setMonthSaveError] = useState<string | null>(null);
  const [monthSavedFlash, setMonthSavedFlash] = useState(false);
  // Último nombre persistido. Es state (no ref) porque se lee en render para
  // derivar `monthDirty` — un ref leído en render dispara react-hooks/refs.
  const [savedName, setSavedName] = useState(month.name);
  const debounceTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);

  // §3b — overrides de metadatos POR SEMANA ("Ajustes de semana"). Las semanas
  // heredan nivel/fase/objetivo del microciclo; el override vive aquí (keyed
  // por id de semana) y se mergea en la semana activa ANTES de pasarla al
  // studio — así el save del studio (PUT program-weeks) persiste meta + slots
  // en una sola escritura, sin un segundo writer que pueda pisar el board.
  const [weekOverrides, setWeekOverrides] = useState<Record<string, WeekMetaPatch>>({});

  const activeWeek = useMemo(
    () => weeks.find((w) => w.week_index === activeWeekIndex) ?? weeks[0],
    [weeks, activeWeekIndex],
  );

  const activeWeekEffective = useMemo(() => {
    if (!activeWeek) return activeWeek;
    const patch = weekOverrides[activeWeek.id];
    return patch ? { ...activeWeek, ...patch } : activeWeek;
  }, [activeWeek, weekOverrides]);

  const handlePatchActiveWeek = useCallback(
    (patch: WeekMetaPatch) => {
      if (!activeWeek) return;
      setWeekOverrides((prev) => ({
        ...prev,
        [activeWeek.id]: { ...prev[activeWeek.id], ...patch },
      }));
    },
    [activeWeek],
  );

  const runPatch = useCallback(
    async (patch: MonthPatch) => {
      if (Object.keys(patch).length === 0) return;
      inFlightRef.current?.abort();
      const ctrl = new AbortController();
      inFlightRef.current = ctrl;
      setMonthSaving(true);
      setMonthSaveError(null);
      try {
        const res = await fetch(`/api/coach/program-months/${localMonth.id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(err.message ?? 'No se pudo guardar el microciclo');
        }
        const data = (await res.json()) as {
          month: {
            id: string;
            name: string;
            level: string;
            atr_block_hint: string | null;
            focus: string | null;
            updated_at: string;
          };
        };
        const next = data.month;
        setLocalMonth({
          id: next.id,
          name: next.name,
          level: next.level,
          atr_block_hint: next.atr_block_hint,
        });
        setSavedName(next.name);
        setMonthName(next.name);
        setMonthSavedFlash(true);
        if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = window.setTimeout(() => setMonthSavedFlash(false), 1400);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setMonthSaveError(err instanceof Error ? err.message : 'No se pudo guardar el microciclo');
      } finally {
        if (inFlightRef.current === ctrl) inFlightRef.current = null;
        setMonthSaving(false);
      }
    },
    [localMonth.id],
  );

  /**
   * F2 — flush del autosave del nombre. Cancela el debounce pendiente y, si hay
   * cambios sin guardar, dispara el PATCH y espera a que termine. Llamado en el
   * blur del input y ANTES de navegar de semana, para que el cambio del nombre
   * no se pierda al re-renderizar (router.replace ?week=N) ni en un remount.
   */
  const flushMonthName = useCallback(async () => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const trimmed = monthName.trim();
    if (!trimmed || trimmed === savedName) return;
    await runPatch({ name: trimmed });
  }, [monthName, savedName, runPatch]);

  // Navega entre semanas (?week=N). Persiste el nombre pendiente ANTES de
  // navegar (F2) para que el cambio no se pierda en el re-render.
  const handleSelectWeekIndex = useCallback(
    (weekIndex: number) => {
      if (weekIndex === activeWeekIndex) return;
      void flushMonthName().finally(() => {
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        params.set('week', String(weekIndex));
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [activeWeekIndex, flushMonthName, pathname, router, searchParams],
  );

  // F12 — duplicar semana: copia el contenido (slots) de una semana ORIGEN al
  // `slots_json` de otra semana del microciclo (DESTINO), con uids nuevos, vía
  // PUT. Opera sobre el estado PERSISTIDO de las semanas (prop `weeks`); el
  // autosave del studio ya habrá guardado la activa antes de cambiar de semana.
  // Tras copiar, refresca y navega a la semana destino para verla.
  const [dupBusy, setDupBusy] = useState(false);
  const [dupError, setDupError] = useState<string | null>(null);

  const handleDuplicateWeek = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || dupBusy) return;
      const source = weeks.find((w) => w.week_index === fromIndex);
      const destRow = weeks.find((w) => w.week_index === toIndex);
      if (!source || !destRow) return;
      // Respeta overrides locales aún no persistidos de la semana destino.
      const destPatch = weekOverrides[destRow.id];
      const dest = destPatch ? { ...destRow, ...destPatch } : destRow;
      setDupBusy(true);
      setDupError(null);
      try {
        const res = await fetch(`/api/coach/program-weeks/${dest.id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: dest.name,
            level: dest.level,
            atr_block_hint: dest.atr_block_hint,
            focus: dest.focus,
            coach_notes: dest.coach_notes,
            slots_json: cloneWeekSlotsWithNewUids(source.slots_json),
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(err.message ?? 'No se pudo duplicar la semana');
        }
        // Navega a la semana destino y refresca para reflejar el contenido nuevo.
        const params = new URLSearchParams(searchParams?.toString() ?? '');
        params.set('week', String(toIndex));
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        router.refresh();
      } catch (err) {
        setDupError(err instanceof Error ? err.message : 'No se pudo duplicar la semana');
      } finally {
        setDupBusy(false);
      }
    },
    [weeks, weekOverrides, dupBusy, pathname, router, searchParams],
  );

  // Debounce 500ms del nombre.
  useEffect(() => {
    const trimmed = monthName.trim();
    if (!trimmed || trimmed === savedName) return;
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      void runPatch({ name: trimmed });
    }, 500);
    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    };
  }, [monthName, savedName, runPatch]);

  // Cleanup al desmontar.
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      inFlightRef.current?.abort();
    };
  }, []);

  const monthDirty = monthName.trim() !== '' && monthName.trim() !== savedName;
  const monthState: MonthSaveState = {
    saving: monthSaving,
    saveError: monthSaveError,
    savedFlash: monthSavedFlash,
    dirty: monthDirty,
  };

  if (!activeWeek || !activeWeekEffective) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-[color:var(--bg)] p-10">
        <p className="text-sm text-[color:var(--text-muted)]">
          Este microciclo no tiene semanas. Vuelve a la lista de programación.
        </p>
      </div>
    );
  }

  // F14 (opción B): orientación SIN fecha de calendario — posición en el
  // microciclo + fase ATR de la semana. La fecha real vive en publicar (Fase 5).
  const weekNumber = activeWeek.week_index + 1;
  const isDeload = activeWeek.week_index === 3;
  const weekPhase = activeWeekEffective.atr_block_hint
    ? atrPhaseLabel(activeWeekEffective.atr_block_hint)
    : null;
  const weekContextLabel = [
    `Semana ${weekNumber} del microciclo${isDeload ? ' (deload)' : ''}`,
    weekPhase,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ProgrammingWeekStudio
      week={activeWeekEffective}
      weekContextLabel={weekContextLabel}
      renderToolbar={(state) => (
        <MicrocycleHeader
          month={localMonth}
          weeks={weeks}
          activeWeekIndex={activeWeekIndex}
          athletes={athletes}
          saveState={state}
          monthState={monthState}
          monthName={monthName}
          setMonthName={setMonthName}
          onSelectWeek={handleSelectWeekIndex}
          onFlushMonthName={() => void flushMonthName()}
          onDuplicateWeek={(from, to) => void handleDuplicateWeek(from, to)}
          dupBusy={dupBusy}
          dupError={dupError}
          activeWeekEffective={activeWeekEffective}
          onPatchActiveWeek={handlePatchActiveWeek}
        />
      )}
    />
  );
}
