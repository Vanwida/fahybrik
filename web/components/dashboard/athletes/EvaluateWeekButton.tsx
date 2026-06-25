'use client';

import { useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { EvaluateWeekResultDialog } from '@/components/dashboard/athletes/EvaluateWeekResultDialog';
import type {
  FiredTrigger,
  WeekFeedSummary,
} from '@/lib/dashboard/coach/weekly-evaluation';
import type { PendingAdjustment } from '@/lib/dashboard/coach/week-adjustments';
import type { WeekAdjustmentProposalJson } from '@fahybrid/shared/schema/week-adjustment';

type Verdict = 'ok' | 'needs_adjustment';

/** Id de la superficie de revisión real montada por AthleteCalendarSection. */
const REVIEW_SURFACE_ID = 'athlete-review-surface';
/** Margen tras el refresh para que la superficie esté montada antes del scroll. */
const SCROLL_AFTER_REFRESH_MS = 400;

interface EvaluateWeekButtonProps {
  athleteId: string | number;
  /** Nombre del atleta — para construir la propuesta recién creada (athlete_name). */
  athleteName?: string;
  /**
   * ISO YYYY-MM-DD del lunes a evaluar. Por defecto, lunes de la semana
   * anterior (N-1) según la fecha de hoy del cliente.
   */
  defaultWeekStart?: string;
  /**
   * Veredicto needs_adjustment → abre la superficie canónica de revisión
   * (la dispara la shell). Sin esto, el panel no se monta y el scroll falla.
   */
  onNeedsAdjustment?: () => void;
  /**
   * La propuesta RECIÉN creada server-side (ya devuelta por el endpoint). Se pasa
   * a la shell para que la revisión la use SIN esperar al router.refresh — evita
   * la carrera en la que la superficie lee la prop `pendingProposal` aún sin
   * refrescar. La shell la prefiere sobre la prop del servidor.
   */
  onProposalCreated?: (proposal: PendingAdjustment) => void;
}

// El toast es SOLO de error: el resultado (veredicto + por qué + lo que hizo) se
// surfacea en EvaluateWeekResultDialog, no en un toast. Los casos ok/needs no usan toast.
interface ToastState {
  title: string;
  detail?: string;
}

interface ProposeResponse {
  proposal?: {
    id: string;
    athlete_id?: string;
    verdict: Verdict;
    week_start: string;
    evaluated_week_start?: string;
    fired_triggers?: FiredTrigger[];
    week_feed?: WeekFeedSummary;
    /** El JSON de la propuesta (recommendation + slot_changes + coach_summary). */
    proposal?: WeekAdjustmentProposalJson;
  };
  error?: { code: string; message: string };
}

/** Resultado de la evaluación listo para pintar en el panel. */
interface ResultState {
  weekRangeLabel: string;
  verdict: Verdict;
  firedTriggers: FiredTrigger[];
  weekFeed: WeekFeedSummary;
}

const EMPTY_WEEK_FEED: WeekFeedSummary = {
  scheduled: 0,
  completed: 0,
  missed: 0,
  days: [],
};

/** Calcula el lunes (UTC) de la semana N-1 respecto a hoy. */
function defaultLastMondayIso(now = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset - 7);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatRange(weekStartIso: string): string {
  // weekStartIso es lunes; rango = lun → dom
  const parts = weekStartIso.split('-').map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return weekStartIso;
  const [y, m, d] = parts as [number, number, number];
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const fmt = (dt: Date) =>
    `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${fmt(start)}–${fmt(end)}`;
}

export function EvaluateWeekButton({
  athleteId,
  athleteName,
  defaultWeekStart,
  onNeedsAdjustment,
  onProposalCreated,
}: EvaluateWeekButtonProps) {
  const router = useRouter();
  const weekStart = useMemo(
    () => defaultWeekStart ?? defaultLastMondayIso(),
    [defaultWeekStart],
  );
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  // La propuesta RECIÉN creada (de la última evaluación) — se emite a la shell al
  // pulsar "Revisar ajuste" para que la revisión no dependa del router.refresh.
  const [freshProposal, setFreshProposal] = useState<PendingAdjustment | null>(null);

  const showToast = (next: ToastState, ttlMs = 5000) => {
    setToast(next);
    if (ttlMs > 0) {
      window.setTimeout(() => {
        setToast((curr) => (curr === next ? null : curr));
      }, ttlMs);
    }
  };

  const onClick = async () => {
    if (loading) return;
    setLoading(true);
    setToast(null);
    try {
      const res = await fetch(
        `/api/coach/athletes/${athleteId}/week-adjustment/propose`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ week_start: weekStart }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as ProposeResponse;
      if (!res.ok || !json.proposal) {
        const msg = json.error?.message ?? `Error ${res.status}`;
        showToast({ title: 'No se pudo evaluar', detail: msg }, 7000);
        return;
      }

      const evaluatedRange = formatRange(
        json.proposal.evaluated_week_start ?? weekStart,
      );

      // Surface el RESULTADO real (veredicto + por qué + lo que hizo) en un
      // panel, no en un toast. La propuesta YA se creó server-side; el panel
      // sólo la muestra. El CTA de needs_adjustment abre la revisión canónica.
      setResult({
        weekRangeLabel: evaluatedRange,
        verdict: json.proposal.verdict,
        firedTriggers: json.proposal.fired_triggers ?? [],
        weekFeed: json.proposal.week_feed ?? EMPTY_WEEK_FEED,
      });

      // Captura la propuesta recién creada como PendingAdjustment para que la
      // revisión la use SIN esperar al router.refresh (evita la carrera). Solo si
      // el endpoint devolvió el JSON de la propuesta (siempre lo hace hoy).
      const json_proposal = json.proposal.proposal;
      setFreshProposal(
        json_proposal
          ? {
              id: json.proposal.id,
              athlete_id: json.proposal.athlete_id ?? String(athleteId),
              athlete_name: athleteName ?? '',
              week_start: json.proposal.week_start,
              verdict: json.proposal.verdict,
              coach_summary: json_proposal.coach_summary ?? null,
              proposal: json_proposal,
            }
          : null,
      );
      // Refresca en segundo plano para traer la propuesta/banner pendientes.
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      showToast({ title: 'Fallo de red', detail: msg }, 7000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onClick}
        disabled={loading}
        title={`Evaluar semana del ${formatRange(weekStart)}`}
      >
        {loading ? (
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[color:var(--text-muted)] border-t-transparent"
          />
        ) : null}
        <span>{loading ? 'Evaluando…' : 'Evaluar semana'}</span>
      </Button>

      {toast ? (
        <div
          role="alert"
          aria-live="assertive"
          className="absolute right-0 top-full z-20 mt-2 w-72 whitespace-normal break-words rounded-[var(--r-m)] border border-[color:var(--danger)] bg-[color:var(--surface-card)] px-3 py-2 text-xs text-[color:var(--fg)] shadow-lg"
        >
          <p className="font-semibold">{toast.title}</p>
          {toast.detail ? (
            <p className="mt-0.5 text-[color:var(--text-muted)]">{toast.detail}</p>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <EvaluateWeekResultDialog
          weekRangeLabel={result.weekRangeLabel}
          verdict={result.verdict}
          firedTriggers={result.firedTriggers}
          weekFeed={result.weekFeed}
          onClose={() => setResult(null)}
          onReview={() => {
            // Cierra el panel de resultado, entrega a la shell la propuesta recién
            // creada (para que la revisión no espere al router.refresh) y abre la
            // superficie canónica de revisión, luego scrollea al panel montado.
            setResult(null);
            if (freshProposal) onProposalCreated?.(freshProposal);
            onNeedsAdjustment?.();
            window.setTimeout(() => {
              document
                .getElementById(REVIEW_SURFACE_ID)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, SCROLL_AFTER_REFRESH_MS);
          }}
        />
      ) : null}
    </div>
  );
}
