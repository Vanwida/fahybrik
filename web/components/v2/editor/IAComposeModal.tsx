'use client';

// IAComposeModal — "Componer con IA" for the v2 archetype-first editor (SCREEN 5
// session editor + SCREEN 8 day editor). The coach describes the FOCUS of the
// work; Pablo IA proposes a set of blocks (from the coach's library in fast mode,
// or composed by the model in slow mode). The coach previews + selects which
// blocks to insert into the current session/group.
//
// REUSE, NOT REINVENT:
//   · Backend: the SAME real endpoint as V1 — POST /api/coach/ai/suggest-workout
//     (env-gated PABLO_IA_*/LLM_*; heuristic library fallback when unconfigured).
//     No LLM model is chosen here — the model comes from env.
//   · Mapping: the endpoint returns domain WeekDayPart[]; we map them into the
//     editor's EditorBlock[] with the SHARED weekDayPartToEditorBlock (the same
//     one the day-loader uses), so inserted blocks carry a structured Prescription
//     + archetype routing and slot straight into the editor's save path.
//
// AGNOSTIC: no methodology hardcoded. The optional ATR context hint is only
// forwarded when the caller has one; the component never assumes phases.

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { WeekDayPart } from '@fahybrid/shared/schema/program-templates';
import { MIcon } from '@/components/ui/MIcon';
import { SegmentedControl } from '@/components/v2/SegmentedControl';
import { EmptyState } from '@/components/v2/EmptyState';
import { cn } from '@/lib/utils';
import type { EditorBlock, StructureGroup } from '@/lib/dashboard/v2/editor-types';
import { weekDayPartToEditorBlock } from '@/lib/dashboard/v2/part-to-editor-block';
import { blockSummaryLine } from './block-helpers';

// ── Response shape (matches SuggestWorkoutResponse in the AI backend) ─────────
type SuggestSource = 'library' | 'llm' | 'library_fallback';

interface WorkoutSuggestion {
  mode: 'fast' | 'slow';
  source: SuggestSource;
  blocks: WeekDayPart[];
  matched_template?: { id: string; name: string; format: string };
  notes?: string;
}

type GenerationMode = 'fast' | 'slow';

const GENERATION_OPTIONS: ReadonlyArray<{ value: GenerationMode; label: string; help: string }> = [
  { value: 'fast', label: 'Rápida', help: 'Reparto determinista desde tu biblioteca. Instantáneo.' },
  { value: 'slow', label: 'Pablo IA', help: 'El modelo compone los bloques. Más lento; cae a biblioteca si no hay modelo.' },
];

function sourceLabel(s: SuggestSource): string {
  if (s === 'llm') return 'Pablo IA · modelo';
  if (s === 'library_fallback') return 'Biblioteca · fallback';
  return 'Biblioteca · reglas';
}

// Portal mount gate: createPortal needs document.body (absent in SSR). Uses
// useSyncExternalStore with constant server/client snapshots — the lint-clean
// alternative to useEffect(() => setMounted(true)) (avoids set-state-in-effect).
const noopSubscribe = () => () => {};
function usePortalMount(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function IAComposeModal({
  destinationLabel,
  destinationGroup = 'principal',
  atrBlockHint,
  level,
  onInsert,
  onClose,
}: {
  /** e.g. "Sesión AM · Lunes 12" / "Principal" — shown in the header sub-line. */
  destinationLabel: string;
  /** Structure group inserted blocks land in (rail heading). Default principal. */
  destinationGroup?: StructureGroup;
  /** Optional methodology-phase hint (ACC/TRANS/REAL) forwarded to the endpoint. */
  atrBlockHint?: string | null;
  /** Optional athlete/plan level forwarded to the endpoint for library ranking. */
  level?: string | null;
  /** Insert the chosen blocks into the editor (already EditorBlock[]). */
  onInsert: (blocks: EditorBlock[]) => void;
  onClose: () => void;
}) {
  const mounted = usePortalMount();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [focus, setFocus] = useState('');
  const [generationMode, setGenerationMode] = useState<GenerationMode>('fast');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WorkoutSuggestion | null>(null);
  // Mapped editor blocks parallel to result.blocks; selection is by uid.
  const [proposed, setProposed] = useState<EditorBlock[]>([]);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [onClose]);

  const canGenerate = focus.trim().length >= 2 && !loading;
  const hasResult = result != null;

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);
    setProposed([]);
    setSelectedUids(new Set());
    try {
      const res = await fetch('/api/coach/ai/suggest-workout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          focus: focus.trim(),
          mode: generationMode,
          level: normalizeLevel(level),
          atr_block: normalizeAtr(atrBlockHint),
        }),
      });
      const json = (await res.json()) as {
        suggestion?: WorkoutSuggestion;
        error?: { message?: string };
      };
      if (!res.ok || !json.suggestion) {
        throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      }
      const suggestion = json.suggestion;
      // Map the domain parts into editor blocks once (shared mapper), placing
      // them in the destination group so they slot straight into the rail/day.
      const blocks = suggestion.blocks.map((part, i) => ({
        ...weekDayPartToEditorBlock(part, i),
        group: destinationGroup,
      }));
      setResult(suggestion);
      setProposed(blocks);
      setSelectedUids(new Set(blocks.map((b) => b.uid)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setLoading(false);
    }
  }

  function toggle(uid: string) {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function insert(blocks: EditorBlock[]) {
    if (blocks.length === 0) return;
    onInsert(blocks);
    onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]">
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-[color:var(--v2-border)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--v2-accent)]">
              Pablo IA · Componer
            </p>
            <h2 id={titleId} className="v2-display mt-0.5 text-xl">
              Componer con IA
            </h2>
            <p className="v2-micro mt-0.5 truncate">→ {destinationLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block space-y-1.5">
            <span className="v2-micro">Foco de la sesión</span>
            <input
              ref={inputRef}
              type="text"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="Ej: fuerza tren inferior + finisher metabólico"
              className="v2-focus h-10 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]"
            />
          </label>

          <div className="space-y-1.5">
            <span className="v2-micro">Cómo componer</span>
            <SegmentedControl
              options={GENERATION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={generationMode}
              onChange={setGenerationMode}
              ariaLabel="Modo de composición"
            />
            <p className="text-[11px] leading-snug text-[color:var(--v2-muted)]">
              {GENERATION_OPTIONS.find((o) => o.value === generationMode)?.help}
            </p>
          </div>

          {atrBlockHint || level ? (
            <p className="v2-micro">
              Contexto: {level ?? '—'} · {atrBlockHint ?? '—'}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="v2-focus inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 py-2.5 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-40"
          >
            <MIcon name={loading ? 'progress_activity' : 'auto_awesome'} size={17} />
            {loading ? 'Generando…' : hasResult ? 'Regenerar' : 'Generar propuesta'}
          </button>

          {error ? (
            <p className="flex items-start gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-danger,#c0362c)]/40 bg-[color:var(--v2-danger,#c0362c)]/10 px-3 py-2 text-xs text-[color:var(--v2-danger,#c0362c)]">
              <MIcon name="error" size={14} className="mt-px shrink-0" />
              {error}
            </p>
          ) : null}

          {result ? (
            <Proposal
              result={result}
              blocks={proposed}
              selectedUids={selectedUids}
              onToggle={toggle}
            />
          ) : null}
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-2 border-t border-[color:var(--v2-border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="v2-focus rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-4 py-2 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:bg-[color:var(--v2-surface-2)]"
          >
            Descartar
          </button>
          <button
            type="button"
            onClick={() => insert(proposed.filter((b) => selectedUids.has(b.uid)))}
            disabled={selectedUids.size === 0}
            className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 py-2 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-40"
          >
            Insertar ({selectedUids.size})
            <MIcon name="arrow_forward" size={16} />
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ── Proposal preview — pick which proposed blocks to insert ───────────────────
function Proposal({
  result,
  blocks,
  selectedUids,
  onToggle,
}: {
  result: WorkoutSuggestion;
  blocks: EditorBlock[];
  selectedUids: Set<string>;
  onToggle: (uid: string) => void;
}) {
  if (blocks.length === 0) {
    return (
      <EmptyState
        icon="auto_awesome"
        title="Sin bloques propuestos"
        description="No se han generado bloques. Prueba a reformular el foco o cambia el modo."
      />
    );
  }
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--v2-muted)]">
        <span className="inline-flex items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] px-2 py-0.5 font-semibold">
          {sourceLabel(result.source)}
        </span>
        {result.matched_template ? <span>← {result.matched_template.name}</span> : null}
        <span className="v2-num">· {blocks.length} bloques</span>
      </div>
      {result.notes ? (
        <p className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-[11px] leading-snug text-[color:var(--v2-muted)]">
          {result.notes}
        </p>
      ) : null}
      <ul className="space-y-1.5">
        {blocks.map((b) => {
          const selected = selectedUids.has(b.uid);
          return (
            <li key={b.uid}>
              <button
                type="button"
                onClick={() => onToggle(b.uid)}
                aria-pressed={selected}
                className={cn(
                  'v2-focus flex w-full items-start gap-2.5 rounded-[var(--v2-r-m)] border px-3 py-2.5 text-left transition-colors',
                  selected
                    ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)]'
                    : 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] hover:border-[color:var(--v2-border-strong)]',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border',
                    selected
                      ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                      : 'border-[color:var(--v2-border-strong)]',
                  )}
                >
                  {selected ? <MIcon name="check" size={12} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[color:var(--v2-fg)]">
                    {b.title}{' '}
                    <span className="v2-num text-[10px] font-normal uppercase tracking-wider text-[color:var(--v2-muted)]">
                      {b.format ?? 'bloque'}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[color:var(--v2-muted)]">
                    {blockSummaryLine(b)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Normalizers (only forward values the endpoint accepts) ────────────────────
function normalizeLevel(
  level?: string | null,
): 'beginner' | 'intermediate' | 'pro' | 'elite' | undefined {
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
