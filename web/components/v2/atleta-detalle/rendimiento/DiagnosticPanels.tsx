'use client';

// Rendimiento · diagnostic panels — the three richer sections of the performance
// deep dive: the composite race-readiness (headline + 90d trend + contribution
// breakdown), the 80/0/20 polarization across four windows (+ 12-week aerobic-base
// trend), and the top-8 exercise time series. Every field of the payload is
// rendered with honest empty states; no free text.

import { MIcon } from '@/components/ui/MIcon';
import { Panel, Sparkline } from '../parts';
import { MiniTrend, readinessTone, SinDatos, TONE_VAR, type Tone } from './ui';
import { EM_DASH, finiteCount, fmtClock, fmtInt, fmtRatioPct } from './format';
import {
  RACE_READINESS_BANDS,
  RACE_READINESS_BAND_LABEL_ES,
  RACE_READINESS_BAND_MAX,
  type RaceReadinessBand,
  type RaceReadinessBands,
} from '@fahybrid/shared/domain/coach/race-readiness';
import type {
  ExerciseTimeSeries,
  PolarizationByWindow,
  PolarizationPct,
  RaceReadinessGap,
  RaceReadinessPoint,
} from '@/lib/dashboard/coach/deep-dive-performance';

// ── 1 · DISPOSICIÓN ────────────────────────────────────────────────────────────
// Los cuatro tramos, sus techos y sus nombres viven en el dominio
// (shared/domain/coach/race-readiness.ts). Aquí sólo se elige el color: cuando
// esta lista tenía su propia copia de los techos, la barra se dibujaba sobre 92
// puntos bajo un titular que decía «/ 100».

const BAND_TONE: Record<RaceReadinessBand, Tone> = {
  freshness: 'info',
  compliance: 'accent',
  hrv: 'ok',
  activity: 'warn',
};

export function ReadinessPanel({
  history,
  gap,
}: {
  history: RaceReadinessPoint[];
  gap: RaceReadinessGap | null;
}) {
  const latest = history.length > 0 ? history[history.length - 1]! : null;
  // Un día no puntuable es un HUECO en la línea, no un cero: la curva se corta,
  // no baja. `MiniTrend` ya dibuja sobre huecos.
  const scores = history.map((p) => p.reading?.score ?? null);
  const reading = latest?.reading ?? null;

  return (
    <Panel title="Disposición · últimos 90 días">
      {reading == null ? (
        <div className="flex flex-col gap-3">
          <ReadinessGapState gap={gap ?? latest?.gap ?? null} />
          {/* Que hoy no se pueda leer no borra lo que sí se leyó: si quedan días
              puntuables en los 90, la curva se queda — con su hueco al final. */}
          {finiteCount(scores) >= 2 ? (
            <div className="flex flex-col gap-1 border-t border-[color:var(--v2-border)] pt-3">
              <span className="v2-micro">Hasta donde se pudo leer</span>
              <MiniTrend values={scores} lowerIsBetter={false} height={44} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-4">
            <div className="flex flex-col">
              <div className="flex items-baseline gap-1">
                <span
                  className="v2-display text-4xl tabular-nums"
                  style={{ color: `var(${TONE_VAR[readinessTone(reading.score)]})` }}
                >
                  {reading.score}
                </span>
                <span className="v2-num text-xs text-[color:var(--v2-faint)]">/ 100</span>
              </div>
              <span className="v2-micro mt-1 block">Índice actual</span>
            </div>
            <div className="min-w-0 flex-1">
              <MiniTrend values={scores} lowerIsBetter={false} height={48} />
            </div>
          </div>

          {/* Contribución de cada tramo al índice (los cuatro suman el índice). */}
          <div className="flex flex-col gap-2">
            <span className="v2-micro">Contribución al índice</span>
            <ContributionBar bands={reading.bands} />
            {/* Los cuatro tramos están MEDIDOS: si a uno le falta la señal no
                hay índice, así que aquí no hay nada que marcar con asterisco. */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
              {RACE_READINESS_BANDS.map((band) => (
                <div key={band} className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: `var(${TONE_VAR[BAND_TONE[band]]})` }}
                  />
                  <span className="min-w-0 truncate text-[11px] text-[color:var(--v2-muted)]">
                    {RACE_READINESS_BAND_LABEL_ES[band]}
                  </span>
                  <span className="v2-num ml-auto shrink-0 text-[11px] font-semibold text-[color:var(--v2-fg)]">
                    {reading.bands[band]}
                    <span className="text-[color:var(--v2-faint)]">
                      /{RACE_READINESS_BAND_MAX[band]}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

/**
 * El vacío con salida (docs/CONTRATO-UI.md §5): qué falta y qué puede hacer
 * Pablo. Nunca una barra a cero, que se lee como «está fatal».
 */
function ReadinessGapState({ gap }: { gap: RaceReadinessGap | null }) {
  if (gap == null) {
    return <SinDatos text="Aún no hay disposición que leer." />;
  }
  return (
    <div className="flex items-start gap-2.5 py-3">
      <MIcon
        name={gap.reason === 'no_signal' ? 'show_chart' : 'help'}
        size={18}
        className="mt-0.5 shrink-0 text-[color:var(--v2-faint)]"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-[color:var(--v2-muted)]">{gap.note_es}</span>
        {gap.action_es ? (
          <span className="text-xs font-semibold text-[color:var(--v2-fg)]">{gap.action_es}</span>
        ) : null}
      </div>
    </div>
  );
}

function ContributionBar({ bands }: { bands: RaceReadinessBands }) {
  const total = RACE_READINESS_BANDS.reduce((s, b) => s + Math.max(0, bands[b]), 0);
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--v2-surface-2)]">
      {total > 0
        ? RACE_READINESS_BANDS.map((band) => {
            const pts = Math.max(0, bands[band]);
            if (pts <= 0) return null;
            return (
              <div
                key={band}
                style={{
                  width: `${(pts / total) * 100}%`,
                  background: `var(${TONE_VAR[BAND_TONE[band]]})`,
                }}
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
  history: Array<{ iso_date: string; pct: PolarizationPct | null }>;
}) {
  const anyWindow = byWindow.some((w) => w.pct != null);
  const lowTrend = history.map((h) => h.pct?.low ?? null);

  return (
    <Panel title="Polarización · distribución por intensidad">
      {!anyWindow ? (
        <SinDatos text="Sin distribución de intensidad: hacen falta su umbral (o su FC máxima) y lecturas de pulso." />
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
  const pct = w.pct;
  const total = pct != null ? pctTotal(pct) : 0;
  // drift_vs_target: 0 = clavado al 80/0/20; cuanto más alto, más desviado. Es
  // null exactamente cuando no hay reparto, así que no hay tono que elegir.
  const drift = w.drift_vs_target;
  const driftTone: Tone = drift == null ? 'fg' : drift <= 15 ? 'ok' : drift <= 40 ? 'warn' : 'danger';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[color:var(--v2-fg)]">{WINDOW_LABEL[w.window]}</span>
        {pct == null || total <= 0 ? (
          <span className="text-[11px] text-[color:var(--v2-faint)]">Sin datos</span>
        ) : (
          <span className="v2-num text-[11px] text-[color:var(--v2-muted)]">
            {pct.low} / {pct.mid} / {pct.high}
            {drift != null ? (
              <>
                <span className="ml-2 text-[color:var(--v2-faint)]">·</span>
                <span className="ml-2" style={{ color: `var(${TONE_VAR[driftTone]})` }}>
                  desviación {drift}
                </span>
              </>
            ) : null}
          </span>
        )}
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--v2-surface-2)]">
        {pct != null && total > 0
          ? INTENSITY.map((z) => {
              const v = pct[z.key];
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
