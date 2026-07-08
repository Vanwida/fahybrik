'use client';

// Rendimiento · diagnostic panels — the three richer sections of the performance
// deep dive: the composite race-readiness (headline + 90d trend + contribution
// breakdown), the 80/0/20 polarization across four windows (+ 12-week aerobic-base
// trend), and the top-8 exercise time series. Every field of the payload is
// rendered with honest empty states; no free text.

import { Panel, Sparkline } from '../parts';
import { MiniTrend, SinDatos, TONE_VAR, type Tone } from './ui';
import { EM_DASH, fmtClock, fmtInt, fmtRatioPct } from './format';
import type {
  ExerciseTimeSeries,
  PolarizationByWindow,
  PolarizationPct,
  RaceReadinessPoint,
} from '@/lib/dashboard/coach/deep-dive-performance';

// ── 1 · READINESS COMPUESTA ────────────────────────────────────────────────────

/** The four scored inputs of the composite, with their real ceilings + colour. */
const READINESS_PARTS = [
  { key: 'tsb_pts', label: 'TSB', max: 40, tone: 'info' as Tone, fixed: false },
  { key: 'compliance_pts', label: 'Adherencia', max: 30, tone: 'accent' as Tone, fixed: false },
  { key: 'hrv_pts', label: 'VFC', max: 12, tone: 'ok' as Tone, fixed: true },
  { key: 'sessions_pts', label: 'Sesiones', max: 10, tone: 'warn' as Tone, fixed: false },
] as const;

function readinessTone(score: number): Tone {
  if (score >= 65) return 'ok';
  if (score >= 45) return 'warn';
  return 'danger';
}

export function ReadinessPanel({ history }: { history: RaceReadinessPoint[] }) {
  const latest = history.length > 0 ? history[history.length - 1]! : null;
  const scores = history.map((p) => p.score);

  return (
    <Panel title="Readiness compuesta · últimos 90 días">
      {latest == null ? (
        <SinDatos text="Aún no hay readiness compuesta — faltan carga, adherencia y sesiones." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-4">
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1">
                <span
                  className="v2-display text-4xl tabular-nums"
                  style={{ color: `var(${TONE_VAR[readinessTone(latest.score)]})` }}
                >
                  {latest.score}
                </span>
                <span className="v2-num text-xs text-[color:var(--v2-faint)]">/ 100</span>
              </div>
              <span className="v2-micro mt-1 block">Índice actual</span>
            </div>
            <div className="min-w-0 flex-1">
              <MiniTrend values={scores} lowerIsBetter={false} height={48} />
            </div>
          </div>

          {/* Contribución de cada componente al índice (suma = score). */}
          <div className="flex flex-col gap-2">
            <span className="v2-micro">Contribución al índice</span>
            <ContributionBar inputs={latest.inputs} />
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
              {READINESS_PARTS.map((p) => {
                const pts = latest.inputs[p.key];
                return (
                  <div key={p.key} className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: `var(${TONE_VAR[p.tone]})` }}
                    />
                    <span className="min-w-0 truncate text-[11px] text-[color:var(--v2-muted)]">
                      {p.label}
                    </span>
                    <span className="v2-num ml-auto text-[11px] font-semibold text-[color:var(--v2-fg)]">
                      {pts}
                      <span className="text-[color:var(--v2-faint)]">/{p.max}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            <span className="text-[11px] text-[color:var(--v2-faint)]">
              La VFC aporta hoy una contribución fija (12) hasta que haya línea base personal.
            </span>
          </div>
        </div>
      )}
    </Panel>
  );
}

function ContributionBar({ inputs }: { inputs: RaceReadinessPoint['inputs'] }) {
  const total = READINESS_PARTS.reduce((s, p) => s + Math.max(0, inputs[p.key]), 0);
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--v2-surface-2)]">
      {total > 0
        ? READINESS_PARTS.map((p) => {
            const pts = Math.max(0, inputs[p.key]);
            if (pts <= 0) return null;
            return (
              <div
                key={p.key}
                style={{ width: `${(pts / total) * 100}%`, background: `var(${TONE_VAR[p.tone]})` }}
              />
            );
          })
        : null}
    </div>
  );
}

// ── 2 · POLARIZACIÓN 80/0/20 ────────────────────────────────────────────────────

const INTENSITY = [
  { key: 'low' as const, label: 'Baja', tone: 'ok' as Tone },
  { key: 'mid' as const, label: 'Media', tone: 'warn' as Tone },
  { key: 'high' as const, label: 'Alta', tone: 'accent' as Tone },
];

const WINDOW_LABEL: Record<PolarizationByWindow['window'], string> = {
  '7d': '7 días',
  '14d': '14 días',
  '28d': '28 días',
  '90d': '90 días',
};

function pctTotal(pct: PolarizationPct): number {
  return pct.low + pct.mid + pct.high;
}

export function PolarizationPanel({
  byWindow,
  history,
}: {
  byWindow: PolarizationByWindow[];
  history: Array<{ iso_date: string; pct: PolarizationPct }>;
}) {
  const anyWindow = byWindow.some((w) => pctTotal(w.pct) > 0);
  const lowTrend = history.map((h) => (pctTotal(h.pct) > 0 ? h.pct.low : null));

  return (
    <Panel title="Polarización · distribución por intensidad">
      {!anyWindow ? (
        <SinDatos text="Sin distribución de intensidad — faltan lecturas de frecuencia cardíaca." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {INTENSITY.map((z) => (
              <span key={z.key} className="flex items-center gap-1.5 text-[11px] text-[color:var(--v2-muted)]">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: `var(${TONE_VAR[z.tone]})` }}
                />
                {z.label}
              </span>
            ))}
            <span className="v2-num ml-auto text-[11px] text-[color:var(--v2-faint)]">
              Objetivo 80 / 0 / 20
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {byWindow.map((w) => (
              <PolarizationRow key={w.window} w={w} />
            ))}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-[color:var(--v2-border)] pt-3">
            <span className="v2-micro">Base aeróbica (intensidad baja) · 12 semanas</span>
            {lowTrend.some((v) => v != null) ? (
              <Sparkline values={lowTrend} strokeVar="--v2-ok" height={40} />
            ) : (
              <SinDatos text="Sin histórico semanal todavía." />
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function PolarizationRow({ w }: { w: PolarizationByWindow }) {
  const total = pctTotal(w.pct);
  const empty = total === 0;
  // drift_vs_target: 0 = clavado al 80/0/20; cuanto más alto, más desviado.
  const driftTone: Tone = w.drift_vs_target <= 15 ? 'ok' : w.drift_vs_target <= 40 ? 'warn' : 'danger';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[color:var(--v2-fg)]">{WINDOW_LABEL[w.window]}</span>
        {empty ? (
          <span className="text-[11px] text-[color:var(--v2-faint)]">Sin datos</span>
        ) : (
          <span className="v2-num text-[11px] text-[color:var(--v2-muted)]">
            {w.pct.low} / {w.pct.mid} / {w.pct.high}
            <span className="ml-2 text-[color:var(--v2-faint)]">·</span>
            <span className="ml-2" style={{ color: `var(${TONE_VAR[driftTone]})` }}>
              desviación {w.drift_vs_target}
            </span>
          </span>
        )}
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--v2-surface-2)]">
        {!empty
          ? INTENSITY.map((z) => {
              const v = w.pct[z.key];
              if (v <= 0) return null;
              return (
                <div
                  key={z.key}
                  style={{ width: `${(v / total) * 100}%`, background: `var(${TONE_VAR[z.tone]})` }}
                />
              );
            })
          : null}
      </div>
    </div>
  );
}

// ── 3 · TOP EJERCICIOS ──────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<ExerciseTimeSeries['category'], string> = {
  running: 'Carrera',
  hyrox: 'HYROX',
  strength: 'Fuerza',
  skill: 'Técnica',
};

export function ExercisesPanel({ exercises }: { exercises: ExerciseTimeSeries[] }) {
  return (
    <Panel title="Ejercicios · mejores tiempos y consistencia">
      {exercises.length === 0 ? (
        <SinDatos text="Sin series de ejercicios registradas en los últimos 6 meses." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {exercises.map((ex) => (
            <ExerciseCard key={ex.exercise_slug} ex={ex} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function ExerciseCard({ ex }: { ex: ExerciseTimeSeries }) {
  const bests = ex.attempts.map((a) => a.best_seconds);
  return (
    <div className="flex flex-col gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-[color:var(--v2-fg)]">
          {ex.exercise_label}
        </span>
        <span className="v2-micro shrink-0 text-[color:var(--v2-faint)]">{CATEGORY_LABEL[ex.category]}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Metric label="Mejor" value={fmtClock(ex.best_seconds)} strong />
        <Metric label="Mediana" value={fmtClock(ex.median_seconds)} />
        <Metric label="CV" value={fmtRatioPct(ex.variability_cv)} />
        <Metric label="PRs" value={fmtInt(ex.pr_count)} />
      </div>
      <div className="min-w-0">
        {/* Menor tiempo = mejor → una mejora tiende a la BAJA (verde). */}
        <MiniTrend values={bests} lowerIsBetter height={34} />
      </div>
    </div>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="v2-micro text-[9px]">{label}</span>
      <span
        className={
          strong
            ? 'v2-num text-sm font-bold text-[color:var(--v2-fg)]'
            : 'v2-num text-xs text-[color:var(--v2-muted)]'
        }
      >
        {value === EM_DASH ? EM_DASH : value}
      </span>
    </div>
  );
}
