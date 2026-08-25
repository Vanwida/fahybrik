'use client';

// Importar un CICLO desde Biblioteca (card 128 · hueco 6).
// Subir → propuesta tipada → revisar → confirmar.
// Reutiliza la parrilla de revisión del importador de semana.
// Confirmar está bloqueado bajo el trinquete de cobertura (71 %).

import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { buildReviewModel, type ReviewWeek } from '@/lib/dashboard/v2/import-review';
import { buildCycleConfirmBody, cycleStretchWeekRefs } from '@/lib/dashboard/v2/import-cycle-review';
import { stripEmptyExerciseItems } from '@/lib/dashboard/v2/import-missing';
import type { ImportProposal } from '@/lib/import/build-proposal';
import {
  CYCLE_IMPORT_COVERAGE_RATCHET_PCT,
  CYCLE_IMPORT_STRETCH_MAX,
  CYCLE_IMPORT_STRETCH_MIN,
  coverageAllowsConfirm,
  coverageRefuseMessage,
} from '@fahybrid/shared/domain/import/cycle-delivery';
import { ImportReviewGrid } from '@/components/v2/planes/ImportReviewGrid';

type Phase = 'form' | 'review';

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function ImportCycleDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('form');
  const [name, setName] = useState('');
  const [weekFrom, setWeekFrom] = useState(1);
  const [weekTo, setWeekTo] = useState(CYCLE_IMPORT_STRETCH_MAX);
  const [documentText, setDocumentText] = useState('');
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewWeeks, setReviewWeeks] = useState<ReviewWeek[]>([]);
  const [proposal, setProposal] = useState<ImportProposal | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFormError(null);
    const text = await file.text();
    setDocumentText(text);
    setFileLabel(file.name);
    if (!name.trim()) {
      const base = file.name.replace(/\.[^.]+$/, '').trim();
      if (base) setName(base.slice(0, 200));
    }
  };

  const extract = async () => {
    if (!documentText.trim()) {
      setFormError('Sube el documento del ciclo (JSON o markdown).');
      return;
    }
    setExtracting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/coach/import/proposal', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'cycle',
          document_text: documentText,
          week_from: weekFrom,
          week_to: weekTo,
          ...(name.trim() ? { name: name.trim() } : {}),
        }),
      });
      if (!res.ok) {
        setFormError(await readErrorMessage(res, 'No se pudo leer el ciclo.'));
        return;
      }
      const next = (await res.json()) as ImportProposal;
      const refs = cycleStretchWeekRefs(next.weeks.length);
      setProposal(next);
      setReviewWeeks(stripEmptyExerciseItems(buildReviewModel(next, refs)));
      setConfirmError(null);
      setPhase('review');
    } catch {
      setFormError('No se pudo conectar. Inténtalo de nuevo.');
    } finally {
      setExtracting(false);
    }
  };

  const confirm = async () => {
    if (!proposal) return;
    const cycleName = name.trim() || 'Ciclo importado';
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch('/api/coach/import/confirm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          buildCycleConfirmBody({
            name: cycleName,
            source_summary: {
              total_items: proposal.summary.total_items,
              detected: proposal.summary.detected,
            },
            weeks: reviewWeeks,
          }),
        ),
      });
      if (!res.ok) {
        setConfirmError(await readErrorMessage(res, 'No se pudo confirmar el ciclo.'));
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

  const delivery = proposal?.delivery;
  const coverageBlocked =
    proposal && !coverageAllowsConfirm(proposal.summary)
      ? coverageRefuseMessage(proposal.summary)
      : null;
  const isReview = phase === 'review';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[color:var(--v2-scrim)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal
        aria-label="Importar ciclo"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]',
          isReview ? 'h-[min(90vh,900px)] max-w-[1080px]' : 'max-w-md',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[color:var(--v2-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="v2-display text-xl">Importar ciclo</h2>
            <p className="v2-micro mt-0.5">
              {isReview
                ? delivery
                  ? `Tramo ${delivery.week_from} a ${delivery.week_to} · cobertura ${delivery.coverage_pct} % (trinquete ${delivery.coverage_ratchet_pct} %)`
                  : 'Revisa las líneas. Nada se guarda todavía.'
                : `Un tramo de ${CYCLE_IMPORT_STRETCH_MIN} a ${CYCLE_IMPORT_STRETCH_MAX} semanas. Fiel o revisión.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>

        {isReview && proposal ? (
          <ImportReviewGrid
            reviewWeeks={reviewWeeks}
            microWeeks={cycleStretchWeekRefs(reviewWeeks.length)}
            onChange={setReviewWeeks}
            onConfirm={() => void confirm()}
            confirming={confirming}
            error={confirmError}
            onBack={() => setPhase('form')}
            hideWeekMapping
            confirmBlockedReason={coverageBlocked}
          />
        ) : (
          <form
            className="flex flex-col gap-4 px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              void extract();
            }}
          >
            <label className="block">
              <span className="mb-1 block text-label font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]">
                Nombre del ciclo
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                placeholder="Base · semanas 1 a 6"
                className="v2-focus h-10 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 text-sm text-[color:var(--v2-fg)]"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-label font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]">
                Documento
              </span>
              <input
                type="file"
                accept=".json,.md,.txt,application/json,text/markdown,text/plain"
                onChange={(e) => void onFile(e.target.files?.[0])}
                className="v2-focus block w-full text-sm text-[color:var(--v2-muted)] file:mr-3 file:rounded-[var(--v2-r-pill)] file:border-0 file:bg-[color:var(--v2-accent)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[color:var(--v2-accent-fg)]"
              />
              <span className="mt-1 block text-nano text-[color:var(--v2-faint)]">
                {fileLabel
                  ? fileLabel
                  : 'JSON del ciclo o markdown. No se guarda hasta confirmar.'}
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-label font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]">
                  Desde la semana
                </span>
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={weekFrom}
                  onChange={(e) => setWeekFrom(Number(e.target.value) || 1)}
                  className="v2-focus h-10 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-label font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]">
                  Hasta la semana
                </span>
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={weekTo}
                  onChange={(e) => setWeekTo(Number(e.target.value) || 1)}
                  className="v2-focus h-10 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 text-sm"
                />
              </label>
            </div>
            <p className="text-nano text-[color:var(--v2-faint)]">
              Techo: {CYCLE_IMPORT_STRETCH_MAX} semanas. Confirmar pide{' '}
              {CYCLE_IMPORT_COVERAGE_RATCHET_PCT} % de líneas tipadas (trinquete del corpus).
            </p>

            {formError ? (
              <p className="flex items-center gap-1.5 text-xs text-[color:var(--v2-danger)]">
                <MIcon name="error" size={14} />
                {formError}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-pill)] px-3.5 text-sm font-semibold text-[color:var(--v2-muted)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={extracting || !documentText.trim()}
                className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 text-sm font-semibold text-[color:var(--v2-accent-fg)] disabled:opacity-50"
              >
                <MIcon name={extracting ? 'progress_activity' : 'upload_file'} size={16} />
                {extracting ? 'Leyendo…' : 'Ver propuesta'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
