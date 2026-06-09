'use client';

import { useEffect, useState } from 'react';
import type {
  PerformancePayload,
  ExerciseTimeSeries,
  PolarizationByWindow,
  RaceReadinessPoint,
} from '@/lib/dashboard/coach/deep-dive-performance';
import {
  BigValue,
  Card,
  DeltaTag,
  EmptyState,
  ErrorCard,
  Footnote,
  SectionHeader,
  SectionSkeleton,
  SmallLabel,
  Sparkline,
} from './AthleteBodyView';
import { cn } from '@/lib/utils';

interface AthletePerformanceViewProps {
  athlete_id: string;
}

type ApiResponse =
  | { performance: PerformancePayload }
  | { error: { code: string; message: string } };

export function AthletePerformanceView({ athlete_id }: AthletePerformanceViewProps) {
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset de loading/error síncrono antes del fetch: sincronización legítima al
  // cambio de `athlete_id`, no un setState derivado en cada render. Disable acotado.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/coach/athletes/${athlete_id}/performance`, { credentials: 'include' })
      .then(async (res) => {
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        if (!res.ok || 'error' in json) {
          setError(
            'error' in json
              ? json.error.message
              : 'No se pudieron cargar las métricas de rendimiento.',
          );
          setData(null);
        } else {
          setData(json.performance);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError('Error de red al cargar Rendimiento.');
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

  if (!data.has_any_data) {
    return (
      <EmptyState
        title="Sin entrenamientos ejecutados"
        detail="En cuanto el atleta complete su primera sesión, aquí aparecerán PRs por ejercicio, distribución polarizada, economía de carrera y race-readiness."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPI row */}
      <section className="grid grid-cols-1 gap-[var(--gutter)] md:grid-cols-3">
        <RaceReadinessCard history={data.race_readiness_history} />
        <PolarizationCard windows={data.polarization_by_window} />
        <PrsCard exercises={data.exercises} />
      </section>

      {/* Race readiness trend */}
      <section>
        <SectionHeader title="Race readiness" subtitle="Tendencia 90 días" />
        <RaceReadinessTrend history={data.race_readiness_history} />
      </section>

      {/* Exercises */}
      {data.exercises.length > 0 ? (
        <section>
          <SectionHeader
            title="Ejercicios top"
            subtitle="Bests y mediana últimos 6 meses · top 8 por uso"
          />
          <ExerciseGrid exercises={data.exercises} />
        </section>
      ) : null}

      {/* Polarization history */}
      <section>
        <SectionHeader title="Polarización" subtitle="12 semanas · objetivo 80/0/20" />
        <PolarizationHistory history={data.polarization_history} />
      </section>

      {/* Running economy */}
      {data.running_economy.some((p) => p.pace_at_145bpm_sec_per_km != null) ? (
        <section>
          <SectionHeader title="Economía de carrera" subtitle="Pace @145 bpm · 12 meses" />
          <RunningEconomyCard data={data.running_economy} />
        </section>
      ) : null}

      {/* LT */}
      {data.lt_history.some((p) => p.lt_hr_bpm != null) ? (
        <section>
          <SectionHeader title="Umbral de lactato" subtitle="HR y pace estimados · 12 meses" />
          <LtCard data={data.lt_history} />
        </section>
      ) : null}

      {/* Anaerobic */}
      {data.anaerobic_capacity.length > 0 ? (
        <section>
          <SectionHeader title="Capacidad anaeróbica" subtitle="Mejor 3' all-out · 12 meses" />
          <AnaerobicCard data={data.anaerobic_capacity} />
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-cards
// ---------------------------------------------------------------------------

function RaceReadinessCard({ history }: { history: RaceReadinessPoint[] }) {
  const last = history[history.length - 1];
  const prev = history[history.length - 4];
  const score = last?.score ?? null;
  const delta = score != null && prev?.score != null ? score - prev.score : null;
  const tone =
    score == null
      ? 'muted'
      : score >= 70
        ? 'success'
        : score >= 50
          ? 'warning'
          : 'danger';
  return (
    <Card label="Race readiness">
      <BigValue value={score != null ? String(score) : '—'} unit={score != null ? '/100' : undefined} />
      {delta != null ? (
        <DeltaTag tone={delta >= 0 ? 'success' : 'warning'}>
          {delta > 0 ? '+' : ''}
          {delta} pts / 9d
        </DeltaTag>
      ) : (
        <DeltaTag tone={tone}>
          {score == null
            ? 'Sin datos'
            : score >= 70
              ? 'Listo'
              : score >= 50
                ? 'En proceso'
                : 'Bajo'}
        </DeltaTag>
      )}
      <Footnote>
        TSB {last?.inputs.tsb_pts ?? '—'} · Adherencia {last?.inputs.compliance_pts ?? '—'} · HRV{' '}
        {last?.inputs.hrv_pts ?? '—'}
      </Footnote>
    </Card>
  );
}

function PolarizationCard({ windows }: { windows: PolarizationByWindow[] }) {
  const w7 = windows.find((w) => w.window === '7d');
  if (!w7) return null;
  return (
    <Card label="Polarización 7d">
      <div className="mt-2 flex h-8 w-full overflow-hidden rounded-full bg-[color:var(--surface-container-highest)]">
        <div
          className="h-full bg-[color:var(--status-success)]"
          style={{ width: `${w7.pct.low}%` }}
          title={`Baja ${w7.pct.low}%`}
        />
        <div
          className="h-full bg-[color:var(--status-warning)]"
          style={{ width: `${w7.pct.mid}%` }}
          title={`Media ${w7.pct.mid}%`}
        />
        <div
          className="h-full bg-[color:var(--accent)]"
          style={{ width: `${w7.pct.high}%` }}
          title={`Alta ${w7.pct.high}%`}
        />
      </div>
      <Footnote>
        Z1-2 {w7.pct.low}% · Z3 {w7.pct.mid}% · Z4-5 {w7.pct.high}% · drift{' '}
        {Math.round(w7.drift_vs_target)}
      </Footnote>
    </Card>
  );
}

function PrsCard({ exercises }: { exercises: ExerciseTimeSeries[] }) {
  const totalPrs = exercises.reduce((s, e) => s + e.pr_count, 0);
  const recent = exercises
    .flatMap((e) =>
      e.attempts
        .filter((a) => a.is_pr)
        .map((a) => ({ label: e.exercise_label, date: a.iso_date })),
    )
    .sort((a, b) => (a.date > b.date ? -1 : 1))
    .slice(0, 3);
  return (
    <Card label="PRs últimos 6m">
      <BigValue value={String(totalPrs)} unit={totalPrs > 0 ? 'PRs' : undefined} />
      {recent.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-[color:var(--text-muted)]">
          {recent.map((r, i) => (
            <li key={i}>
              <span className="text-[color:var(--fg)]">{r.label}</span> · {r.date.slice(5)}
            </li>
          ))}
        </ul>
      ) : (
        <Footnote>Sin PRs registrados</Footnote>
      )}
    </Card>
  );
}

function RaceReadinessTrend({ history }: { history: RaceReadinessPoint[] }) {
  const points = history.map((h) => ({ iso_date: h.iso_date, value: h.score }));
  return (
    <article className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-5">
      <Sparkline points={points} height={80} />
    </article>
  );
}

function ExerciseGrid({ exercises }: { exercises: ExerciseTimeSeries[] }) {
  return (
    <div className="grid grid-cols-1 gap-[var(--gutter)] md:grid-cols-2 lg:grid-cols-4">
      {exercises.map((ex) => {
        const points = ex.attempts.map((a) => ({ iso_date: a.iso_date, value: a.best_seconds }));
        const variabilityTone =
          ex.variability_cv == null
            ? 'muted'
            : ex.variability_cv < 0.05
              ? 'success'
              : ex.variability_cv < 0.12
                ? 'warning'
                : 'danger';
        return (
          <Card key={ex.exercise_slug} label={ex.exercise_label}>
            <BigValue
              value={ex.best_seconds != null ? formatSeconds(ex.best_seconds) : '—'}
              unit={ex.best_seconds != null ? 'best' : undefined}
            />
            <DeltaTag tone={variabilityTone}>
              CV {ex.variability_cv != null ? (ex.variability_cv * 100).toFixed(1) + '%' : '—'} ·{' '}
              {ex.pr_count} PRs
            </DeltaTag>
            <Sparkline points={points} height={40} />
            <Footnote>
              Mediana {ex.median_seconds != null ? formatSeconds(ex.median_seconds) : '—'} ·{' '}
              {ex.category}
            </Footnote>
          </Card>
        );
      })}
    </div>
  );
}

function PolarizationHistory({
  history,
}: {
  history: Array<{ iso_date: string; pct: { low: number; mid: number; high: number } }>;
}) {
  return (
    <article className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-5">
      <div className="flex items-end gap-2">
        {history.map((h) => {
          const total = h.pct.low + h.pct.mid + h.pct.high;
          if (total === 0) {
            return (
              <div key={h.iso_date} className="flex-1 text-center">
                <div className="h-24 rounded-sm bg-[color:var(--surface-container-highest)]" />
                <p className="mt-1 text-[10px] text-[color:var(--text-muted)]">
                  {h.iso_date.slice(5)}
                </p>
              </div>
            );
          }
          return (
            <div key={h.iso_date} className="flex flex-1 flex-col items-center">
              <div className="flex h-24 w-full flex-col overflow-hidden rounded-sm">
                <div
                  className="bg-[color:var(--accent)]"
                  style={{ height: `${h.pct.high}%` }}
                  title={`Z4-5 ${h.pct.high}%`}
                />
                <div
                  className="bg-[color:var(--status-warning)]"
                  style={{ height: `${h.pct.mid}%` }}
                  title={`Z3 ${h.pct.mid}%`}
                />
                <div
                  className="bg-[color:var(--status-success)]"
                  style={{ height: `${h.pct.low}%` }}
                  title={`Z1-2 ${h.pct.low}%`}
                />
              </div>
              <p className="mt-1 text-[10px] text-[color:var(--text-muted)]">
                {h.iso_date.slice(5)}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 flex flex-wrap gap-3 text-xs text-[color:var(--text-muted)]">
        <LegendDot color="var(--status-success)" label="Z1-2 (baja)" />
        <LegendDot color="var(--status-warning)" label="Z3 (media)" />
        <LegendDot color="var(--accent)" label="Z4-5 (alta)" />
      </p>
    </article>
  );
}

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

function RunningEconomyCard({
  data,
}: {
  data: Array<{ iso_month: string; pace_at_145bpm_sec_per_km: number | null }>;
}) {
  const points = data.map((p) => ({
    iso_date: p.iso_month,
    value: p.pace_at_145bpm_sec_per_km,
  }));
  const last = [...data].reverse().find((p) => p.pace_at_145bpm_sec_per_km != null);
  return (
    <article className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <SmallLabel>Pace @145 bpm</SmallLabel>
          <BigValue
            value={
              last?.pace_at_145bpm_sec_per_km != null
                ? formatPace(last.pace_at_145bpm_sec_per_km)
                : '—'
            }
            unit={last?.pace_at_145bpm_sec_per_km != null ? '/km' : undefined}
          />
        </div>
      </div>
      <div className="mt-3">
        <Sparkline points={points} height={56} />
      </div>
    </article>
  );
}

function LtCard({
  data,
}: {
  data: Array<{ iso_month: string; lt_hr_bpm: number | null; lt_pace_sec_per_km: number | null }>;
}) {
  const lastHr = [...data].reverse().find((p) => p.lt_hr_bpm != null);
  const lastPace = [...data].reverse().find((p) => p.lt_pace_sec_per_km != null);
  return (
    <article className="grid grid-cols-1 gap-6 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-5 md:grid-cols-2">
      <div>
        <SmallLabel>LT HR</SmallLabel>
        <BigValue
          value={lastHr?.lt_hr_bpm != null ? String(lastHr.lt_hr_bpm) : '—'}
          unit={lastHr?.lt_hr_bpm != null ? 'bpm' : undefined}
        />
        <Sparkline
          points={data.map((p) => ({ iso_date: p.iso_month, value: p.lt_hr_bpm }))}
          height={40}
        />
      </div>
      <div>
        <SmallLabel>LT pace</SmallLabel>
        <BigValue
          value={
            lastPace?.lt_pace_sec_per_km != null ? formatPace(lastPace.lt_pace_sec_per_km) : '—'
          }
          unit={lastPace?.lt_pace_sec_per_km != null ? '/km' : undefined}
        />
        <Sparkline
          points={data.map((p) => ({ iso_date: p.iso_month, value: p.lt_pace_sec_per_km }))}
          height={40}
        />
      </div>
    </article>
  );
}

function AnaerobicCard({
  data,
}: {
  data: Array<{ iso_date: string; best_3min_avg_w: number | null }>;
}) {
  const points = data.map((p) => ({ iso_date: p.iso_date, value: p.best_3min_avg_w }));
  const last = [...data].reverse().find((p) => p.best_3min_avg_w != null);
  return (
    <article
      className={cn(
        'rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-5',
      )}
    >
      <SmallLabel>Mejor 3&rsquo; all-out</SmallLabel>
      <BigValue
        value={last?.best_3min_avg_w != null ? String(last.best_3min_avg_w) : '—'}
        unit={last?.best_3min_avg_w != null ? 'W avg' : undefined}
      />
      <Sparkline points={points} height={56} />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
