'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { PublishPreview } from '@/lib/dashboard/coach/publish-preview';
import { atrPhaseLabel } from '@/lib/dashboard/constants/atr-phases';
import { MIcon } from '@/components/dashboard/MIcon';
import { AssignFlowPreview } from '@/components/dashboard/assign-flow/AssignFlowPreview';
import {
  AthleteField,
  MonthField,
  StartDateField,
} from '@/components/dashboard/assign-flow/AssignFlowFields';
import {
  PublishedToast,
  type SuccessToast,
} from '@/components/dashboard/assign-flow/PublishedToast';
import {
  MONDAY_OPTIONS_COUNT,
  PREVIEW_DEBOUNCE_MS,
  TOAST_DISMISS_MS,
  assignFlowSubmitSchema,
  firstName,
  todayLocalIso,
  upcomingMondays,
  type AssignFlowAthleteOption,
  type AssignFlowMonthOption,
} from '@/components/dashboard/assign-flow/helpers';

// =============================================================================
// AssignFlow — EL flujo único de Asignar & Publicar (spec §5, mockup 04).
//
// Un solo modal invocable desde la ficha del atleta (atleta preseleccionado,
// chip bloqueado) o desde el editor de microciclo (microciclo preseleccionado).
// Tres zonas: selección → preview SIEMPRE (publish-preview real, debounced) →
// confirmación explícita "Publicar a [nombre]". Nunca auto-publica.
// Éxito: toast "Publicado · N sesiones del X al Y" + link "Ver calendario".
// =============================================================================

interface AssignFlowProps {
  open: boolean;
  onClose: () => void;
  /** Preselección desde la ficha: chip bloqueado, no editable. */
  athlete?: AssignFlowAthleteOption | undefined;
  /**
   * Opciones de atleta ya cargadas por el call site (editor de microciclo).
   * Si no se proveen y no hay `athlete`, AssignFlow las carga de la API.
   */
  athletes?: AssignFlowAthleteOption[] | undefined;
  /** Preselección desde el editor de microciclo. */
  month_id?: string | undefined;
  /** Callback tras publicar con éxito (además del router.refresh interno). */
  onPublished?: (() => void) | undefined;
}

export function AssignFlow({
  open,
  onClose,
  athlete,
  athletes: providedAthletes,
  month_id,
  onPublished,
}: AssignFlowProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);

  // — selección —
  const [athleteId, setAthleteId] = useState('');
  const [monthId, setMonthId] = useState(month_id ?? '');
  const mondays = useMemo(() => upcomingMondays(MONDAY_OPTIONS_COUNT), []);
  const todayIso = useMemo(() => todayLocalIso(), []);
  const [startDate, setStartDate] = useState(mondays[0] ?? '');

  // — opciones —
  const [fetchedAthletes, setFetchedAthletes] = useState<AssignFlowAthleteOption[]>([]);
  const [months, setMonths] = useState<AssignFlowMonthOption[]>([]);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // — preview —
  const [preview, setPreview] = useState<PublishPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // — publicación —
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [toast, setToast] = useState<SuccessToast | null>(null);

  const athleteOptions = providedAthletes?.length ? providedAthletes : fetchedAthletes;
  const effectiveAthleteId = athlete?.id ?? athleteId;
  const selectedAthlete =
    athlete ?? athleteOptions.find((a) => a.id === effectiveAthleteId) ?? null;
  const athleteName = selectedAthlete?.full_name ?? null;
  const athleteFirst = athleteName ? firstName(athleteName) : null;
  const selectedMonth = months.find((m) => m.id === monthId) ?? null;
  const phaseLabel =
    selectedMonth?.atr_block_hint != null
      ? atrPhaseLabel(selectedMonth.atr_block_hint)
      : (preview?.weeks[0]?.atr_hint != null ? atrPhaseLabel(preview.weeks[0].atr_hint) : null);

  const ready = effectiveAthleteId !== '' && monthId !== '' && startDate !== '';

  const handleClose = useCallback(() => {
    setPublishError(null);
    onClose();
  }, [onClose]);

  // Carga de microciclos al abrir (siempre: el resumen necesita nombre/fase).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch('/api/coach/program-months', { credentials: 'include' })
      .then((r) => r.json())
      .then((json: { months?: AssignFlowMonthOption[] }) => {
        if (!cancelled) setMonths(json.months ?? []);
      })
      .catch(() => {
        if (!cancelled) setOptionsError('No se pudieron cargar los microciclos.');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Carga del roster solo si no hay atleta fijado ni opciones del call site.
  useEffect(() => {
    if (!open || athlete || providedAthletes?.length) return;
    let cancelled = false;
    void fetch('/api/coach/athletes', { credentials: 'include' })
      .then((r) => r.json())
      .then((json: { athletes?: Array<{ athlete_id: string; full_name: string }> }) => {
        if (cancelled) return;
        setFetchedAthletes(
          (json.athletes ?? []).map((a) => ({ id: a.athlete_id, full_name: a.full_name })),
        );
      })
      .catch(() => {
        if (!cancelled) setOptionsError('No se pudieron cargar los atletas.');
      });
    return () => {
      cancelled = true;
    };
  }, [open, athlete, providedAthletes]);

  // Preview con debounce al cambiar cualquier selección. Nunca persiste.
  const loadPreview = useCallback(async () => {
    if (!effectiveAthleteId || !monthId || !startDate) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${effectiveAthleteId}/publish-preview`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month_template_id: monthId, start_date: startDate }),
      });
      const json = (await res.json()) as {
        preview?: PublishPreview;
        error?: { message?: string };
      };
      if (!res.ok || !json.preview) {
        setPreview(null);
        setPreviewError(json.error?.message ?? 'el servidor no respondió.');
        return;
      }
      setPreview(json.preview);
    } catch {
      setPreview(null);
      setPreviewError('sin conexión con el servidor.');
    } finally {
      setPreviewLoading(false);
    }
  }, [effectiveAthleteId, monthId, startDate]);

  useEffect(() => {
    if (!open || !effectiveAthleteId || !monthId || !startDate) return;
    const t = window.setTimeout(() => void loadPreview(), PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [open, effectiveAthleteId, monthId, startDate, loadPreview]);

  // Accesibilidad del diálogo: foco inicial, Escape, focus trap, foco de vuelta.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, handleClose]);

  // Auto-dismiss del toast (mockup 04b: 6s).
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), TOAST_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Confirmación explícita — única vía de publicación. Valida con Zod
  // (lunes-only + campos requeridos) antes de tocar la API.
  const submit = useCallback(() => {
    const parsed = assignFlowSubmitSchema.safeParse({
      athlete_id: effectiveAthleteId,
      month_template_id: monthId,
      start_date: startDate,
    });
    if (!parsed.success) {
      setPublishError(parsed.error.issues[0]?.message ?? 'Revisa la selección.');
      return;
    }
    setPublishing(true);
    setPublishError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/coach/athletes/${effectiveAthleteId}/assign-month`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month_template_id: monthId, start_date: startDate }),
        });
        const json = (await res.json()) as {
          error?: { message?: string };
          assign_month?: { assignment_count: number; start_date: string; end_date: string };
        };
        if (!res.ok || !json.assign_month) {
          setPublishError(json.error?.message ?? 'el servidor no respondió.');
          return;
        }
        setToast({
          athlete_id: effectiveAthleteId,
          athlete_name: athleteName ?? 'el atleta',
          month_name: selectedMonth?.name ?? preview?.month_name ?? '',
          session_count: json.assign_month.assignment_count,
          start_date: json.assign_month.start_date,
          end_date: json.assign_month.end_date,
        });
        handleClose();
        onPublished?.();
        router.refresh();
      } catch {
        setPublishError('sin conexión con el servidor.');
      } finally {
        setPublishing(false);
      }
    })();
  }, [
    effectiveAthleteId,
    monthId,
    startDate,
    athleteName,
    selectedMonth,
    preview,
    handleClose,
    onPublished,
    router,
  ]);

  const canPublish =
    ready &&
    !publishing &&
    !previewLoading &&
    previewError == null &&
    preview != null &&
    preview.session_count > 0;

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--scrim)] p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-flow-title"
            tabIndex={-1}
            className="flex max-h-[90vh] w-full max-w-[880px] flex-col overflow-hidden rounded-[var(--r-xl)] border border-[color:var(--outline)] bg-[color:var(--surface)] shadow-[var(--shadow-modal)] outline-none"
          >
            {/* — cabecera — */}
            <header className="flex items-start gap-4 px-6 pb-4 pt-6">
              <div className="grid gap-1">
                <p className="micro-label">Asignar &amp; publicar</p>
                <h2
                  id="assign-flow-title"
                  className="font-display text-2xl font-extrabold uppercase italic leading-tight tracking-[0.01em]"
                >
                  Asignar microciclo
                </h2>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Cerrar sin publicar"
                className="focus-ring ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-m)] border border-[color:var(--border-subtle)] text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--hairline)] hover:text-[color:var(--fg)]"
              >
                <MIcon name="close" size={18} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {/* — 1 · selección — */}
              <div className="grid gap-4 px-6 pb-6 pt-2 md:grid-cols-3">
                <AthleteField
                  locked={athlete ?? null}
                  options={athleteOptions}
                  value={athleteId}
                  onChange={(v) => {
                    setAthleteId(v);
                    setPublishError(null);
                  }}
                />
                <MonthField
                  options={months}
                  value={monthId}
                  selected={selectedMonth}
                  onChange={(v) => {
                    setMonthId(v);
                    setPublishError(null);
                  }}
                />
                <StartDateField
                  mondays={mondays}
                  todayIso={todayIso}
                  value={startDate}
                  onChange={(v) => {
                    setStartDate(v);
                    setPublishError(null);
                  }}
                />
              </div>

              {optionsError ? (
                <p role="alert" className="px-6 pb-3 text-xs text-[color:var(--danger)]">
                  {optionsError}
                </p>
              ) : null}

              {/* — 2 · preview SIEMPRE — */}
              <AssignFlowPreview
                athlete_first_name={athleteFirst}
                ready={ready}
                loading={previewLoading}
                error={previewError}
                onRetry={() => void loadPreview()}
                preview={preview}
                phase_label={phaseLabel}
              />
            </div>

            {/* — 3 · confirmación explícita — */}
            <footer className="flex flex-wrap items-center gap-4 border-t border-[color:var(--border-subtle)] px-6 py-5">
              <div className="grid gap-0.5">
                <span className="text-[13px] font-semibold">Sin publicar todavía</span>
                <span className="flex items-center gap-1 text-xs text-[color:var(--text-muted)]">
                  <MIcon name="smartphone" size={14} />
                  {athleteFirst ?? 'El atleta'} lo verá inmediatamente en su móvil.
                </span>
              </div>
              <div className="ml-auto flex items-center gap-3">
                {publishError ? (
                  <p role="alert" className="text-xs text-[color:var(--danger)]">
                    No se pudo publicar: {publishError}{' '}
                    <button
                      type="button"
                      onClick={submit}
                      className="focus-ring font-semibold underline underline-offset-2"
                    >
                      Reintentar
                    </button>
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={handleClose}
                  className="focus-ring rounded-[var(--r-m)] border border-[color:var(--border-subtle)] px-5 py-2.5 text-sm font-semibold text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--hairline)] hover:text-[color:var(--fg)]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!canPublish}
                  onClick={submit}
                  className="focus-ring inline-flex items-center gap-2 rounded-[var(--r-m)] bg-[color:var(--accent)] px-6 py-2.5 text-sm font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)] disabled:opacity-50"
                >
                  <MIcon name="send" size={16} />
                  {publishing
                    ? 'Publicando…'
                    : athleteFirst
                      ? `Publicar a ${athleteFirst}`
                      : 'Publicar'}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}

      {toast ? <PublishedToast toast={toast} /> : null}
    </>
  );
}
