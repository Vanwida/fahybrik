'use client';

import { useEffect, useState } from 'react';
import type {
  ModalityPayload,
  ModalityTotals,
  ModalityWeeklyPoint,
  ModalityExecution,
  ModalitySegment,
} from '@/lib/dashboard/coach/modality-types';
import {
  EmptyState,
  ErrorCard,
  Footnote,
  SectionHeader,
  SectionSkeleton,
  SmallLabel,
  Sparkline,
} from './AthleteBodyView';
import { cn } from '@/lib/utils';

interface AthleteModalityViewProps {
  athlete_id: string;
}

// The endpoint may wrap the payload as { modality: ... } (matching the
// /performance + /body envelope) or return it bare — accept both.
type ApiResponse =
  | { modality: ModalityPayload }
  | ModalityPayload
  | { error: { code: string; message: string } };

// --- Modality presentation tokens -----------------------------------------
// Distinct, accessible colors drawn from the existing brand palette so run /
// row / ski / bike read apart at a glance without adding a new chart lib.
const MODALITY_META: Record<
  string,
  { label: string; color: string; pace: 'km' | '500m' | null }
> = {
  run: { label: 'Carrera', color: 'var(--accent)', pace: 'km' },
  row: { label: 'Remo', color: 'var(--ok)', pace: '500m' },
  ski: { label: 'SkiErg', color: 'var(--warning)', pace: '500m' },
  bike: { label: 'Bici', color: 'var(--text-muted)', pace: 'km' },
};

function modalityMeta(modality: string) {
  return (
    MODALITY_META[modality] ?? {
      label: modality.charAt(0).toUpperCase() + modality.slice(1),
      color: 'var(--text-muted)',
      pace: null as 'km' | '500m' | null,
    }
  );
}

export function AthleteModalityView({ athlete_id }: AthleteModalityViewProps) {
  const [data, setData] = useState<ModalityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset de loading/error síncrono antes del fetch: sincronización legítima al
  // cambio de `athlete_id`, no un setState derivado en cada render. Disable acotado.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/coach/athletes/${athlete_id}/modality`, { credentials: 'include' })
      .then(async (res) => {
        if (cancelled) return;
        // Never parse the body of a failed response — surface the status instead.
        if (!res.ok) {
          setError('No se pudieron cargar las métricas de modalidades.');
          setData(null);
          return;
        }
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        if ('error' in json) {
          setError(json.error.message);
          setData(null);
        } else {
          // Accept both { modality: payload } and a bare payload.
          const payload = 'modality' in json ? json.modality : json;
          setData(payload);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError('Error de red al cargar Modalidades.');
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [athlete_id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) return <SectionSkeleton />;
  if (error) return <ErrorCard message={error} />;
  if (!data) return null;

  const hasData =
    data.by_modality_totals.length > 0 ||
    data.weekly.length > 0 ||
    data.recent_executions.length > 0;

  if (!hasData) {
    return (
      <EmptyState
        title="Sin entrenamientos ejecutados"
        detail="En cuanto el atleta complete una sesión con segmentos de carrera, remo, ski o bici, aquí verás el reparto run-vs-row, los ritmos y el desglose por segmento."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Volume per modality */}
      <section>
        <SectionHeader
          title="Volumen por modalidad"
          subtitle="Distancia · tiempo · sesiones"
        />
        <ModalityVolume totals={data.by_modality_totals} />
      </section>

      {/* Pace + weekly trend */}
      {data.by_modality_totals.length > 0 ? (
        <section>
          <SectionHeader
            title="Ritmos y tendencia"
            subtitle="Carrera /km · remo·ski /500m · semanal"
          />
          <ModalityPaceGrid totals={data.by_modality_totals} weekly={data.weekly} />
        </section>
      ) : null}

      {/* Recent executions breakdown */}
      {data.recent_executions.length > 0 ? (
        <section>
          <SectionHeader
            title="Entrenamientos recientes"
            subtitle="Segmentos por sesión · run vs row dentro del bloque"
          />
          <RecentExecutions executions={data.recent_executions} />
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Volume — distance + duration totals per modality, with a stacked bar
// ---------------------------------------------------------------------------

function ModalityVolume({ totals }: { totals: ModalityTotals[] }) {
  const totalDistance = totals.reduce((s, t) => s + t.distance_meters, 0);

  return (
    <div className="flex flex-col gap-[var(--gutter)]">
      {/* Cards per modality — instrument readouts with a modality-colored rail */}
      <div className="grid grid-cols-2 gap-[var(--gutter)] md:grid-cols-4">
        {totals.map((t, i) => {
          const meta = modalityMeta(t.modality);
          return (
            <article
              key={t.modality}
              style={{ '--stagger-i': i } as React.CSSProperties}
              className="stagger-in card-elevated relative flex flex-col gap-2.5 overflow-hidden p-5"
            >
              <span
                className="absolute left-0 top-0 h-full w-[3px]"
                style={{ backgroundColor: meta.color }}
                aria-hidden
              />
              <span className="micro-label" style={{ color: meta.color }}>
                {meta.label}
              </span>
              <div className="metric-readout">
                <span className="metric-readout__value">{formatDistance(t.distance_meters)}</span>
              </div>
              <p className="metric-num text-xs text-[color:var(--text-muted)]">
                {formatDuration(t.duration_seconds)} · {t.sessions}{' '}
                {t.sessions === 1 ? 'sesión' : 'sesiones'}
              </p>
            </article>
          );
        })}
      </div>

      {/* Stacked distance distribution */}
      {totalDistance > 0 ? (
        <article className="card-elevated p-5">
          <SmallLabel>Reparto de distancia</SmallLabel>
          <div
            className="mt-3 flex h-8 w-full overflow-hidden rounded-full bg-[color:var(--surface-container-highest)]"
            role="img"
            aria-label={`Reparto de distancia: ${totals
              .map(
                (t) =>
                  `${modalityMeta(t.modality).label} ${Math.round(
                    (t.distance_meters / totalDistance) * 100,
                  )}%`,
              )
              .join(', ')}`}
          >
            {totals.map((t) => {
              const pct = (t.distance_meters / totalDistance) * 100;
              if (pct <= 0) return null;
              const meta = modalityMeta(t.modality);
              return (
                <div
                  key={t.modality}
                  className="h-full"
                  style={{ width: `${pct}%`, backgroundColor: meta.color }}
                  title={`${meta.label} ${formatDistance(t.distance_meters)} (${Math.round(pct)}%)`}
                />
              );
            })}
          </div>
          <p className="mt-3 flex flex-wrap gap-3 text-xs text-[color:var(--text-muted)]">
            {totals.map((t) => {
              const meta = modalityMeta(t.modality);
              const pct = Math.round((t.distance_meters / totalDistance) * 100);
              return (
                <LegendDot
                  key={t.modality}
                  color={meta.color}
                  label={`${meta.label} ${pct}%`}
                />
              );
            })}
          </p>
        </article>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pace — avg run pace (/km) + avg row/ski split (/500m) + weekly sparkline
// ---------------------------------------------------------------------------

function ModalityPaceGrid({
  totals,
  weekly,
}: {
  totals: ModalityTotals[];
  weekly: ModalityWeeklyPoint[];
}) {
  return (
    <div className="grid grid-cols-1 gap-[var(--gutter)] md:grid-cols-2 lg:grid-cols-4">
      {totals.map((t, i) => {
        const meta = modalityMeta(t.modality);
        const usesKm = meta.pace === 'km';
        const paceValue = usesKm ? t.avg_pace_s_per_km : t.avg_pace_s_per_500m;
        const paceUnit = usesKm ? '/km' : '/500m';

        // Weekly trend: derive pace per week (duration / distance) for this
        // modality so the sparkline shows pace movement, not raw volume.
        const series = weekly
          .filter((w) => w.modality === t.modality)
          .map((w) => ({
            iso_date: w.week_start,
            value:
              w.distance_meters > 0
                ? usesKm
                  ? (w.duration_seconds / w.distance_meters) * 1000
                  : (w.duration_seconds / w.distance_meters) * 500
                : null,
          }));

        const isAccent = meta.color === 'var(--accent)';

        return (
          <article
            key={t.modality}
            style={{ '--stagger-i': i } as React.CSSProperties}
            className="stagger-in card-elevated relative flex flex-col gap-3 overflow-hidden p-5"
          >
            <span
              className="absolute left-0 top-0 h-full w-[3px]"
              style={{ backgroundColor: meta.color }}
              aria-hidden
            />
            <span className="micro-label" style={{ color: meta.color }}>
              {meta.label} · ritmo
            </span>
            <div className={cn('metric-readout', isAccent && 'metric-readout--accent')}>
              <span
                className="metric-readout__value"
                style={isAccent ? undefined : { color: meta.color }}
              >
                {paceValue != null ? formatPace(paceValue) : '—'}
                {paceValue != null ? (
                  <span className="metric-readout__unit"> {paceUnit}</span>
                ) : null}
              </span>
            </div>
            <p className="metric-num text-xs text-[color:var(--text-muted)]">
              {formatDistance(t.distance_meters)} totales
            </p>
            <Sparkline points={series} height={40} />
            <Footnote>Tendencia semanal de ritmo</Footnote>
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent executions — compact list, segments as modality chips
// ---------------------------------------------------------------------------

function RecentExecutions({ executions }: { executions: ModalityExecution[] }) {
  return (
    <div className="flex flex-col gap-[var(--gutter)]">
      {executions.map((ex, i) => (
        <ExecutionCard key={ex.execution_id} execution={ex} index={i} />
      ))}
    </div>
  );
}

function ExecutionCard({ execution, index = 0 }: { execution: ModalityExecution; index?: number }) {
  return (
    <article
      style={{ '--stagger-i': index } as React.CSSProperties}
      className="stagger-in card-elevated p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SmallLabel>{formatDate(execution.date)}</SmallLabel>
        <span className="metric-num text-xs text-[color:var(--text-muted)]">
          {execution.total_duration_seconds != null
            ? formatDuration(execution.total_duration_seconds)
            : '—'}
          {execution.perceived_exertion != null
            ? ` · RPE ${execution.perceived_exertion}`
            : ''}
        </span>
      </div>

      <ul className="mt-4 flex flex-col divide-y divide-[color:var(--border-subtle)]">
        {execution.segments.map((seg) => (
          <li
            key={seg.position}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 first:pt-0 last:pb-0"
          >
            <ModalityChip modality={seg.modality} />
            <SegmentStats segment={seg} />
          </li>
        ))}
      </ul>
    </article>
  );
}

function ModalityChip({ modality }: { modality: string }) {
  const meta = modalityMeta(modality);
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
      style={{ borderColor: meta.color, color: meta.color }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.color }}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}

function SegmentStats({ segment }: { segment: ModalitySegment }) {
  const meta = modalityMeta(segment.modality);
  const usesKm = meta.pace === 'km';
  const pace = usesKm ? segment.avg_pace_s_per_km : segment.avg_pace_s_per_500m;
  const paceUnit = usesKm ? '/km' : '/500m';

  const stats: Array<{ label: string; value: string } | null> = [
    segment.distance_meters != null
      ? { label: 'dist', value: formatDistance(segment.distance_meters) }
      : null,
    segment.duration_seconds != null
      ? { label: 'tiempo', value: formatDuration(segment.duration_seconds) }
      : null,
    pace != null ? { label: 'ritmo', value: `${formatPace(pace)} ${paceUnit}` } : null,
    segment.avg_power_w != null
      ? { label: 'pot', value: `${Math.round(segment.avg_power_w)} W` }
      : null,
    segment.stroke_rate_spm != null
      ? { label: 's/m', value: String(Math.round(segment.stroke_rate_spm)) }
      : null,
    segment.avg_hr != null
      ? {
          label: 'fc',
          value:
            segment.max_hr != null
              ? `${segment.avg_hr}/${segment.max_hr} bpm`
              : `${segment.avg_hr} bpm`,
        }
      : null,
    segment.calories != null
      ? { label: 'kcal', value: String(Math.round(segment.calories)) }
      : null,
    segment.reps_completed != null
      ? { label: 'reps', value: String(segment.reps_completed) }
      : null,
    segment.weight_used_kg != null
      ? { label: 'carga', value: `${segment.weight_used_kg} kg` }
      : null,
  ];

  const visible = stats.filter((s): s is { label: string; value: string } => s != null);

  if (visible.length === 0) {
    return <span className="text-xs text-[color:var(--text-muted)]">Sin métricas</span>;
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      {visible.map((s) => (
        <span key={s.label} className="text-xs text-[color:var(--text-muted)]">
          <span className="metric-num text-[color:var(--fg)]">{s.value}</span>{' '}
          <span className="uppercase tracking-wide">{s.label}</span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span>{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    // Trim trailing .0 for whole-km values.
    return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Pace as m:ss (used for both /km and /500m). */
function formatPace(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  // iso like 2026-05-30 → 30 may. Keep it compact + locale-aware.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(d);
}
