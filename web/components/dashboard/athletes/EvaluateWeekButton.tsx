'use client';

import { useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';

type Verdict = 'ok' | 'needs_adjustment';

interface EvaluateWeekButtonProps {
  athleteId: string | number;
  /**
   * ISO YYYY-MM-DD del lunes a evaluar. Por defecto, lunes de la semana
   * anterior (N-1) según la fecha de hoy del cliente.
   */
  defaultWeekStart?: string;
}

interface ToastState {
  tone: 'ok' | 'warn' | 'error';
  title: string;
  detail?: string;
}

interface ProposeResponse {
  proposal?: {
    id: string;
    verdict: Verdict;
    week_start: string;
    evaluated_week_start?: string;
  };
  error?: { code: string; message: string };
}

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
  defaultWeekStart,
}: EvaluateWeekButtonProps) {
  const router = useRouter();
  const weekStart = useMemo(
    () => defaultWeekStart ?? defaultLastMondayIso(),
    [defaultWeekStart],
  );
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

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
        showToast({ tone: 'error', title: 'No se pudo evaluar', detail: msg }, 7000);
        return;
      }

      const evaluatedRange = formatRange(
        json.proposal.evaluated_week_start ?? weekStart,
      );

      if (json.proposal.verdict === 'ok') {
        showToast({
          tone: 'ok',
          title: `Semana ${evaluatedRange} evaluada · va bien · sin cambios`,
        });
        router.refresh();
        return;
      }

      // needs_adjustment → refresh para que aparezca el WeekReviewPanel y
      // scrollea hacia él.
      showToast({
        tone: 'warn',
        title: `Semana ${evaluatedRange} · requiere ajuste`,
        detail: 'Propuesta lista abajo',
      });
      router.refresh();
      // Scroll al panel (existe en la página tras refresh — pequeño delay).
      window.setTimeout(() => {
        document
          .getElementById('week-review-panel')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 400);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      showToast({ tone: 'error', title: 'Fallo de red', detail: msg }, 7000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        title={`Evaluar semana del ${formatRange(weekStart)}`}
        className="inline-flex items-center gap-2 rounded-[var(--r-m)] bg-[color:var(--accent)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[color:var(--accent-on)] transition-opacity disabled:opacity-60"
      >
        {loading ? (
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[color:var(--accent-on)] border-t-transparent"
          />
        ) : null}
        <span>{loading ? 'Evaluando…' : 'Evaluar semana'}</span>
      </button>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={
            'absolute right-0 top-full z-20 mt-2 w-72 whitespace-normal break-words rounded-[var(--r-m)] border px-3 py-2 text-xs shadow-lg ' +
            (toast.tone === 'ok'
              ? 'border-[color:var(--status-success)] bg-[color-mix(in_srgb,var(--status-success)_10%,var(--surface-card))] text-[color:var(--fg)]'
              : toast.tone === 'warn'
                ? 'border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface-card))] text-[color:var(--fg)]'
                : 'border-[color:var(--status-danger,#dc2626)] bg-[color:var(--surface-card)] text-[color:var(--fg)]')
          }
        >
          <p className="font-semibold">{toast.title}</p>
          {toast.detail ? (
            <p className="mt-0.5 text-[color:var(--muted)]">{toast.detail}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
