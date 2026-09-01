'use client';

// SuggestWorkoutModal (#33) — "Coach IA redacta el entreno". The coach types the
// FOCUS of a session, picks a mode (Rápido = his library / Completo = the model
// composes) and Coach IA drafts blocks. The coach reviews each block with its FULL
// typed prescription (prescriptionToText — never a summary), selects which to keep,
// can prune individual lines, and inserts them into the session (APPEND, never
// replace). Origin is always honest (biblioteca / IA / respaldo). "Completo" is
// disabled — with a visible reason — when the LLM is not configured; it never fails
// silently. All blocks are converted to the editor's own EditorBlock model, so an
// inserted draft is indistinguishable from a hand-built block.

import { useEffect, useMemo, useState } from 'react';
import { ModalPortal } from './ModalPortal';
import { MIcon } from '@/components/ui/MIcon';
import { ChipGroup } from '@/components/v2/controls/ChipGroup';
import { cn } from '@/lib/utils';
import { prescriptionToText } from '@fahybrid/shared/domain/prescription';
import { weekDayPartsToEditorBlocks } from '@/lib/dashboard/v2/ai-blocks-to-editor';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';
import {
  getLlmConfigured,
  getMethodologyGroups,
  requestSuggestion,
  saveBlockToLibrary,
  SuggestWorkoutError,
  type AiSuggestion,
  type MethodologyGroupOption,
  type ProgramLevel,
  type SuggestMode,
} from './ai-suggest-workout';

const FOCUS_MIN = 2;
const FOCUS_MAX = 400;

const LEVELS: { id: ProgramLevel; label: string }[] = [
  { id: 'beginner', label: 'Inic.' },
  { id: 'intermediate', label: 'Inter.' },
  { id: 'pro', label: 'Pro' },
  { id: 'elite', label: 'Élite' },
];

// Block left-border modality color from its format (same axis as the editor).
function blockColorVar(format: string | null): string {
  switch (format) {
    case 'strength_block':
      return '--v2-mod-fuerza';
    case 'tempo':
    case 'intervals':
      return '--v2-mod-carrera';
    case 'steady':
    case 'test':
      return '--v2-mod-ergo';
    case 'warmup':
    case 'cooldown':
      return '--v2-mod-calentamiento';
    default:
      return '--v2-mod-circuito';
  }
}

// El tono dice DE QUIÉN es el bloque, y usa el mismo idioma de autoría que
// AuthorStamp (el sello canónico): contenido del coach = acento, IA = info,
// respaldo del sistema = aviso.
const SOURCE_META: Record<AiSuggestion['source'], { label: string; tone: string; soft: string; icon: string }> = {
  library: { label: 'De tu biblioteca', tone: '--v2-accent', soft: '--v2-accent-soft', icon: 'inventory_2' },
  llm: { label: 'IA compuesta', tone: '--v2-info', soft: '--v2-info-soft', icon: 'neurology' },
  library_fallback: { label: 'Plantilla de respaldo', tone: '--v2-warn', soft: '--v2-warn-soft', icon: 'undo' },
};

type Phase = 'form' | 'thinking' | 'proposal';

export function SuggestWorkoutModal({
  destinationLabel,
  athleteId,
  defaultLevel = 'pro',
  onClose,
  onInsert,
}: {
  destinationLabel: string;
  athleteId?: string | number;
  defaultLevel?: ProgramLevel;
  onClose: () => void;
  onInsert: (blocks: EditorBlock[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>('form');
  const [focus, setFocus] = useState('');
  const [mode, setMode] = useState<SuggestMode>('fast');
  const [level, setLevel] = useState<ProgramLevel>(defaultLevel);
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [blocks, setBlocks] = useState<EditorBlock[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removedItems, setRemovedItems] = useState<Set<string>>(new Set()); // "blockUid:itemUid"
  const [groups, setGroups] = useState<MethodologyGroupOption[]>([]); // methodology groups for save-to-library

  useEffect(() => {
    let live = true;
    void getLlmConfigured().then((ok) => {
      if (!live) return;
      setLlmConfigured(ok);
      if (!ok) setMode('fast'); // no LLM → only Rápido is real
    });
    return () => {
      live = false;
    };
  }, []);


  const canGenerate = focus.trim().length >= FOCUS_MIN;

  async function generate() {
    if (!canGenerate) return;
    setError(null);
    setPhase('thinking');
    try {
      const s = await requestSuggestion({
        focus: focus.trim(),
        mode,
        level,
        ...(athleteId != null ? { athlete_id: athleteId } : {}),
      });
      const eb = weekDayPartsToEditorBlocks(s.blocks);
      setSuggestion(s);
      setBlocks(eb);
      setSelected(new Set(eb.map((b) => b.uid)));
      setRemovedItems(new Set());
      setPhase('proposal');
      // Composed blocks can be opt-in saved to the library → load the coach's
      // methodology groups for the per-block group picker (once).
      if (s.source === 'llm' && groups.length === 0) {
        void getMethodologyGroups().then(setGroups);
      }
    } catch (e) {
      setError(e instanceof SuggestWorkoutError ? e.message : 'No se pudo redactar el entreno.');
      setPhase('form');
    }
  }

  // The blocks the coach actually inserts: selected, with pruned lines removed.
  const insertBlocks = useMemo(
    () =>
      blocks
        .filter((b) => selected.has(b.uid))
        .map((b) => ({
          ...b,
          items: b.items.filter((it) => !removedItems.has(`${b.uid}:${it.uid}`)),
        })),
    [blocks, selected, removedItems],
  );

  function insert() {
    if (insertBlocks.length === 0) return;
    onInsert(insertBlocks);
    onClose();
  }

  const title = phase === 'thinking' ? 'Redactando…' : phase === 'proposal' ? 'Propuesta' : 'Redactar con IA';

  return (
    // Mientras la IA redacta, Escape se traga (no se cierra a media generación).
    <ModalPortal onEscape={onClose} escapeEnabled={phase !== 'thinking'}>
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[color:var(--v2-scrim)] p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Redactar con IA"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => phase !== 'thinking' && onClose()}
        className="absolute inset-0 -z-10 h-full w-full cursor-default"
        tabIndex={-1}
      />
      <div className="w-full max-w-[480px] overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]">
        {/* header */}
        <div className="flex items-center justify-between gap-2 border-b border-[color:var(--v2-border)] bg-[color:var(--v2-elevated)] px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <h2 className="v2-display text-lg text-[color:var(--v2-fg)]">{title}</h2>
            <span className="truncate text-label text-[color:var(--v2-muted)]">{destinationLabel}</span>
          </div>
          {phase === 'proposal' && suggestion ? <SourceBadge source={suggestion.source} /> : null}
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => phase !== 'thinking' && onClose()}
            disabled={phase === 'thinking'}
            className="v2-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)] disabled:opacity-40"
          >
            <MIcon name="close" size={20} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          {phase === 'form' ? (
            <FormBody
              focus={focus}
              setFocus={setFocus}
              mode={mode}
              setMode={setMode}
              level={level}
              setLevel={setLevel}
              llmConfigured={llmConfigured}
              error={error}
            />
          ) : phase === 'thinking' ? (
            <ThinkingBody mode={mode} focus={focus.trim()} />
          ) : (
            <ProposalBody
              suggestion={suggestion!}
              blocks={blocks}
              selected={selected}
              removedItems={removedItems}
              groups={groups}
              onToggleBlock={(uid) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(uid)) next.delete(uid);
                  else next.add(uid);
                  return next;
                })
              }
              onRemoveItem={(key) => setRemovedItems((prev) => new Set(prev).add(key))}
            />
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-2 border-t border-[color:var(--v2-border)] bg-[color:var(--v2-elevated)] px-4 py-3">
          {phase === 'proposal' ? (
            <>
              <button
                type="button"
                onClick={() => setPhase('form')}
                className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] px-3 text-body font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
              >
                <MIcon name="refresh" size={15} /> Otra
              </button>
              <button
                type="button"
                onClick={insert}
                disabled={insertBlocks.length === 0}
                className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-body font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
              >
                Insertar {insertBlocks.length} bloque{insertBlocks.length === 1 ? '' : 's'}
              </button>
            </>
          ) : (
            <>
              <span className="text-label text-[color:var(--v2-faint)]">Se insertan como bloques editables.</span>
              <button
                type="button"
                onClick={generate}
                disabled={!canGenerate || phase === 'thinking'}
                className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-body font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
              >
                <MIcon name={phase === 'thinking' ? 'progress_activity' : 'draw'} size={16} className={phase === 'thinking' ? 'animate-spin' : undefined} />
                Generar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

function SourceBadge({ source }: { source: AiSuggestion['source'] }) {
  const m = SOURCE_META[source];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--v2-r-pill)] px-2.5 py-1 text-eyebrow font-bold"
      style={{ color: `var(${m.tone})`, background: `var(${m.soft})` }}
    >
      <MIcon name={m.icon} size={12} /> {m.label}
    </span>
  );
}

function FormBody({
  focus,
  setFocus,
  mode,
  setMode,
  level,
  setLevel,
  llmConfigured,
  error,
}: {
  focus: string;
  setFocus: (v: string) => void;
  mode: SuggestMode;
  setMode: (m: SuggestMode) => void;
  level: ProgramLevel;
  setLevel: (l: ProgramLevel) => void;
  llmConfigured: boolean | null;
  error: string | null;
}) {
  const slowOff = llmConfigured === false;
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="v2-micro">Foco de la sesión</span>
        <textarea
          value={focus}
          maxLength={FOCUS_MAX}
          rows={2}
          autoFocus
          onChange={(e) => setFocus(e.target.value)}
          placeholder="p. ej. umbral 5×1000m + fuerza de empuje, 60 min"
          className="v2-focus w-full resize-y rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm leading-relaxed text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="v2-micro">Modo</span>
        <div className="flex gap-2">
          <ModeOption active={mode === 'fast'} big="Rápido" hint="de tu biblioteca" onClick={() => setMode('fast')} />
          <ModeOption
            active={mode === 'slow'}
            big="Completo"
            hint={slowOff ? 'IA pendiente de configurar' : 'la IA compone'}
            disabled={slowOff}
            onClick={() => !slowOff && setMode('slow')}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="v2-micro">
          Nivel <span className="font-medium normal-case text-[color:var(--v2-faint)]">· auto del atleta</span>
        </span>
        <ChipGroup
          options={LEVELS.map((l) => ({ value: l.id, label: l.label }))}
          value={level}
          onChange={setLevel}
          ariaLabel="Nivel"
          mono={false}
        />
      </div>

      {error ? (
        <p role="alert" className="text-xs font-medium text-[color:var(--v2-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ModeOption({
  active,
  big,
  hint,
  disabled,
  onClick,
}: {
  active: boolean;
  big: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'v2-focus flex flex-1 flex-col items-center rounded-[var(--v2-r-s)] border px-2 py-2.5 transition-colors',
        active
          ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
          : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)]',
        disabled && 'cursor-not-allowed opacity-45 hover:border-[color:var(--v2-border)]',
      )}
    >
      <span className="text-xs font-bold">{big}</span>
      <span className="mt-0.5 text-nano font-medium opacity-80">{hint}</span>
    </button>
  );
}

function ThinkingBody({ mode, focus }: { mode: SuggestMode; focus: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-9 text-center">
      <MIcon name="progress_activity" size={34} className="animate-spin text-[color:var(--v2-accent-text)]" />
      <span className="text-body font-bold text-[color:var(--v2-fg)]">
        {mode === 'slow' ? 'Coach IA compone los bloques' : 'Buscando en tu biblioteca'}
      </span>
      <span className="max-w-[36ch] text-label text-[color:var(--v2-muted)]">{focus}</span>
    </div>
  );
}

function ProposalBody({
  suggestion,
  blocks,
  selected,
  removedItems,
  groups,
  onToggleBlock,
  onRemoveItem,
}: {
  suggestion: AiSuggestion;
  blocks: EditorBlock[];
  selected: Set<string>;
  removedItems: Set<string>;
  groups: MethodologyGroupOption[];
  onToggleBlock: (uid: string) => void;
  onRemoveItem: (key: string) => void;
}) {
  // Only composed blocks can be saved to the library (fast-mode ones already are).
  const composed = suggestion.source === 'llm';
  const note =
    suggestion.notes ??
    (suggestion.matched_template ? `Plantilla base: ${suggestion.matched_template.name}. Ajusta lo que quieras tras insertar.` : null);
  return (
    <div className="flex flex-col gap-2.5">
      {note ? (
        <p className="border-l-2 border-[color:var(--v2-border-strong)] pl-2.5 text-label leading-relaxed text-[color:var(--v2-faint)]">
          {note}
        </p>
      ) : null}
      {blocks.length === 0 ? (
        <p className="py-6 text-center text-sm text-[color:var(--v2-faint)]">
          La IA no devolvió bloques. Prueba otro foco o el modo Completo.
        </p>
      ) : (
        blocks.map((b) => {
          const on = selected.has(b.uid);
          return (
            <div
              key={b.uid}
              className={cn(
                'overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] transition-opacity',
                !on && 'opacity-45',
              )}
              style={{ borderLeft: `3px solid var(${blockColorVar(b.format)})` }}
            >
              <button
                type="button"
                onClick={() => onToggleBlock(b.uid)}
                aria-pressed={on}
                className="v2-focus flex w-full items-center gap-2.5 bg-[color:var(--v2-elevated)] px-3 py-2 text-left"
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[var(--v2-r-2xs)] border',
                    on
                      ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                      : 'border-[color:var(--v2-border-strong)]',
                  )}
                >
                  {on ? <MIcon name="check" size={13} /> : null}
                </span>
                <span className="text-body font-bold text-[color:var(--v2-fg)]">{b.title}</span>
                {b.format ? (
                  <span className="rounded-[var(--v2-r-pill)] bg-[color:var(--v2-surface-2)] px-2 py-0.5 text-nano font-bold uppercase tracking-wide text-[color:var(--v2-muted)]">
                    {b.format}
                  </span>
                ) : null}
              </button>
              {b.items.length === 0 ? (
                <p className="px-3 py-2 text-label text-[color:var(--v2-faint)]">
                  Bloque vacío: rellénalo tras insertar.
                </p>
              ) : (
                b.items.map((it) => {
                  const key = `${b.uid}:${it.uid}`;
                  if (removedItems.has(key)) return null;
                  return (
                    <div
                      key={it.uid}
                      className="flex items-baseline gap-2.5 border-t border-[color:var(--v2-border)] px-3 py-1.5"
                    >
                      <span className="min-w-[130px] text-xs font-semibold text-[color:var(--v2-fg)]">
                        {it.exercise_name}
                      </span>
                      <span className="v2-num flex-1 text-label text-[color:var(--v2-muted)]">
                        {prescriptionToText(it.prescription)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(key)}
                        aria-label={`Quitar ${it.exercise_name}`}
                        className="v2-focus shrink-0 text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-danger)]"
                      >
                        <MIcon name="close" size={14} />
                      </button>
                    </div>
                  );
                })
              )}
              {composed && on ? (
                <SaveToLibrary
                  block={{
                    ...b,
                    items: b.items.filter((it) => !removedItems.has(`${b.uid}:${it.uid}`)),
                  }}
                  groups={groups}
                />
              ) : null}
            </div>
          );
        })
      )}
      <p className="mt-1 text-eyebrow leading-relaxed text-[color:var(--v2-faint)]">
        Se añaden al final de la sesión. Edita cargas, ritmos y descansos en el editor tras insertar.
      </p>
    </div>
  );
}

// Opt-in save of ONE composed block to the coach's library (#33 fork e). Never
// automatic — the coach must pick the methodology group (1..10), so a drafted block
// never lands ungrouped in Pablo's curated library. Reuses POST /api/coach/blocks.
function SaveToLibrary({ block, groups }: { block: EditorBlock; groups: MethodologyGroupOption[] }) {
  const [groupId, setGroupId] = useState<number | ''>('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Nothing to save once every line was pruned.
  if (block.items.length === 0) return null;

  async function save() {
    if (groupId === '' || status === 'saving') return;
    setStatus('saving');
    setError(null);
    const res = await saveBlockToLibrary(block, groupId);
    if (res.ok) {
      setStatus('saved');
    } else {
      setError(res.error);
      setStatus('error');
    }
  }

  if (status === 'saved') {
    const name = groups.find((g) => g.id === groupId)?.name ?? 'biblioteca';
    return (
      <div className="flex items-center gap-1.5 border-t border-[color:var(--v2-border)] bg-[color:var(--v2-elevated)] px-3 py-2 text-label font-semibold text-[color:var(--v2-ok)]">
        <MIcon name="check_circle" size={14} /> Guardada en biblioteca · {name}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-[color:var(--v2-border)] bg-[color:var(--v2-elevated)] px-3 py-2">
      <span className="inline-flex items-center gap-1.5 text-eyebrow font-bold uppercase tracking-wide text-[color:var(--v2-muted)]">
        <MIcon name="bookmark_add" size={13} />
        Guardar en biblioteca
      </span>
      <div className="flex items-center gap-2">
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : '')}
          disabled={status === 'saving' || groups.length === 0}
          aria-label="Grupo de metodología"
          className="v2-focus h-8 min-w-0 flex-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2 text-xs text-[color:var(--v2-fg)] focus:border-[color:var(--v2-border-strong)] disabled:opacity-50"
        >
          <option value="">{groups.length === 0 ? 'Cargando grupos…' : 'Elige grupo…'}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void save()}
          disabled={groupId === '' || status === 'saving'}
          className="v2-focus inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2.5 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] disabled:opacity-45"
        >
          <MIcon
            name={status === 'saving' ? 'progress_activity' : 'bookmark_add'}
            size={14}
            className={status === 'saving' ? 'animate-spin' : undefined}
          />
          Guardar
        </button>
      </div>
      {error ? <p className="text-label font-medium text-[color:var(--v2-danger)]">{error}</p> : null}
    </div>
  );
}
