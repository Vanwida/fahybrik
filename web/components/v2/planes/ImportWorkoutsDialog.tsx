'use client';

// ImportWorkoutsDialog — #28 importer entry point, inside the microciclo screen.
// TWO phases in one overlay:
//   · FORM  — source (upload xlsx OR paste a day) + a natural-language RANGE +
//             the variant selector (Estándar / Foco fuerza / Foco resistencia,
//             Fork D) → "Extraer y revisar" POSTs /proposal (saves nothing).
//   · REVIEW — the weeks×days grid (ImportReviewGrid) where the coach fixes the
//             amber/red days and maps each imported week to a container week, then
//             "Confirmar" POSTs /confirm (the only write). Nothing untyped or
//             unresolved is ever sent — the grid gates the confirm button.

import { useRef, useState } from 'react';
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
import { DAY_LABELS_FULL } from '@/lib/dashboard/constants/calendar';
import { ImportReviewGrid } from './ImportReviewGrid';

type ImportVariant = 'estandar' | 'fuerza' | 'resistencia';
type SourceMode = 'file' | 'paste';
type Phase = 'form' | 'review';

const VARIANTS: { value: ImportVariant; label: string }[] = [
  { value: 'estandar', label: 'Estándar' },
  { value: 'fuerza', label: 'Foco fuerza' },
  { value: 'resistencia', label: 'Foco resistencia' },
];

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
  const [pasteWeekId, setPasteWeekId] = useState<string>(microWeeks[0]?.id ?? '');
  const [pasteWeekday, setPasteWeekday] = useState<number>(1);

  const [extracting, setExtracting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [reviewWeeks, setReviewWeeks] = useState<ReviewWeek[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

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
      : rangeText.trim().length > 0);

  const extract = async () => {
    if (!canExtract) return;
    setExtracting(true);
    setFormError(null);
    try {
      // PASTE = one day → send the pasted session + its destination weekday (the
      // container week is applied to the review model below). EXCEL = a week range.
      const body =
        sourceMode === 'paste'
          ? {
              microcycle_id: Number(microcycleId),
              variant: 'estandar' as const,
              pasted_text: pastedText,
              target_weekday: pasteWeekday,
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
        setFormError(await readErrorMessage(res, 'No se pudo extraer la propuesta.'));
        return;
      }
      const proposal = (await res.json()) as ImportProposal;
      const model = buildReviewModel(proposal, microWeeks);
      // Paste yields one imported "week"; map it onto the container week the coach
      // picked (default mapping would land it on the first week) and label it to match.
      if (sourceMode === 'paste' && model[0]) {
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
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
                ? 'Revisa antes de guardar — nada entra sin ejercicio del catálogo'
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
              {(['file', 'paste'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSourceMode(m)}
                  className={cn(
                    'v2-focus rounded-[calc(var(--v2-r-s)-2px)] px-3 py-1.5 text-[12px] font-semibold transition-colors',
                    sourceMode === m
                      ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                      : 'text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
                  )}
                >
                  {m === 'file' ? 'Subir Excel' : 'Pegar texto'}
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
            ) : (
              <label className="block space-y-1.5">
                <span className="v2-micro">Pega la sesión de un día</span>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  rows={5}
                  maxLength={20_000}
                  placeholder={'Martes\nFUERZA — Tren inferior\n5 rounds Back Squat c/2\'30": 10/10/8/8/6 — 60/65/70/70/75% RM'}
                  className="v2-focus w-full resize-y rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm leading-snug text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-accent)]"
                />
              </label>
            )}

            {/* Destination — a single DAY for paste, a WEEK RANGE for Excel. */}
            {sourceMode === 'paste' ? (
              <div className="space-y-1.5">
                <span className="v2-micro">¿En qué día del microciclo lo meto?</span>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    aria-label="Semana del microciclo"
                    value={pasteWeekId}
                    onChange={(e) => setPasteWeekId(e.target.value)}
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
            ) : (
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
            )}

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
                <MIcon name={extracting ? 'progress_activity' : 'document_scanner'} size={17} />
                {extracting ? 'Extrayendo…' : 'Extraer y revisar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
