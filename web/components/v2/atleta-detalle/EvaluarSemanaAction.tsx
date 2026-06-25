'use client';

// EvaluarSemanaAction — the V2 "Evaluar semana" routine, mounted in the athlete's
// Plan tab. It runs the REAL weekly evaluation the system already computes and
// surfaces the verdict the coach otherwise never sees outside a toast:
//
//   POST /api/coach/athletes/{id}/week-adjustment/propose  { week_start }
//     → { proposal: { verdict, evaluated_week_start, fired_triggers, week_feed,
//                      proposal: { recommendation, coach_summary, … } } }
//
// The endpoint EVALUATES week N-1 and, when the verdict is `needs_adjustment`,
// PERSISTS a pending week_adjustment_proposal for week N+1 (real write). That
// proposal then surfaces as an "Propuestas para aprobar" card in Hoy — so this
// action and the Hoy decision strip are the two ends of the same flow. After a
// run we router.refresh() so the new proposal/banner appears.
//
// Reuses the shared FiredTrigger / WeekFeedSummary types (the same the backend
// returns); NO import from any v1 component. Verdict copy + day feed rendered with
// V2 tokens. Always available (a routine), never gated on a "week finished" state —
// faithful to the v1 model.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MIcon } from '@/components/dashboard/MIcon';
import { DAY_LABELS } from '@/lib/dashboard/constants/calendar';
import { SESSION_STATUS_LABEL } from '@/lib/dashboard/constants/session-status';
import { cn } from '@/lib/utils';
import type {
  FiredTrigger,
  WeekFeedSummary,
} from '@/lib/dashboard/coach/weekly-evaluation';

type Verdict = 'ok' | 'needs_adjustment';

interface ProposeResponse {
  proposal?: {
    verdict: Verdict;
    evaluated_week_start?: string;
    fired_triggers?: FiredTrigger[];
    week_feed?: WeekFeedSummary;
  };
  error?: { code: string; message: string };
}

interface ResultState {
  weekRangeLabel: string;
  verdict: Verdict;
  firedTriggers: FiredTrigger[];
  weekFeed: WeekFeedSummary;
}

const EMPTY_WEEK_FEED: WeekFeedSummary = { scheduled: 0, completed: 0, missed: 0, days: [] };

/** Color V2 por estado de sesión (no dependemos de los tokens v1). */
function statusColorVar(status: WeekFeedSummary['days'][number]['sessions'][number]['status']): string {
  switch (status) {
    case 'completed':
      return 'var(--v2-ok)';
    case 'missed':
      return 'var(--v2-danger)';
    case 'skipped':
      return 'var(--v2-warn)';
    default:
      return 'var(--v2-faint)';
  }
}

/** Lunes (UTC) de la semana N-1 respecto a hoy — el rango que evalúa el endpoint. */
function defaultLastMondayIso(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset - 7);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** "dd/mm–dd/mm" (lun→dom) para el encabezado del resultado. */
function formatRange(weekStartIso: string): string {
  const parts = weekStartIso.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return weekStartIso;
  const [y, m, d] = parts as [number, number, number];
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const fmt = (dt: Date) =>
    `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${fmt(start)}–${fmt(end)}`;
}

export function EvaluarSemanaAction({ athleteId }: { athleteId: string | number }) {
  const router = useRouter();
  const weekStart = useMemo(() => defaultLastMondayIso(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);

  async function run() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/week-adjustment/propose`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ week_start: weekStart }),
      });
      const json = (await res.json().catch(() => ({}))) as ProposeResponse;
      if (!res.ok || !json.proposal) {
        setError(json.error?.message ?? `No se pudo evaluar (error ${res.status}).`);
        return;
      }
      setResult({
        weekRangeLabel: formatRange(json.proposal.evaluated_week_start ?? weekStart),
        verdict: json.proposal.verdict,
        firedTriggers: json.proposal.fired_triggers ?? [],
        weekFeed: json.proposal.week_feed ?? EMPTY_WEEK_FEED,
      });
      // needs_adjustment ya ha PERSISTIDO una propuesta pendiente → refresca para
      // que aparezca en Hoy / banners.
      router.refresh();
    } catch {
      setError('Fallo de red al evaluar la semana.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={loading}
        title={`Evaluar la semana del ${formatRange(weekStart)}`}
        className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] disabled:opacity-50"
      >
        {loading ? (
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[color:var(--v2-faint)] border-t-transparent"
          />
        ) : (
          <MIcon name="fact_check" size={15} />
        )}
        {loading ? 'Evaluando…' : 'Evaluar semana'}
      </button>

      {error ? (
        <span role="alert" className="text-[11px] font-medium text-[color:var(--v2-danger)]">
          {error}
        </span>
      ) : null}

      {result ? (
        <EvaluarSemanaResultDialog result={result} onClose={() => setResult(null)} />
      ) : null}
    </>
  );
}

// ── Result dialog (V2 tokens; verdict → why → what they did) ────────────────────

function EvaluarSemanaResultDialog({
  result,
  onClose,
}: {
  result: ResultState;
  onClose: () => void;
}) {
  const needsAdjustment = result.verdict === 'needs_adjustment';
  const verdictColor = needsAdjustment ? 'var(--v2-warn)' : 'var(--v2-ok)';

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={`Evaluación de la semana ${result.weekRangeLabel}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]">
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-[color:var(--v2-border)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--v2-faint)]">
              Semana <span className="v2-num">{result.weekRangeLabel}</span>
            </p>
            <h2 className="mt-0.5 text-sm font-bold text-[color:var(--v2-fg)]">
              Evaluación de la semana
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar evaluación"
            className="v2-focus rounded-[var(--v2-r-s)] p-1.5 text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={17} />
          </button>
        </header>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
          {/* 1) Veredicto */}
          <div
            className="flex items-center gap-3 rounded-[var(--v2-r-m)] border px-4 py-3"
            style={{
              borderColor: `color-mix(in srgb, ${verdictColor} 45%, var(--v2-border))`,
              backgroundColor: `color-mix(in srgb, ${verdictColor} 12%, var(--v2-surface))`,
            }}
          >
            <MIcon
              name={needsAdjustment ? 'tune' : 'check_circle'}
              size={22}
              className="shrink-0"
              style={{ color: verdictColor }}
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--v2-faint)]">
                Veredicto
              </p>
              <p className="text-sm font-bold text-[color:var(--v2-fg)]">
                {needsAdjustment ? 'Necesita ajuste' : 'Semana en orden'}
              </p>
            </div>
          </div>

          {/* 2) Por qué */}
          <section className="flex flex-col gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--v2-faint)]">
              Por qué
            </h3>
            {result.firedTriggers.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {result.firedTriggers.map((t) => {
                  const tone = t.tone === 'danger' ? 'var(--v2-danger)' : 'var(--v2-warn)';
                  return (
                    <li
                      key={t.code}
                      className="flex items-center gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2"
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: tone }}
                      />
                      <span className="min-w-0 flex-1 text-[13px] text-[color:var(--v2-fg)]">
                        {t.label}
                      </span>
                      <span
                        className="v2-num shrink-0 text-sm font-semibold"
                        style={{ color: tone }}
                      >
                        {t.value}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-[13px] text-[color:var(--v2-muted)]">
                Sin señales de alarma — cumplimiento, readiness y HRV en rango.
              </p>
            )}
          </section>

          {/* 3) Lo que hizo */}
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--v2-faint)]">
                Lo que hizo
              </h3>
              {result.weekFeed.scheduled > 0 ? (
                <span className="v2-num text-xs font-semibold text-[color:var(--v2-muted)]">
                  {result.weekFeed.completed}/{result.weekFeed.scheduled} hechas
                </span>
              ) : null}
            </div>
            <ul className="flex flex-col divide-y divide-[color:var(--v2-border)] overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]">
              {result.weekFeed.days.map((day) => (
                <WeekFeedRow
                  key={day.iso_date}
                  dayLabel={DAY_LABELS[day.day_of_week - 1] ?? ''}
                  sessions={day.sessions}
                />
              ))}
            </ul>
          </section>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[color:var(--v2-border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="v2-focus rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 py-1.5 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}

function WeekFeedRow({
  dayLabel,
  sessions,
}: {
  dayLabel: string;
  sessions: WeekFeedSummary['days'][number]['sessions'];
}) {
  if (sessions.length === 0) {
    return (
      <li className="flex items-start gap-3 px-3 py-2">
        <span className="mt-0.5 w-8 shrink-0 text-[11px] font-semibold uppercase text-[color:var(--v2-faint)]">
          {dayLabel}
        </span>
        <span className="flex-1 text-[13px] text-[color:var(--v2-muted)]">Descanso</span>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-3 px-3 py-2">
      <span className="mt-0.5 w-8 shrink-0 text-[11px] font-semibold uppercase text-[color:var(--v2-faint)]">
        {dayLabel}
      </span>
      <ul className="flex min-w-0 flex-1 flex-col gap-1">
        {sessions.map((s, i) => {
          const color = statusColorVar(s.status);
          const done = s.status === 'completed';
          const missed = s.status === 'missed' || s.status === 'skipped';
          return (
            <li key={i} className="flex items-center gap-2">
              <MIcon
                name={done ? 'check' : missed ? 'close' : 'remove'}
                size={15}
                className="shrink-0"
                style={{ color }}
              />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[13px]',
                  done ? 'text-[color:var(--v2-fg)]' : 'text-[color:var(--v2-muted)]',
                )}
                title={s.title}
              >
                {s.title}
              </span>
              <span className="shrink-0 text-[11px]" style={{ color }}>
                {SESSION_STATUS_LABEL[s.status]}
              </span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
