'use client';

// ImportWorkoutsDialog — #28 importer entry point, inside the microciclo screen.
// TWO phases in one overlay:
//   · FORM  — source (upload xlsx OR paste a day) + a natural-language RANGE +
//             the variant selector (Estándar / Foco fuerza / Foco resistencia,
//             Fork D) → "Extraer y revisar" POSTs /proposal (saves nothing).
//   · REVIEW — the weeks×days grid (ImportReviewGrid) where the coach fixes the
//             amber/red days, maps each imported week to a container week and
//             picks WHAT gets imported (per-day / per-week exclusion), then
//             "Confirmar" POSTs /confirm (the only write). Nothing untyped,
//             unresolved or excluded is ever sent — the grid gates the confirm
//             button and buildConfirmBody drops the excluded days/weeks.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import {
  buildConfirmBody,
  buildReviewModel,
  type MicroWeekRef,
  type ReviewWeek,
} from '@/lib/dashboard/v2/import-review';
import type { ImportProposal } from '@/lib/import/build-proposal';
import { looksLikeInstruction } from '@/lib/import/instruction-detect';
import { getLlmConfigured } from '@/components/v2/editor/ai-suggest-workout';
import { DAY_LABELS_FULL } from '@/lib/dashboard/constants/calendar';
import { ImportReviewGrid } from './ImportReviewGrid';

type ImportVariant = 'estandar' | 'fuerza' | 'resistencia';
type SourceMode = 'file' | 'paste' | 'generate';
type Phase = 'form' | 'review';

const VARIANTS: { value: ImportVariant; label: string }[] = [
  { value: 'estandar', label: 'Estándar' },
  { value: 'fuerza', label: 'Foco fuerza' },
  { value: 'resistencia', label: 'Foco resistencia' },
];

const SOURCE_LABEL: Record<SourceMode, string> = {
  file: 'Subir Excel',
  paste: 'Pegar texto',
  generate: 'Generar con IA',
};

/** Container-week picker — shared by the paste (day) and generate (whole week) flows. */
function WeekSelect({
  microWeeks,
  value,
  onChange,
  ariaLabel = 'Semana del microciclo',
}: {
  microWeeks: MicroWeekRef[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm font-semibold text-[color:var(--v2-fg)] outline-none focus:border-[color:var(--v2-accent)]"
    >
      {microWeeks.length === 0 ? (
        <option value="">— sin semanas —</option>
      ) : (
        microWeeks.map((mw) => (
          <option key={mw.id} value={mw.id}>
            Semana {mw.index + 1}
            {mw.label ? ` · ${mw.label}` : ''}
          </option>
        ))
      )}
    </select>
  );
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function ImportWorkoutsDialog({
  microcycleId,
  microWeeks,
  onClose,
  onDone,
}: {
  microcycleId: string;
  microWeeks: MicroWeekRef[];
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('form');
  const [variant, setVariant] = useState<ImportVariant>('estandar');
  const [rangeText, setRangeText] = useState('');
  const [sourceMode, setSourceMode] = useState<SourceMode>('file');
  const [xlsxBase64, setXlsxBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState('');
  // Paste-flow destination: ONE concrete day = a container week + a weekday. The
  // week defaults to the microcycle's first week; the coach adjusts either select.
  // The GENERATE flow reuses `pasteWeekId` — it targets one WHOLE week, no weekday.
  const [pasteWeekId, setPasteWeekId] = useState<string>(microWeeks[0]?.id ?? '');
  const [pasteWeekday, setPasteWeekday] = useState<number>(1);
  // Generate-flow (#48): the coach's natural-language week focus.
  const [generateFocus, setGenerateFocus] = useState('');
  // Shown when a pasted block reads like an instruction (steer to "Generar con IA").
  const [pasteInstructionHint, setPasteInstructionHint] = useState(false);
  // null = unknown (loading); false disables the AI tab (LLM not configured yet).
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null);

  const [extracting, setExtracting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [reviewWeeks, setReviewWeeks] = useState<ReviewWeek[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Whether the coach-IA LLM is configured — gates the "Generar con IA" tab, the
  // same global flag the SuggestWorkoutModal's "Completo" mode reads.
  useEffect(() => {
    let live = true;
    void getLlmConfigured().then((ok) => {
      if (live) setLlmConfigured(ok);
    });
    return () => {
      live = false;
    };
  }, []);

  const selectSource = (m: SourceMode) => {
    setSourceMode(m);
    setPasteInstructionHint(false);
    setFormError(null);
  };

  // Steer a mis-pasted instruction into the AI tab, carrying the typed text over.
  const switchToGenerateWithText = () => {
    setGenerateFocus(pastedText);
    setSourceMode('generate');
    setPasteInstructionHint(false);
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result ?? '');
      const comma = res.indexOf(',');
      setXlsxBase64(comma >= 0 ? res.slice(comma + 1) : '');
    };
    reader.readAsDataURL(f);
  };

  const canExtract =
    !extracting &&
    (sourceMode === 'paste'
      ? pastedText.trim().length > 0 && pasteWeekId.length > 0
      : sourceMode === 'generate'
        ? generateFocus.trim().length >= 2 && pasteWeekId.length > 0 && llmConfigured === true
        : rangeText.trim().length > 0);

  const extract = async () => {
    if (!canExtract) return;
    // Instruction guard (#48): a pasted INSTRUCTION would mis-parse as a session.
    // Detect it BEFORE hitting the parser and steer the coach to "Generar con IA".
    if (sourceMode === 'paste' && looksLikeInstruction(pastedText)) {
      setPasteInstructionHint(true);
      return;
    }
    setExtracting(true);
    setFormError(null);
    try {
      // PASTE = one day → the pasted session + its destination weekday. GENERATE =
      // a focus → the LLM composes a whole week (server routes it through the same
      // proposal). EXCEL = a week range. All three land in the review model below.
      const body =
        sourceMode === 'paste'
          ? {
              microcycle_id: Number(microcycleId),
              variant: 'estandar' as const,
              pasted_text: pastedText,
              target_weekday: pasteWeekday,
            }
          : sourceMode === 'generate'
            ? {
                microcycle_id: Number(microcycleId),
                mode: 'generate' as const,
                focus: generateFocus.trim(),
              }
            : {
                microcycle_id: Number(microcycleId),
                variant,
                range_text: rangeText.trim(),
                ...(xlsxBase64 ? { xlsx_base64: xlsxBase64 } : {}),
              };
      const res = await fetch('/api/coach/import/proposal', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setFormError(
          await readErrorMessage(
            res,
            sourceMode === 'generate'
              ? 'No se pudo generar la semana.'
              : 'No se pudo extraer la propuesta.',
          ),
        );
        return;
      }
      const proposal = (await res.json()) as ImportProposal;
      const model = buildReviewModel(proposal, microWeeks);
      // Paste and generate both yield ONE imported "week"; map it onto the
      // container week the coach picked (default mapping would land it on the
      // first week) and label it to match.
      if ((sourceMode === 'paste' || sourceMode === 'generate') && model[0]) {
        model[0].target_week_id = pasteWeekId;
        const mw = microWeeks.find((w) => w.id === pasteWeekId);
        if (mw) model[0].week = mw.index + 1;
      }
      setReviewWeeks(model);
      setConfirmError(null);
      setPhase('review');
    } catch {
      setFormError('No se pudo conectar. Inténtalo de nuevo.');
    } finally {
      setExtracting(false);
    }
  };

  const confirm = async () => {
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch('/api/coach/import/confirm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildConfirmBody(microcycleId, reviewWeeks)),
      });
      if (!res.ok) {
        setConfirmError(await readErrorMessage(res, 'No se pudo confirmar la importación.'));
        return;
      }
      router.refresh();
      onDone();
    } catch {
      setConfirmError('No se pudo conectar. Inténtalo de nuevo.');
    } finally {
      setConfirming(false);
    }
  };

  const isReview = phase === 'review';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[color:var(--v2-scrim)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Importar entrenos"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]',
          isReview ? 'h-[min(90vh,900px)] max-w-[1080px]' : 'max-w-md',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[color:var(--v2-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="v2-display text-xl">Importar entrenos</h2>
            <p className="v2-micro mt-0.5">
              {isReview
                ? 'Revisa y elige qué entra — nada se guarda sin ejercicio del catálogo'
                : 'Del Excel de tu metodología a este microciclo, tipado'}
            </p>
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

        {isReview ? (
          <ImportReviewGrid
            reviewWeeks={reviewWeeks}
            microWeeks={microWeeks}
            onChange={setReviewWeeks}
            onConfirm={confirm}
            confirming={confirming}
            error={confirmError}
            onBack={() => setPhase('form')}
          />
        ) : (
          <div className="space-y-4 overflow-y-auto p-5">
            {/* Source toggle */}
            <div className="inline-flex rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] p-0.5">
              {(['file', 'paste', 'generate'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => selectSource(m)}
                  className={cn(
                    'v2-focus rounded-[calc(var(--v2-r-s)-2px)] px-3 py-1.5 text-[12px] font-semibold transition-colors',
                    sourceMode === m
                      ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                      : 'text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
                  )}
                >
                  {SOURCE_LABEL[m]}
                </button>
              ))}
            </div>

            {sourceMode === 'file' ? (
              <div className="space-y-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="v2-focus flex w-full items-center gap-2 rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-3 text-left text-sm text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-accent)]"
                >
                  <MIcon name="upload_file" size={18} className="text-[color:var(--v2-accent)]" />
                  <span className="min-w-0 flex-1 truncate">
                    {fileName ?? 'Elige tu Plantilla_HYROX (.xlsx)'}
                  </span>
                  {fileName ? <MIcon name="check_circle" size={16} className="text-[color:var(--v2-ok)]" /> : null}
                </button>
                <p className="v2-micro text-[color:var(--v2-faint)]">
                  Sin archivo se usa la plantilla de ejemplo.
                </p>
              </div>
            ) : sourceMode === 'paste' ? (
              <label className="block space-y-1.5">
                <span className="v2-micro">Pega la sesión de un día</span>
                <textarea
                  value={pastedText}
                  onChange={(e) => {
                    setPastedText(e.target.value);
                    if (pasteInstructionHint) setPasteInstructionHint(false);
                  }}
                  rows={5}
                  maxLength={20_000}
                  placeholder={'Martes\nFUERZA — Tren inferior\n5 rounds Back Squat c/2\'30": 10/10/8/8/6 — 60/65/70/70/75% RM'}
                  className="v2-focus w-full resize-y rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm leading-snug text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-accent)]"
                />
                {pasteInstructionHint ? (
                  <div className="flex flex-col gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-warn)]/40 bg-[color:var(--v2-warn)]/10 px-3 py-2.5">
                    <p className="flex items-start gap-1.5 text-[12px] leading-snug text-[color:var(--v2-fg)]">
                      <MIcon name="lightbulb" size={15} className="mt-px shrink-0 text-[color:var(--v2-warn)]" />
                      Esto parece una instrucción, no una sesión pegada. Para que la IA te la genere usa «Generar con IA».
                    </p>
                    <button
                      type="button"
                      onClick={switchToGenerateWithText}
                      className="v2-focus inline-flex w-fit items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 py-1.5 text-[12px] font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
                    >
                      <MIcon name="draw" size={14} /> Generar con IA
                    </button>
                  </div>
                ) : null}
              </label>
            ) : (
              <div className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="v2-micro">¿Qué semana quieres? (foco, sesiones, modalidades)</span>
                  <textarea
                    value={generateFocus}
                    onChange={(e) => setGenerateFocus(e.target.value)}
                    rows={4}
                    maxLength={400}
                    disabled={llmConfigured === false}
                    placeholder={
                      'p. ej. Semana de doble sesión combinando running e híbrido, foco HYROX. 6 días, domingo descanso.'
                    }
                    className="v2-focus w-full resize-y rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm leading-snug text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-accent)] disabled:opacity-50"
                  />
                </label>
                <div className="space-y-1.5">
                  <span className="v2-micro">¿En qué semana del microciclo la meto?</span>
                  <WeekSelect microWeeks={microWeeks} value={pasteWeekId} onChange={setPasteWeekId} />
                  <p className="v2-micro text-[color:var(--v2-faint)]">
                    La IA compone la semana entera con tu biblioteca. La revisas antes de guardar — nada
                    entra sin ejercicio del catálogo.
                  </p>
                </div>
                {llmConfigured === false ? (
                  <p className="flex items-start gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-[12px] leading-snug text-[color:var(--v2-muted)]">
                    <MIcon name="info" size={14} className="mt-px shrink-0 text-[color:var(--v2-warn)]" />
                    La generación con IA está pendiente de configurar. Mientras tanto usa «Subir Excel» o
                    «Pegar texto».
                  </p>
                ) : null}
              </div>
            )}

            {/* Destination — a single DAY for paste, a WEEK RANGE for Excel. Generate
                targets a whole week, picked inside its own panel above. */}
            {sourceMode === 'paste' ? (
              <div className="space-y-1.5">
                <span className="v2-micro">¿En qué día del microciclo lo meto?</span>
                <div className="grid grid-cols-2 gap-2">
                  <WeekSelect microWeeks={microWeeks} value={pasteWeekId} onChange={setPasteWeekId} />
                  <select
                    aria-label="Día de la semana"
                    value={pasteWeekday}
                    onChange={(e) => setPasteWeekday(Number(e.target.value))}
                    className="v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm font-semibold text-[color:var(--v2-fg)] outline-none focus:border-[color:var(--v2-accent)]"
                  >
                    {DAY_LABELS_FULL.map((label, i) => (
                      <option key={label} value={i + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="v2-micro text-[color:var(--v2-faint)]">
                  La sesión entra en ese día. El resto de la semana no se toca.
                </p>
              </div>
            ) : sourceMode === 'file' ? (
              <label className="block space-y-1.5">
                <span className="v2-micro">¿Qué rango meto en este microciclo?</span>
                <input
                  type="text"
                  value={rangeText}
                  onChange={(e) => setRangeText(e.target.value)}
                  maxLength={200}
                  placeholder="de la semana 1 a la 4"
                  className="v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-accent)]"
                />
                <p className="v2-micro text-[color:var(--v2-faint)]">
                  Ej.: «solo la semana 1» · «de la 4 a la 9» · «semanas 1, 3 y 5»
                </p>
              </label>
            ) : null}

            {/* Variant (Fork D) — only the Excel sheet has variants; paste has none. */}
            {sourceMode === 'file' ? (
              <div className="space-y-1.5">
                <span className="v2-micro">Variante de la hoja</span>
                <div className="flex flex-wrap gap-1.5">
                  {VARIANTS.map((v) => (
                    <button
                      key={v.value}
                      type="button"
                      onClick={() => setVariant(v.value)}
                      className={cn(
                        'v2-focus rounded-[var(--v2-r-pill)] px-3 py-1 text-[12px] font-semibold transition-colors',
                        variant === v.value
                          ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                          : 'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
                      )}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {formError ? (
              <p className="flex items-center gap-1.5 text-[12px] text-[color:var(--v2-danger)]">
                <MIcon name="error" size={14} />
                {formError}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t border-[color:var(--v2-border)] pt-3">
              <button
                type="button"
                onClick={onClose}
                className="v2-focus rounded-[var(--v2-r-s)] px-3 py-2 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={extract}
                disabled={!canExtract}
                className="v2-focus inline-flex h-10 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
              >
                <MIcon
                  name={
                    extracting
                      ? 'progress_activity'
                      : sourceMode === 'generate'
                        ? 'draw'
                        : 'document_scanner'
                  }
                  size={17}
                  className={extracting ? 'animate-spin' : undefined}
                />
                {extracting
                  ? sourceMode === 'generate'
                    ? 'Generando…'
                    : 'Extrayendo…'
                  : sourceMode === 'generate'
                    ? 'Generar y revisar'
                    : 'Extraer y revisar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
