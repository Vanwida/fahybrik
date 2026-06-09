'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  BlockUseModifiers,
  WeekDay,
  WeekDayPart,
} from '@fahybrid/shared/schema/program-templates';
import { applyModifiersToBlockPart, modifiersSummary } from '@/lib/dashboard/programming/block-to-part';
import { usePortalMount } from '@/lib/dashboard/programming/use-portal-mount';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Tipos de payload — replican el shape de las respuestas server.
// ---------------------------------------------------------------------------

interface WorkoutSuggestion {
  mode: 'fast' | 'slow';
  source: 'library' | 'llm' | 'library_fallback';
  blocks: WeekDayPart[];
  matched_template?: { id: string; name: string; format: string };
  notes?: string;
}

interface WeekSuggestion {
  mode: 'fast' | 'slow';
  source: 'library' | 'llm' | 'library_fallback';
  name: string;
  focus: string;
  days: Array<WeekDay & { preview_label?: string }>;
  /** Bloques reales referenciados (trazabilidad — la IA nunca inventa). */
  matched_blocks?: Array<{
    day_of_week: number;
    block_id: number;
    block_title: string;
    methodology_group_id: number;
  }>;
  rest_days: number[];
  notes?: string;
}

export type PabloIAComposeMode =
  | { kind: 'day'; day_of_week: number; session_index: number }
  | { kind: 'week' };

interface CommonProps {
  open: boolean;
  mode: PabloIAComposeMode;
  atrBlockHint?: string | null;
  level?: string | null;
  /** Inserta bloques en un día (mode 'day'). */
  onAcceptBlocks?: (blocks: WeekDayPart[]) => void;
  /** Inserta una semana entera (mode 'week') sustituyendo slots_json. */
  onAcceptWeek?: (days: WeekDay[]) => void;
  onClose: () => void;
}

const DAY_LABELS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// ---------------------------------------------------------------------------
// Portal helper
// ---------------------------------------------------------------------------

function ModalShell({
  children,
  onClose,
  labelledById,
}: {
  children: React.ReactNode;
  onClose: () => void;
  labelledById: string;
}) {
  const mounted = usePortalMount();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledById}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] shadow-2xl">
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PabloIAComposeModal(props: CommonProps) {
  const { open, mode, onClose, atrBlockHint, level, onAcceptBlocks, onAcceptWeek } = props;
  const titleId = useId();
  const [focus, setFocus] = useState('');
  // Heurístico (reglas, determinista) vs LLM (modelo Pablo IA, si está
  // configurado). Único toggle que queda — todo lo demás compone SIEMPRE desde
  // la biblioteca de bloques (Documento Maestro), sin alternativa de templates.
  const [generationMode, setGenerationMode] = useState<'fast' | 'slow'>('fast');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workoutResult, setWorkoutResult] = useState<WorkoutSuggestion | null>(null);
  // El preview de SEMANA es editable: trabajamos sobre una copia mutable de los
  // días (ajustar modificadores / quitar bloques) ANTES de aceptar.
  const [weekDraft, setWeekDraft] = useState<WeekSuggestion | null>(null);
  const [selectedBlockUids, setSelectedBlockUids] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset al abrir (transición closed→open) usando el patrón de "ajustar estado
  // en render" de React: comparamos el `open` anterior guardado en state y, si
  // acaba de pasar a abierto, reseteamos síncronamente DURANTE el render. Esto
  // evita el setState-en-effect (cascada de renders) y deja el form limpio en el
  // mismo paint en que se abre.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setFocus('');
      setGenerationMode('fast');
      setError(null);
      setWorkoutResult(null);
      setWeekDraft(null);
      setSelectedBlockUids(new Set());
    }
  }

  // Foco del input al abrir (efecto DOM legítimo, no estado derivado).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setWorkoutResult(null);
    setWeekDraft(null);
    try {
      if (mode.kind === 'day') {
        const res = await fetch('/api/coach/ai/suggest-workout', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            focus: focus.trim(),
            mode: generationMode,
            level: normalizeLevel(level),
            atr_block: normalizeAtr(atrBlockHint),
          }),
        });
        const json = (await res.json()) as { suggestion?: WorkoutSuggestion; error?: { message?: string } };
        if (!res.ok || !json.suggestion) {
          throw new Error(json.error?.message ?? `HTTP ${res.status}`);
        }
        setWorkoutResult(json.suggestion);
        setSelectedBlockUids(new Set(json.suggestion.blocks.map((b) => b.uid)));
      } else {
        // Semana: SIEMPRE desde la biblioteca de bloques (sin toggle templates).
        const res = await fetch('/api/coach/ai/suggest-week-from-blocks', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            focus: focus.trim(),
            mode: generationMode,
            level: normalizeLevel(level),
            atr_block: normalizeAtr(atrBlockHint),
          }),
        });
        const json = (await res.json()) as { suggestion?: WeekSuggestion; error?: { message?: string } };
        if (!res.ok || !json.suggestion) {
          throw new Error(json.error?.message ?? `HTTP ${res.status}`);
        }
        setWeekDraft(json.suggestion);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setLoading(false);
    }
  }

  function toggleBlock(uid: string) {
    setSelectedBlockUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  // --- Edición del preview de semana (antes de aceptar) --------------------

  /** Reemplaza un part dentro del día dado por su versión editada. */
  function patchWeekPart(dow: number, uid: string, nextPart: WeekDayPart) {
    setWeekDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((d) =>
          d.day_of_week === dow
            ? {
                ...d,
                sessions: d.sessions.map((s) => ({
                  ...s,
                  blocks: (s.blocks ?? []).map((b) => (b.uid === uid ? nextPart : b)),
                })),
              }
            : d,
        ),
      };
    });
  }

  /** Quita un bloque del día. Si el día se queda sin bloques → descanso. */
  function removeWeekPart(dow: number, uid: string) {
    setWeekDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        days: prev.days.map((d) => {
          if (d.day_of_week !== dow) return d;
          const sessions = d.sessions
            .map((s) => ({ ...s, blocks: (s.blocks ?? []).filter((b) => b.uid !== uid) }))
            .filter((s) => (s.blocks ?? []).length > 0);
          return { ...d, sessions };
        }),
      };
    });
  }

  function handleAcceptAll() {
    if (mode.kind === 'day' && workoutResult) {
      onAcceptBlocks?.(workoutResult.blocks);
      onClose();
    } else if (mode.kind === 'week' && weekDraft) {
      // Strip preview_label antes de devolver (los modificadores ya van
      // aplicados en cada part — aceptar inserta la semana ya ajustada).
      const cleaned: WeekDay[] = weekDraft.days.map((d) => {
        const { preview_label: _pl, ...rest } = d;
        void _pl;
        return rest;
      });
      onAcceptWeek?.(cleaned);
      onClose();
    }
  }

  function handleAcceptSelection() {
    if (mode.kind === 'day' && workoutResult) {
      const picked = workoutResult.blocks.filter((b) => selectedBlockUids.has(b.uid));
      if (picked.length === 0) return;
      onAcceptBlocks?.(picked);
      onClose();
    }
  }

  const canGenerate = focus.trim().length >= 2 && !loading;
  const hasResult = workoutResult != null || weekDraft != null;
  const weekHasBlocks =
    weekDraft != null &&
    weekDraft.days.some((d) => d.sessions.some((s) => (s.blocks ?? []).length > 0));

  return (
    <ModalShell onClose={onClose} labelledById={titleId}>
      <header className="flex items-start justify-between gap-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--accent)]">
            Pablo IA · Compose
          </p>
          <h2
            id={titleId}
            className="mt-0.5 font-display text-lg font-bold leading-tight text-[color:var(--fg)]"
          >
            {mode.kind === 'day'
              ? `Ayuda para ${DAY_LABELS[mode.day_of_week] ?? 'el día'}`
              : 'Generar semana entera'}
          </h2>
          <p className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
            {mode.kind === 'day'
              ? 'Describe el foco — IA propone bloques, tú decides qué insertar.'
              : 'IA selecciona y adapta bloques de tu biblioteca. Ajústalos aquí antes de aceptar.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="focus-ring rounded-[var(--r-sm)] p-1 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container-highest)] hover:text-[color:var(--fg)]"
        >
          ✕
        </button>
      </header>

      <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
              {mode.kind === 'day' ? 'Foco del día' : 'Foco de la semana'}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder={
                mode.kind === 'day'
                  ? 'Ej: fuerza tren inferior + finisher metabólico'
                  : 'Ej: acumulación volumen + 1 sim HYROX corta'
              }
              className="focus-ring w-full rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-3 py-2 text-sm text-[color:var(--fg)] outline-none focus:border-[color:var(--accent)]"
            />
          </label>

          <GenerationModeToggle value={generationMode} onChange={setGenerationMode} />

          {(atrBlockHint || level) && (
            <p className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
              Contexto: {level ?? '—'} · {atrBlockHint ?? '—'}
            </p>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-[var(--r-sm)] bg-[color:var(--accent)] px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--on-primary-container)] transition-colors hover:brightness-110 disabled:opacity-40"
          >
            {loading ? 'Generando…' : hasResult ? 'Regenerar' : 'Generar'}
          </button>

          {error ? (
            <p className="rounded-[var(--r-sm)] border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/8 px-3 py-2 text-xs text-[color:var(--danger)]">
              {error}
            </p>
          ) : null}

          {workoutResult ? (
            <WorkoutPreview
              result={workoutResult}
              selectedUids={selectedBlockUids}
              onToggle={toggleBlock}
            />
          ) : null}
          {weekDraft ? (
            <WeekPreview
              result={weekDraft}
              onPatchPart={patchWeekPart}
              onRemovePart={removeWeekPart}
            />
          ) : null}
        </div>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="focus-ring rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] px-3 py-2 text-[11px] font-bold uppercase text-[color:var(--fg)] hover:bg-[color:var(--surface-container-highest)]"
        >
          Descartar
        </button>
        <div className="flex items-center gap-2">
          {mode.kind === 'day' && workoutResult ? (
            <button
              type="button"
              onClick={handleAcceptSelection}
              disabled={selectedBlockUids.size === 0}
              className="focus-ring rounded-[var(--r-sm)] border border-[color:var(--accent)] px-3 py-2 text-[11px] font-bold uppercase text-[color:var(--accent)] hover:bg-[color:var(--accent)]/10 disabled:opacity-40"
            >
              Insertar selección ({selectedBlockUids.size})
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleAcceptAll}
            disabled={mode.kind === 'week' ? !weekHasBlocks : !hasResult}
            className="focus-ring rounded-[var(--r-sm)] bg-[color:var(--accent)] px-4 py-2 text-[11px] font-bold uppercase text-[color:var(--on-primary-container)] hover:brightness-110 disabled:opacity-40"
          >
            {mode.kind === 'day' ? 'Insertar todo' : 'Sustituir semana'}
          </button>
        </div>
      </footer>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Generation mode toggle — heurístico (reglas) vs LLM (modelo)
// ---------------------------------------------------------------------------

function GenerationModeToggle({
  value,
  onChange,
}: {
  value: 'fast' | 'slow';
  onChange: (v: 'fast' | 'slow') => void;
}) {
  const options: Array<{ key: 'fast' | 'slow'; label: string; help: string }> = [
    { key: 'fast', label: 'Rápida (reglas)', help: 'Reparto determinista por fase ATR. Instantáneo.' },
    { key: 'slow', label: 'Pablo IA (modelo)', help: 'El modelo elige y ordena los bloques. Más lento.' },
  ];
  const active = options.find((o) => o.key === value)!;
  return (
    <div>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
        Cómo componer
      </span>
      <div
        role="radiogroup"
        aria-label="Modo de composición"
        className="inline-flex rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] p-0.5"
      >
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={value === o.key}
            onClick={() => onChange(o.key)}
            className={cn(
              'focus-ring rounded-[calc(var(--r-sm)-2px)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors',
              value === o.key
                ? 'bg-[color:var(--accent)] text-[color:var(--on-primary-container)]'
                : 'text-[color:var(--text-muted)] hover:text-[color:var(--fg)]',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-[color:var(--text-muted)]">{active.help}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day preview (insert blocks into a single day) — selección read-only
// ---------------------------------------------------------------------------

function WorkoutPreview({
  result,
  selectedUids,
  onToggle,
}: {
  result: WorkoutSuggestion;
  selectedUids: Set<string>;
  onToggle: (uid: string) => void;
}) {
  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
        <span className="rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] px-2 py-0.5">
          {sourceLabel(result.source)}
        </span>
        {result.matched_template ? <span>← {result.matched_template.name}</span> : null}
      </div>
      {result.notes ? <PreviewNote>{result.notes}</PreviewNote> : null}
      <ul className="space-y-1.5">
        {result.blocks.map((b) => {
          const selected = selectedUids.has(b.uid);
          return (
            <li key={b.uid}>
              <button
                type="button"
                onClick={() => onToggle(b.uid)}
                className={cn(
                  'focus-ring flex w-full items-start gap-2 rounded-[var(--r-sm)] border px-3 py-2 text-left transition-colors',
                  selected
                    ? 'border-[color:var(--accent)] bg-[color:var(--accent)]/8'
                    : 'border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] hover:bg-[color:var(--surface-container-highest)]',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border',
                    selected
                      ? 'border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--on-primary-container)]'
                      : 'border-[color:var(--border-subtle)]',
                  )}
                >
                  {selected ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[color:var(--fg)]">
                    {b.title}{' '}
                    <span className="text-[10px] font-normal uppercase tracking-wider text-[color:var(--text-muted)]">
                      {b.format}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
                    {b.items.length === 0
                      ? 'Sin ejercicios — añadir manualmente'
                      : b.items
                          .slice(0, 5)
                          .map((it) => it.exercise_name)
                          .join(' · ') + (b.items.length > 5 ? ` +${b.items.length - 5}` : '')}
                  </p>
                  {b.coach_note ? (
                    <p className="mt-1 text-[10px] italic text-[color:var(--text-muted)]">
                      “{b.coach_note}”
                    </p>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week preview — EDITABLE: ajustar modificadores / quitar bloques por día
// ---------------------------------------------------------------------------

function WeekPreview({
  result,
  onPatchPart,
  onRemovePart,
}: {
  result: WeekSuggestion;
  onPatchPart: (dow: number, uid: string, part: WeekDayPart) => void;
  onRemovePart: (dow: number, uid: string) => void;
}) {
  const blockCount = result.days.reduce(
    (n, d) => n + d.sessions.reduce((m, s) => m + (s.blocks ?? []).length, 0),
    0,
  );
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
        <span className="rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] px-2 py-0.5">
          {sourceLabel(result.source)}
        </span>
        <span>· {blockCount} bloques</span>
      </div>
      {result.notes ? <PreviewNote>{result.notes}</PreviewNote> : null}
      <ul className="space-y-1.5">
        {result.days.map((d) => {
          const dayBlocks = d.sessions.flatMap((s) => s.blocks ?? []);
          const isRest = dayBlocks.length === 0;
          return (
            <li
              key={d.day_of_week}
              className="rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-[11px] font-bold uppercase text-[color:var(--text-muted)]">
                  {DAY_LABELS[d.day_of_week]}
                </span>
                {d.focus ? (
                  <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                    {d.focus}
                  </span>
                ) : isRest ? (
                  <span className="text-sm font-semibold text-[color:var(--text-muted)]">Descanso</span>
                ) : null}
              </div>
              {dayBlocks.length > 0 ? (
                <div className="mt-1.5 space-y-1.5 pl-8">
                  {dayBlocks.map((part) => (
                    <EditableBlockRow
                      key={part.uid}
                      part={part}
                      onChange={(next) => onPatchPart(d.day_of_week, part.uid, next)}
                      onRemove={() => onRemovePart(d.day_of_week, part.uid)}
                    />
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] text-[color:var(--text-muted)]">
        Ajusta intensidad/duración/rondas o quita bloques aquí. Al sustituir, la semana se inserta ya ajustada (editable después).
      </p>
    </div>
  );
}

/** Fila de un bloque en el preview de semana — editable inline. */
function EditableBlockRow({
  part,
  onChange,
  onRemove,
}: {
  part: WeekDayPart;
  onChange: (part: WeekDayPart) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const mods = part.block_modifiers ?? {};

  // Descripción verbatim = todo lo anterior al separador de modificadores.
  const description = useMemo(() => {
    const sepIndex = (part.coach_note ?? '').indexOf('\n\n— ');
    return sepIndex >= 0 ? (part.coach_note ?? '').slice(0, sepIndex) : (part.coach_note ?? '');
  }, [part.coach_note]);

  const summary = modifiersSummary(mods);

  const patchMod = (patch: Partial<BlockUseModifiers>) => {
    const next: BlockUseModifiers = { ...mods, ...patch };
    (Object.keys(next) as (keyof BlockUseModifiers)[]).forEach((k) => {
      const v = next[k];
      if (v == null || v === '' || (typeof v === 'number' && Number.isNaN(v))) delete next[k];
    });
    onChange(applyModifiersToBlockPart(part, next));
  };

  return (
    <div className="rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-2.5 py-2">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="focus-ring min-w-0 flex-1 rounded-[var(--r-sm)] text-left"
        >
          <p className="truncate text-sm font-semibold text-[color:var(--fg)]">
            {part.title}{' '}
            <span className="text-[10px] font-normal uppercase tracking-wider text-[color:var(--text-muted)]">
              {part.format}
            </span>
          </p>
          {summary ? (
            <p className="mt-0.5 text-[10px] text-[color:var(--accent)]">{summary}</p>
          ) : (
            <p className="mt-0.5 text-[10px] text-[color:var(--text-muted)]">
              {expanded ? 'Ajusta los modificadores ↓' : 'Sin modificadores · toca para ajustar'}
            </p>
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${part.title}`}
          className="focus-ring shrink-0 rounded-[var(--r-sm)] px-1.5 py-0.5 text-[color:var(--text-muted)] hover:bg-[color:var(--danger)]/10 hover:text-[color:var(--danger)]"
        >
          ✕
        </button>
      </div>

      {expanded ? (
        <div className="mt-2 space-y-2 border-t border-[color:var(--border-subtle)] pt-2">
          {description ? (
            <p className="whitespace-pre-wrap text-[10px] leading-relaxed text-[color:var(--text-muted)]">
              {description}
            </p>
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            <NumberField
              label="Intensidad %"
              value={mods.intensity_pct ?? null}
              min={0}
              max={200}
              onChange={(v) => patchMod({ intensity_pct: v ?? undefined })}
            />
            <NumberField
              label="Duración min"
              value={mods.duration_min ?? null}
              min={1}
              max={600}
              onChange={(v) => patchMod({ duration_min: v ?? undefined })}
            />
            <NumberField
              label="Rondas"
              value={mods.rounds ?? null}
              min={1}
              max={60}
              onChange={(v) => patchMod({ rounds: v ?? undefined })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Input numérico controlado que emite `null` cuando se vacía. */
function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  onChange: (v: number | null) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="block">
      <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
        {label}
      </span>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value ?? ''}
        min={min}
        max={max}
        placeholder="—"
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(null);
          const n = Number(raw);
          if (Number.isNaN(n)) return;
          onChange(Math.min(max, Math.max(min, Math.round(n))));
        }}
        className="focus-ring w-full rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-2 py-1.5 text-xs text-[color:var(--fg)] outline-none placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent)]"
      />
    </label>
  );
}

function PreviewNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-3 py-2 text-[11px] text-[color:var(--text-muted)]">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function sourceLabel(s: WorkoutSuggestion['source']): string {
  if (s === 'llm') return 'Pablo IA · modelo';
  if (s === 'library_fallback') return 'Biblioteca · fallback';
  return 'Biblioteca · reglas';
}

function normalizeLevel(level?: string | null): 'beginner' | 'intermediate' | 'pro' | 'elite' | undefined {
  if (!level) return undefined;
  const lc = level.toLowerCase();
  if (lc === 'beginner' || lc === 'intermediate' || lc === 'pro' || lc === 'elite') return lc;
  return undefined;
}

function normalizeAtr(atr?: string | null): 'ACC' | 'TRANS' | 'REAL' | undefined {
  if (!atr) return undefined;
  const uc = atr.toUpperCase();
  if (uc === 'ACC' || uc === 'TRANS' || uc === 'REAL') return uc;
  return undefined;
}
