'use client';

// RENDIMIENTO — the diagnostic deep dive. Reads the REAL PerformancePayload that
// the detalle loader already fans out (deep-dive-performance.ts): race-readiness
// composite (90d trend + TSB/adherencia/HRV inputs), training polarization (7d
// bar + 12-week stacked history vs the 80/0/20 target), top exercises (best /
// median / CV / PR count + per-attempt sparkline), running economy, lactate
// threshold and anaerobic capacity. Every section is gated on real signals —
// when the athlete has executed nothing, a single honest EmptyState replaces the
// grid; each sub-section also hides itself when its own series is empty, so we
// never render a fabricated number or a flat zero chart.
//
// This is server-loaded data (passed through `detalle.performance`), so this is a
// pure presentational component — no fetch, no client state. The small inline
// SVG sparkline + stacked-bar are V2-native (the v1 chart atoms are NOT imported).

import { EmptyState } from '@/components/v2/EmptyState';
import { Pill } from '@/components/v2/Pill';
import { Panel } from './parts';
import type {
  PerformancePayload,
  PolarizationByWindow,
  RaceReadinessPoint,
  ExerciseTimeSeries,
  RunningEconomyPoint,
  LtPoint,
  AnaerobicPoint,
} from '@/lib/dashboard/coach/deep-dive-performance';

// ── Polarization target (mirrors the backend's 80/0/20 anchor for the legend) ──
const POLARIZATION_TARGET = { low: 80, mid: 0, high: 20 } as const;

export function RendimientoTab({ performance }: { performance: PerformancePayload | null }) {
  if (!performance || !performance.has_any_data) {
    return (
      <EmptyState
        icon="monitoring"
        title="Sin entrenamientos ejecutados todavía"
        description="Cuando el atleta complete su primera sesión aparecerán aquí sus PRs por ejercicio, la distribución polarizada de la carga, la economía de carrera y el race-readiness."
      />
    );
  }

  const p = performance;
  const w7 = p.polarization_by_window.find((w) => w.window === '7d') ?? null;
  const hasEconomy = p.running_economy.some((x) => x.pace_at_145bpm_sec_per_km != null);
  const hasLt = p.lt_history.some((x) => x.lt_hr_bpm != null || x.lt_pace_sec_per_km != null);
  const hasAnaerobic = p.anaerobic_capacity.some((x) => x.best_3min_avg_w != null);
  const hasPolarHistory = p.polarization_history.some(
    (h) => h.pct.low + h.pct.mid + h.pct.high > 0,
  );

  return (
    <div className="flex flex-col gap-5">
      {/* KPI row: readiness · polarization 7d · PRs */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ReadinessCard history={p.race_readiness_history} />
        <PolarizationCard w7={w7} />
        <PrsCard exercises={p.exercises} />
      </div>

      {/* Race readiness trend */}
      {p.race_readiness_history.length > 0 ? (
        <Panel title="Race readiness · 90 días">
          <Sparkline
            points={p.race_readiness_history.map((h) => h.score)}
            height={72}
            color="var(--v2-accent)"
            min={0}
            max={100}
          />
        </Panel>
      ) : null}

      {/* Polarization history */}
      {hasPolarHistory ? (
        <Panel
          title="Polarización · 12 semanas"
          action={
            <span className="v2-num text-[11px] text-[color:var(--v2-faint)]">
              objetivo {POLARIZATION_TARGET.low}/{POLARIZATION_TARGET.mid}/{POLARIZATION_TARGET.high}
            </span>
          }
        >
          <PolarizationHistory history={p.polarization_history} />
        </Panel>
      ) : null}

      {/* Top exercises */}
      {p.exercises.length > 0 ? (
        <Panel
          title="Ejercicios top · 6 meses"
          action={<span className="v2-num text-[11px] text-[color:var(--v2-faint)]">top 8 por uso</span>}
          bodyClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {p.exercises.map((ex) => (
            <ExerciseCard key={ex.exercise_slug} ex={ex} />
          ))}
        </Panel>
      ) : null}

      {/* Economy · LT · anaerobic — only the sub-cards with real data */}
      {hasEconomy || hasLt || hasAnaerobic ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {hasEconomy ? <EconomyCard data={p.running_economy} /> : null}
          {hasLt ? <LtCard data={p.lt_history} /> : null}
          {hasAnaerobic ? <AnaerobicCard data={p.anaerobic_capacity} /> : null}
        </div>
      ) : null}
    </div>
  );
}

// ── KPI cards ──────────────────────────────────────────────────────────────────

function readinessTone(score: number | null): 'fg' | 'ok' | 'warn' | 'danger' {
  if (score == null) return 'fg';
  if (score >= 70) return 'ok';
  if (score >= 50) return 'warn';
  return 'danger';
}

function ReadinessCard({ history }: { history: RaceReadinessPoint[] }) {
  const last = history.at(-1) ?? null;
  // 9 days back = 3 samples at the 3-day cadence the backend emits.
  const prev = history.at(-4) ?? null;
  const score = last?.score ?? null;
  const delta = score != null && prev?.score != null ? score - prev.score : null;
  const tone = readinessTone(score);

  return (
    <KpiCard label="Race readiness">
      <div className="flex items-baseline gap-1.5">
        <span className="v2-display text-3xl tabular-nums" style={{ color: `var(--v2-${tone})` }}>
          {score != null ? score : '—'}
        </span>
        {score != null ? <span className="v2-num text-xs text-[color:var(--v2-faint)]">/100</span> : null}
        {delta != null ? (
          <Pill tone={delta >= 0 ? 'ok' : 'warn'} variant="soft" className="ml-1">
            {delta > 0 ? '+' : ''}
            {delta} · 9d
          </Pill>
        ) : null}
      </div>
      <span className="v2-num mt-1.5 block text-[11px] text-[color:var(--v2-muted)]">
        TSB {last?.inputs.tsb_pts ?? '—'} · Adher {last?.inputs.compliance_pts ?? '—'} · VFC{' '}
        {last?.inputs.hrv_pts ?? '—'}
      </span>
    </KpiCard>
  );
}

function PolarizationCard({ w7 }: { w7: PolarizationByWindow | null }) {
  const pct = w7?.pct ?? { low: 0, mid: 0, high: 0 };
  return (
    <KpiCard label="Polarización 7d">
      <StackedBar pct={pct} className="mt-1" />
      <span className="v2-num mt-2 block text-[11px] text-[color:var(--v2-muted)]">
        Z1-2 {pct.low}% · Z3 {pct.mid}% · Z4-5 {pct.high}%
        {w7 ? ` · drift ${Math.round(w7.drift_vs_target)}` : ''}
      </span>
    </KpiCard>
  );
}

function PrsCard({ exercises }: { exercises: ExerciseTimeSeries[] }) {
  const total = exercises.reduce((s, e) => s + e.pr_count, 0);
  const recent = exercises
    .flatMap((e) =>
      e.attempts.filter((a) => a.is_pr).map((a) => ({ label: e.exercise_label, date: a.iso_date })),
    )
    .sort((a, b) => (a.date > b.date ? -1 : 1))
    .slice(0, 3);

  return (
    <KpiCard label="PRs · 6 meses">
      <div className="flex items-baseline gap-1.5">
        <span className="v2-display text-3xl tabular-nums text-[color:var(--v2-fg)]">{total}</span>
        {total > 0 ? <span className="v2-num text-xs text-[color:var(--v2-faint)]">PRs</span> : null}
      </div>
      {recent.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {recent.map((r, i) => (
            <li key={`${r.label}-${i}`} className="v2-num text-[11px] text-[color:var(--v2-muted)]">
              <span className="text-[color:var(--v2-fg)]">{r.label}</span> · {r.date.slice(5)}
            </li>
          ))}
        </ul>
      ) : (
        <span className="v2-num mt-1.5 block text-[11px] text-[color:var(--v2-faint)]">
          Sin PRs registrados
        </span>
      )}
    </KpiCard>
  );
}

function KpiCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3.5 shadow-[var(--v2-shadow-card)]">
      <span className="v2-micro mb-1.5 block">{label}</span>
      {children}
    </div>
  );
}

// ── Exercise card ────────────────────────────────────────────────────────────

function ExerciseCard({ ex }: { ex: ExerciseTimeSeries }) {
  const cvTone =
    ex.variability_cv == null
      ? 'neutral'
      : ex.variability_cv < 0.05
        ? 'ok'
        : ex.variability_cv < 0.12
          ? 'warn'
          : 'danger';
  const points = ex.attempts.map((a) => a.best_seconds);

  return (
    <div className="flex flex-col gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
      <span className="truncate text-xs font-semibold text-[color:var(--v2-fg)]" title={ex.exercise_label}>
        {ex.exercise_label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className="v2-display text-xl tabular-nums text-[color:var(--v2-fg)]">
          {ex.best_seconds != null ? fmtSeconds(ex.best_seconds) : '—'}
        </span>
        {ex.best_seconds != null ? (
          <span className="v2-num text-[10px] text-[color:var(--v2-faint)]">best</span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone={cvTone} variant="soft">
          CV {ex.variability_cv != null ? `${(ex.variability_cv * 100).toFixed(1)}%` : '—'}
        </Pill>
        <Pill tone="neutral" variant="soft">
          {ex.pr_count} PR
        </Pill>
      </div>
      <Sparkline points={points} height={32} color="var(--v2-info)" invert />
      <span className="v2-num text-[10px] text-[color:var(--v2-faint)]">
        Mediana {ex.median_seconds != null ? fmtSeconds(ex.median_seconds) : '—'} · {ex.category}
      </span>
    </div>
  );
}

// ── Economy / LT / anaerobic ────────────────────────────────────────────────

function EconomyCard({ data }: { data: RunningEconomyPoint[] }) {
  const last = [...data].reverse().find((x) => x.pace_at_145bpm_sec_per_km != null);
  return (
    <MetricCard label="Economía · pace @145 bpm" sub="12 meses">
      <BigPace value={last?.pace_at_145bpm_sec_per_km ?? null} unit="/km" />
      <Sparkline
        points={data.map((x) => x.pace_at_145bpm_sec_per_km)}
        height={40}
        color="var(--v2-mod-carrera)"
        invert
      />
    </MetricCard>
  );
}

function LtCard({ data }: { data: LtPoint[] }) {
  const lastHr = [...data].reverse().find((x) => x.lt_hr_bpm != null);
  const lastPace = [...data].reverse().find((x) => x.lt_pace_sec_per_km != null);
  return (
    <MetricCard label="Umbral de lactato" sub="HR · pace · 12 meses">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="v2-micro mb-0.5 block text-[9px]">LT HR</span>
          <div className="flex items-baseline gap-1">
            <span className="v2-display text-lg tabular-nums text-[color:var(--v2-fg)]">
              {lastHr?.lt_hr_bpm ?? '—'}
            </span>
            {lastHr?.lt_hr_bpm != null ? (
              <span className="v2-num text-[10px] text-[color:var(--v2-faint)]">bpm</span>
            ) : null}
          </div>
          <Sparkline points={data.map((x) => x.lt_hr_bpm)} height={28} color="var(--v2-danger)" />
        </div>
        <div>
          <span className="v2-micro mb-0.5 block text-[9px]">LT pace</span>
          <BigPace value={lastPace?.lt_pace_sec_per_km ?? null} unit="/km" small />
          <Sparkline
            points={data.map((x) => x.lt_pace_sec_per_km)}
            height={28}
            color="var(--v2-mod-carrera)"
            invert
          />
        </div>
      </div>
    </MetricCard>
  );
}

function AnaerobicCard({ data }: { data: AnaerobicPoint[] }) {
  const last = [...data].reverse().find((x) => x.best_3min_avg_w != null);
  return (
    <MetricCard label="Capacidad anaeróbica" sub="mejor 3' all-out · 12 meses">
      <div className="flex items-baseline gap-1">
        <span className="v2-display text-2xl tabular-nums text-[color:var(--v2-fg)]">
          {last?.best_3min_avg_w ?? '—'}
        </span>
        {last?.best_3min_avg_w != null ? (
          <span className="v2-num text-[10px] text-[color:var(--v2-faint)]">W avg</span>
        ) : null}
      </div>
      <Sparkline points={data.map((x) => x.best_3min_avg_w)} height={40} color="var(--v2-mod-fuerza)" />
    </MetricCard>
  );
}

function MetricCard({
  label,
  sub,
  children,
}: {
  label: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3.5 shadow-[var(--v2-shadow-card)]">
      <div className="flex flex-col">
        <span className="v2-micro">{label}</span>
        <span className="v2-num text-[10px] text-[color:var(--v2-faint)]">{sub}</span>
      </div>
      {children}
    </div>
  );
}

function BigPace({ value, unit, small }: { value: number | null; unit: string; small?: boolean }) {
  return (
    <div className="flex items-baseline gap-1">
      <span
        className={`v2-display tabular-nums text-[color:var(--v2-fg)] ${small ? 'text-lg' : 'text-2xl'}`}
      >
        {value != null ? fmtPace(value) : '—'}
      </span>
      {value != null ? <span className="v2-num text-[10px] text-[color:var(--v2-faint)]">{unit}</span> : null}
    </div>
  );
}

// ── Inline charts (V2-native, real data only) ───────────────────────────────

/** A minimal inline-SVG sparkline. Nulls break the line into segments (gaps =
 *  honest "no data"). `invert` flips the y-axis so a LOWER value (faster pace /
 *  lower time) reads as higher on the chart — the natural "better is up" cue. */
function Sparkline({
  points,
  height,
  color,
  invert,
  min: minProp,
  max: maxProp,
}: {
  points: Array<number | null>;
  height: number;
  color: string;
  invert?: boolean;
  min?: number;
  max?: number;
}) {
  const vals = points.filter((v): v is number => v != null);
  if (vals.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface-2)]"
        style={{ height }}
      >
        <span className="v2-num text-[10px] text-[color:var(--v2-faint)]">datos insuficientes</span>
      </div>
    );
  }
  const min = minProp ?? Math.min(...vals);
  const max = maxProp ?? Math.max(...vals);
  const span = max - min || 1;
  const W = 100;
  const H = height;
  const stepX = points.length > 1 ? W / (points.length - 1) : W;

  // Build polyline segments, breaking on nulls.
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((v, i) => {
    if (v == null) {
      if (current.length) segments.push(current.join(' '));
      current = [];
      return;
    }
    const norm = (v - min) / span; // 0..1
    const y = invert ? norm * H : H - norm * H;
    current.push(`${(i * stepX).toFixed(2)},${y.toFixed(2)}`);
  });
  if (current.length) segments.push(current.join(' '));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      width="100%"
      height={H}
      role="img"
      aria-label="Tendencia"
    >
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

/** Single horizontal stacked bar for one polarization split (low/mid/high %). */
function StackedBar({
  pct,
  className,
}: {
  pct: { low: number; mid: number; high: number };
  className?: string;
}) {
  return (
    <div className={`flex h-7 w-full overflow-hidden rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface-2)] ${className ?? ''}`}>
      <span className="h-full" style={{ width: `${pct.low}%`, background: 'var(--v2-ok)' }} title={`Z1-2 ${pct.low}%`} />
      <span className="h-full" style={{ width: `${pct.mid}%`, background: 'var(--v2-warn)' }} title={`Z3 ${pct.mid}%`} />
      <span className="h-full" style={{ width: `${pct.high}%`, background: 'var(--v2-accent)' }} title={`Z4-5 ${pct.high}%`} />
    </div>
  );
}

/** 12 vertical stacked columns (one per week) for the polarization history. */
function PolarizationHistory({
  history,
}: {
  history: Array<{ iso_date: string; pct: { low: number; mid: number; high: number } }>;
}) {
  return (
    <div>
      <div className="flex items-end gap-1.5">
        {history.map((h) => {
          const total = h.pct.low + h.pct.mid + h.pct.high;
          return (
            <div key={h.iso_date} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full flex-col overflow-hidden rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface-2)]">
                {total === 0 ? null : (
                  <>
                    <span style={{ height: `${h.pct.high}%`, background: 'var(--v2-accent)' }} title={`Z4-5 ${h.pct.high}%`} />
                    <span style={{ height: `${h.pct.mid}%`, background: 'var(--v2-warn)' }} title={`Z3 ${h.pct.mid}%`} />
                    <span style={{ height: `${h.pct.low}%`, background: 'var(--v2-ok)' }} title={`Z1-2 ${h.pct.low}%`} />
                  </>
                )}
              </div>
              <span className="v2-num text-[9px] text-[color:var(--v2-faint)]">{h.iso_date.slice(5)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <LegendDot color="var(--v2-ok)" label="Z1-2 baja" />
        <LegendDot color="var(--v2-warn)" label="Z3 media" />
        <LegendDot color="var(--v2-accent)" label="Z4-5 alta" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[color:var(--v2-muted)]">
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function fmtPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
