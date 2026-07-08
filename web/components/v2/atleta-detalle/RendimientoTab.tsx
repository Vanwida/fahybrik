'use client';

// RENDIMIENTO — the coach's performance deep dive for one athlete. Lazy client
// fetch (CarrerasTab pattern): loads the diagnostic payload on mount and gates the
// whole tab on real data. Composition mirrors BiometriaTab — an "Evaluar semana"
// autoregulation panel on top, a headline stat cluster, then one Panel per payload
// section (readiness composite, 80/0/20 polarization, top exercises, running
// economy, lactate threshold, anaerobic capacity, HYROX prediction). Every section
// renders honest empty states; nothing is mocked.

import { useCallback, useEffect, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { EvaluarSemanaPanel } from './rendimiento/EvaluarSemanaPanel';
import {
  ExercisesPanel,
  PolarizationPanel,
  ReadinessPanel,
} from './rendimiento/DiagnosticPanels';
import {
  AnaerobicPanel,
  HyroxPredictionPanel,
  LtPanel,
  RunningEconomyPanel,
} from './rendimiento/PhysiologyPanels';
import { PerfTile, type Tone } from './rendimiento/ui';
import { EM_DASH, fmtInt, fmtPace, lastNonNull } from './rendimiento/format';
import type { PerformancePayload } from '@/lib/dashboard/coach/deep-dive-performance';

const GEN_FMT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
});

function readinessTone(score: number): Tone {
  if (score >= 65) return 'ok';
  if (score >= 45) return 'warn';
  return 'danger';
}

export function RendimientoTab({ athleteId }: { athleteId: string }) {
  const [performance, setPerformance] = useState<PerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/performance`);
      const body = (await res.json().catch(() => null)) as
        | { performance?: PerformancePayload; error?: { message?: string } }
        | null;
      if (!res.ok || !body) {
        setLoadError(body?.error?.message ?? 'No se pudo cargar el rendimiento.');
        return;
      }
      setPerformance(body.performance ?? null);
    } catch {
      setLoadError('No se pudo cargar el rendimiento.');
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4 text-xs text-[color:var(--v2-faint)]">
        <MIcon name="progress_activity" size={16} className="animate-spin" />
        Cargando rendimiento…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[var(--v2-r-l)] border border-[color:var(--v2-danger)] bg-[color:var(--v2-danger-soft)] p-4">
        <span className="text-xs font-medium text-[color:var(--v2-danger)]">{loadError}</span>
        <button
          type="button"
          onClick={() => void reload()}
          className="v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] border border-[color:var(--v2-danger)] px-2.5 text-[11px] font-semibold text-[color:var(--v2-danger)]"
        >
          <MIcon name="refresh" size={13} />
          Reintentar
        </button>
      </div>
    );
  }

  if (!performance || !performance.has_any_data) {
    return (
      <EmptyState
        icon="show_chart"
        title="Sin datos de rendimiento todavía"
        description="Cuando el atleta registre entrenos con tiempos, potencia y frecuencia cardíaca, verás aquí su diagnóstico: readiness, polarización, economía, umbral y capacidad anaeróbica."
      />
    );
  }

  const latestReadiness =
    performance.race_readiness_history.length > 0
      ? performance.race_readiness_history[performance.race_readiness_history.length - 1]!.score
      : null;
  const latestEconomy = lastNonNull(
    performance.running_economy.map((p) => p.pace_at_145bpm_sec_per_km),
  );
  const latestLtHr = lastNonNull(performance.lt_history.map((p) => p.lt_hr_bpm));
  const latestPower = lastNonNull(performance.anaerobic_capacity.map((p) => p.best_3min_avg_w));

  return (
    <div className="flex flex-col gap-5">
      {/* Header · generated-at recency */}
      <div className="flex items-center gap-2 text-xs text-[color:var(--v2-muted)]">
        <MIcon name="analytics" size={16} className="text-[color:var(--v2-faint)]" />
        <span>
          Diagnóstico de rendimiento · actualizado{' '}
          <span className="v2-num font-semibold text-[color:var(--v2-fg)]">
            {GEN_FMT.format(new Date(performance.generated_at_iso))}
          </span>
        </span>
      </div>

      {/* Autoregulation — evaluate / review the week (self-contained fetch) */}
      <EvaluarSemanaPanel athleteId={athleteId} />

      {/* Headline stat cluster */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PerfTile
          label="Readiness"
          value={latestReadiness != null ? `${latestReadiness}` : EM_DASH}
          unit={latestReadiness != null ? '/100' : undefined}
          tone={latestReadiness != null ? readinessTone(latestReadiness) : 'fg'}
        />
        <PerfTile label="Economía Z2" value={fmtPace(latestEconomy)} tone="info" />
        <PerfTile label="FC de umbral" value={fmtInt(latestLtHr)} unit={latestLtHr != null ? 'ppm' : undefined} tone="fg" />
        <PerfTile label="Potencia 3 min" value={fmtInt(latestPower)} unit={latestPower != null ? 'W' : undefined} tone="accent" />
      </div>

      {/* 1 · Readiness composite */}
      <ReadinessPanel history={performance.race_readiness_history} />

      {/* 2 · Polarization 80/0/20 */}
      <PolarizationPanel
        byWindow={performance.polarization_by_window}
        history={performance.polarization_history}
      />

      {/* 3 · Top exercises */}
      <ExercisesPanel exercises={performance.exercises} />

      {/* 4 · Running economy + 5 · Lactate threshold */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <RunningEconomyPanel series={performance.running_economy} />
        <LtPanel series={performance.lt_history} />
      </div>

      {/* 6 · Anaerobic capacity + 7 · HYROX prediction */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <AnaerobicPanel series={performance.anaerobic_capacity} />
        <HyroxPredictionPanel prediction={performance.hyrox_prediction} />
      </div>
    </div>
  );
}
