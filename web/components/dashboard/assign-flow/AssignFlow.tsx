'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { PublishPreview } from '@/lib/dashboard/coach/publish-preview';
import {
  isoDateString,
  mondayOfWeek as mondayOfWeekDate,
  parseIsoDate,
} from '@fahybrid/shared/domain/atr/dates';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import { resolvePhase } from '@/lib/dashboard/coach/resolve-phase';
import { MIcon } from '@/components/dashboard/MIcon';
import { AssignFlowPreview } from '@/components/dashboard/assign-flow/AssignFlowPreview';
import {
  AthleteField,
  MonthField,
  StartDateField,
} from '@/components/dashboard/assign-flow/AssignFlowFields';
import {
  MONDAY_OPTIONS_COUNT,
  PREVIEW_DEBOUNCE_MS,
  firstName,
  fmtRangeShort,
  sesionesLabel,
  todayLocalIso,
  upcomingMondays,
  type AssignFlowAthleteOption,
  type AssignFlowMonthOption,
} from '@/components/dashboard/assign-flow/helpers';

// =============================================================================
// AssignFlow — EL flujo "Programar bloque" (PHASE 3, modelo del fundador).
//
// La UNIDAD de asignación es el BLOQUE: el coach programa el SIGUIENTE bloque del
// atleta, una semana por fila cae sola. El NOMBRE de fase del bloque sale del
// resolver sobre las fases del coach (sin fases configuradas → enum ATR legacy).
// Vocabulario del fundador en TODO el flujo: "bloque", NUNCA "microciclo"/"mes".
// Un solo modal invocable desde la ficha del atleta (atleta preseleccionado,
// chip bloqueado).
//
// Tres zonas: selección (bloque + lunes de inicio) → preview SIEMPRE de lo que se
// generará semana a semana (publish-preview real, debounced) → confirmación
// "Crear en borrador". El gate clave: confirmar NO publica en vivo — materializa
// el bloque y marca CADA semana como BORRADOR, de modo que el atleta NO lo ve
// hasta que el coach lo publique desde "Revisar & publicar".
//
// Ancla de carrera: si el atleta tiene una carrera objetivo, se surfacea con su
// cuenta atrás para que el coach programe el bloque apuntando a ella.
// =============================================================================

/** Ancla de carrera objetivo del atleta (la meta a la que apunta el plan). */
export interface AssignFlowRace {
  name: string;
  days_until: number;
}

/**
 * Info del bloque recién creado en borrador, que viaja a "Revisar & publicar"
 * para CERRAR el loop: la superficie debe aterrizar en la PRIMERA semana real del
 * bloque (no en "el próximo lunes") y publicar TODAS sus semanas de golpe.
 */
export interface CreatedDraftInfo {
  /** Lunes de la primera semana del bloque (semana objetivo de la revisión). */
  week_start: string;
  /** Todas las semanas (lunes ISO) que abarca el bloque — se publican juntas. */
  week_starts: string[];
}

/** Lunes de la semana que contiene `iso` — reusa el helper de dominio ATR. */
function mondayOfWeek(iso: string): string {
  return isoDateString(mondayOfWeekDate(parseIsoDate(iso)));
}

interface AssignFlowProps {
  open: boolean;
  onClose: () => void;
  /** Preselección desde la ficha: chip bloqueado, no editable. */
  athlete?: AssignFlowAthleteOption | undefined;
  /**
   * Opciones de atleta ya cargadas por el call site (editor de bloque).
   * Si no se proveen y no hay `athlete`, AssignFlow las carga de la API.
   */
  athletes?: AssignFlowAthleteOption[] | undefined;
  /** Preselección del bloque (program_month_template de la biblioteca). */
  month_id?: string | undefined;
  /** Carrera objetivo del atleta para el ancla + cuenta atrás. */
  race?: AssignFlowRace | null | undefined;
  /**
   * Fases de periodización del coach (0052). El nombre de fase del bloque se
   * resuelve contra ellas; [] (default) → enum ATR legacy (idéntico a hoy).
   */
  coachPhases?: ReadonlyArray<MethodologyPhase> | undefined;
  /**
   * Callback tras crear el bloque en borrador (además del router.refresh
   * interno). Recibe la semana objetivo (primer lunes del bloque) y TODAS las
   * semanas que abarca: el call site abre "Revisar & publicar" anclada a esa
   * semana, que publicará el bloque entero antes de que lo vea el atleta.
   */
  onCreatedDraft?: ((info: CreatedDraftInfo) => void) | undefined;
}

export function AssignFlow({
  open,
  onClose,
  athlete,
  athletes: providedAthletes,
  month_id,
  race,
  coachPhases = [],
  onCreatedDraft,
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

  // — creación en borrador —
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    athlete_id: string;
    block_name: string;
    session_count: number;
    week_count: number;
    start_date: string;
    end_date: string;
    /** Todas las semanas del bloque (lunes ISO) — para publicar el bloque entero. */
    week_starts: string[];
  } | null>(null);

  const athleteOptions = providedAthletes?.length ? providedAthletes : fetchedAthletes;
  const effectiveAthleteId = athlete?.id ?? athleteId;
  const selectedAthlete =
    athlete ?? athleteOptions.find((a) => a.id === effectiveAthleteId) ?? null;
  const athleteName = selectedAthlete?.full_name ?? null;
  const athleteFirst = athleteName ? firstName(athleteName) : null;
  const selectedMonth = months.find((m) => m.id === monthId) ?? null;
  // Nombre de fase del bloque vía el resolver: fase del coach (por el hint que
  // mapea a su phase) o enum ATR legacy si no hay fases. El hint es el código de
  // fase (ACC/TRANS/REAL legacy o un code del coach).
  const phaseHint = selectedMonth?.atr_block_hint ?? preview?.weeks[0]?.atr_hint ?? null;
  const phaseLabel =
    phaseHint != null ? resolvePhase({ type: phaseHint }, coachPhases).label : null;

  const ready = effectiveAthleteId !== '' && monthId !== '' && startDate !== '';

  const handleClose = useCallback(() => {
    setCreateError(null);
    setCreated(null);
    onClose();
  }, [onClose]);

  // Carga de bloques de la biblioteca al abrir (el resumen necesita nombre/fase).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch('/api/coach/program-months', { credentials: 'include' })
      .then((r) => r.json())
      .then((json: { months?: AssignFlowMonthOption[] }) => {
        if (!cancelled) setMonths(json.months ?? []);
      })
      .catch(() => {
        if (!cancelled) setOptionsError('No se pudieron cargar los bloques.');
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

  // Confirmación explícita — crea el bloque EN BORRADOR (no publica). Materializa
  // sus semanas y las marca todas como borrador: el atleta NO lo verá hasta que
  // el coach lo publique desde "Revisar & publicar".
  const submit = useCallback(() => {
    if (!ready) {
      setCreateError('Elige un bloque y una fecha de inicio.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/coach/athletes/${effectiveAthleteId}/assign-draft`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month_template_id: monthId, start_date: startDate }),
        });
        const json = (await res.json()) as {
          error?: { message?: string };
          assign_draft?: {
            assignment_count: number;
            week_count: number;
            start_date: string;
            end_date: string;
            week_starts: string[];
          };
        };
        if (!res.ok || !json.assign_draft) {
          setCreateError(json.error?.message ?? 'el servidor no respondió.');
          return;
        }
        setCreated({
          athlete_id: effectiveAthleteId,
          block_name: selectedMonth?.name ?? preview?.month_name ?? 'Bloque',
          session_count: json.assign_draft.assignment_count,
          week_count: json.assign_draft.week_count,
          start_date: json.assign_draft.start_date,
          end_date: json.assign_draft.end_date,
          week_starts: json.assign_draft.week_starts,
        });
        router.refresh();
      } catch {
        setCreateError('sin conexión con el servidor.');
      } finally {
        setCreating(false);
      }
    })();
  }, [
    ready,
    effectiveAthleteId,
    monthId,
    startDate,
    selectedMonth,
    preview,
    router,
  ]);

  // Tras crear el borrador, llevar al coach a revisarlo y publicarlo. Pasa la
  // PRIMERA semana real del bloque (no "el próximo lunes") + todas sus semanas,
  // para que la revisión ancle en la semana correcta y publique el bloque entero.
  const goToReview = useCallback(() => {
    const info = created
      ? { week_start: mondayOfWeek(created.start_date), week_starts: created.week_starts }
      : null;
    handleClose();
    if (info) onCreatedDraft?.(info);
  }, [created, handleClose, onCreatedDraft]);

  const canCreate =
    ready &&
    !creating &&
    !previewLoading &&
    previewError == null &&
    preview != null &&
    preview.session_count > 0;

  if (!open) return null;

  return (
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
            <p className="micro-label">Programar el próximo bloque</p>
            <h2
              id="assign-flow-title"
              className="font-display text-2xl font-extrabold uppercase italic leading-tight tracking-[0.01em]"
            >
              Programar bloque
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar"
            className="focus-ring ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-m)] border border-[color:var(--border-subtle)] text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--hairline)] hover:text-[color:var(--fg)]"
          >
            <MIcon name="close" size={18} />
          </button>
        </header>

        {created ? (
          <CreatedDraftState
            athlete_first_name={athleteFirst}
            block_name={created.block_name}
            session_count={created.session_count}
            week_count={created.week_count}
            start_date={created.start_date}
            end_date={created.end_date}
            onReview={goToReview}
            onClose={handleClose}
          />
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {/* Ancla de carrera: la meta a la que apunta el bloque + cuenta
                  atrás. Solo si el atleta tiene carrera objetivo. */}
              {race ? (
                <div className="mx-6 mb-2 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--bg)] px-3 py-2.5">
                  <MIcon name="flag" size={15} className="shrink-0 text-[color:var(--accent)]" aria-hidden />
                  <span className="micro-label text-[color:var(--text-muted)]">Objetivo</span>
                  <span className="text-[13px] font-semibold text-[color:var(--fg)]">{race.name}</span>
                  <span aria-hidden className="text-[color:var(--tertiary)]">·</span>
                  <span className="text-[13px] text-[color:var(--text-muted)]">
                    faltan{' '}
                    <span className="metric-num font-semibold text-[color:var(--fg)]">
                      {race.days_until <= 0 ? 0 : race.days_until}
                    </span>{' '}
                    {race.days_until === 1 ? 'día' : 'días'}
                  </span>
                </div>
              ) : null}

              {/* — 1 · selección — */}
              <div className="grid gap-4 px-6 pb-4 pt-2 md:grid-cols-3">
                <AthleteField
                  locked={athlete ?? null}
                  options={athleteOptions}
                  value={athleteId}
                  onChange={(v) => {
                    setAthleteId(v);
                    setCreateError(null);
                  }}
                />
                <MonthField
                  options={months}
                  value={monthId}
                  selected={selectedMonth}
                  coachPhases={coachPhases}
                  onChange={(v) => {
                    setMonthId(v);
                    setCreateError(null);
                  }}
                />
                <StartDateField
                  mondays={mondays}
                  todayIso={todayIso}
                  value={startDate}
                  onChange={(v) => {
                    setStartDate(v);
                    setCreateError(null);
                  }}
                />
              </div>

              {/* Rango del bloque (lunes de inicio → fin) — del preview real. */}
              {preview ? (
                <p className="mx-6 mb-2 flex items-center gap-1.5 text-[12px] text-[color:var(--text-muted)]">
                  <MIcon name="date_range" size={14} aria-hidden />
                  El bloque va del{' '}
                  <span className="metric-num font-semibold text-[color:var(--fg)]">
                    {fmtRangeShort(preview.start_date, preview.end_date)}
                  </span>
                  <span aria-hidden className="text-[color:var(--tertiary)]">·</span>
                  <span className="metric-num font-semibold text-[color:var(--fg)]">
                    {preview.week_count}
                  </span>{' '}
                  {preview.week_count === 1 ? 'semana' : 'semanas'}
                </p>
              ) : null}

              {/* La IA adapta el bloque al atleta — línea honesta (los modifiers
                  ya existen: nivel / intensidad / duración / rondas). */}
              <p className="mx-6 mb-3 flex items-start gap-1.5 text-[12px] leading-snug text-[color:var(--text-muted)]">
                <MIcon name="tune" size={14} className="mt-0.5 shrink-0 text-[color:var(--accent)]" aria-hidden />
                <span>
                  La IA ajusta el bloque a {athleteFirst ?? 'cada atleta'} — nivel,
                  intensidad, duración y rondas.
                </span>
              </p>

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

            {/* — 3 · confirmación: crear en BORRADOR (no publica) — */}
            <footer className="flex flex-wrap items-center gap-4 border-t border-[color:var(--border-subtle)] px-6 py-5">
              <div className="grid gap-0.5">
                <span className="text-[13px] font-semibold">Se crea en borrador</span>
                <span className="flex items-center gap-1 text-xs text-[color:var(--text-muted)]">
                  <MIcon name="visibility_off" size={14} />
                  {athleteFirst ?? 'El atleta'} no lo verá hasta que lo publiques.
                </span>
              </div>
              <div className="ml-auto flex items-center gap-3">
                {createError ? (
                  <p role="alert" className="text-xs text-[color:var(--danger)]">
                    No se pudo crear: {createError}{' '}
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
                  disabled={!canCreate}
                  onClick={submit}
                  className="focus-ring inline-flex items-center gap-2 rounded-[var(--r-m)] bg-[color:var(--accent)] px-6 py-2.5 text-sm font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)] disabled:opacity-50"
                >
                  <MIcon name="edit_note" size={16} />
                  {creating ? 'Creando…' : 'Crear en borrador'}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

// Estado de éxito IN-MODAL: el bloque quedó en borrador. El camino claro hacia la
// revisión es la acción primaria — el atleta no lo ve hasta publicar.
function CreatedDraftState({
  athlete_first_name,
  block_name,
  session_count,
  week_count,
  start_date,
  end_date,
  onReview,
  onClose,
}: {
  athlete_first_name: string | null;
  block_name: string;
  session_count: number;
  week_count: number;
  start_date: string;
  end_date: string;
  onReview: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 pb-8 pt-4 text-center">
      <span
        aria-hidden
        className="grid h-12 w-12 place-items-center rounded-[var(--r-pill)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] text-[color:var(--accent)]"
      >
        <MIcon name="edit_note" size={24} />
      </span>
      <div className="grid gap-1.5">
        <h3 className="font-heading text-lg uppercase text-[color:var(--fg)]">
          Bloque creado en borrador
        </h3>
        <p className="mx-auto max-w-md text-sm text-[color:var(--text-muted)]">
          Revísalo y publícalo antes de que lo vea {athlete_first_name ?? 'el atleta'}.
        </p>
      </div>

      <div className="grid w-full max-w-md gap-1 rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--bg)] px-4 py-3 text-left">
        <p className="text-[13px] font-semibold text-[color:var(--fg)]">{block_name}</p>
        <p className="text-xs text-[color:var(--text-muted)]">
          <span className="metric-num font-semibold text-[color:var(--fg)]">{week_count}</span>{' '}
          {week_count === 1 ? 'semana' : 'semanas'}
          <span aria-hidden className="mx-1.5 text-[color:var(--tertiary)]">·</span>
          <span className="metric-num">{sesionesLabel(session_count)}</span>
          <span aria-hidden className="mx-1.5 text-[color:var(--tertiary)]">·</span>
          <span className="metric-num">{fmtRangeShort(start_date, end_date)}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="focus-ring rounded-[var(--r-m)] border border-[color:var(--border-subtle)] px-5 py-2.5 text-sm font-semibold text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--hairline)] hover:text-[color:var(--fg)]"
        >
          Cerrar
        </button>
        <button
          type="button"
          onClick={onReview}
          className="focus-ring inline-flex items-center gap-2 rounded-[var(--r-m)] bg-[color:var(--accent)] px-6 py-2.5 text-sm font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)]"
        >
          <MIcon name="fact_check" size={16} />
          Revisar &amp; publicar
        </button>
      </div>
    </div>
  );
}
