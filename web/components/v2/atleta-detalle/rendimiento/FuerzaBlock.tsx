'use client';

// Fuerza: el 1RM de cada levantamiento con su tendencia (cada versión es una
// medida real, nunca estimada de un WOD) y la progresión de sus tests
// cronometrados. Sin nada: una línea con cómo conseguirlo.

import { EmptyState, List, ListRow, SectionHeader, Sparkline } from '@/components/v2/ui';
import { shortDate } from '@/components/v2/shared/format';
import type { BenchmarkSeries, StrengthMaxView } from '@/lib/dashboard/v2/ficha-rendimiento';
import { benchmarkMetric } from '@fahybrid/shared/domain/coach/benchmark-slugs';
import { formatClock } from '@/lib/dashboard/v2/ficha-format';
import { cn } from '@/lib/utils';

const SOURCE_ES: Record<string, string> = {
  onboarding: 'lo dijo al darse de alta',
  coach_test: 'test con el coach',
  athlete_test: 'test del atleta',
};

function kg(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')} kg`;
}

function benchValue(unit: string, v: number): string {
  const m = benchmarkMetric(unit);
  if (m === 'time') return formatClock(v);
  if (m === 'load') return kg(v);
  if (m === 'rate') return `${Math.round(v)} ppm`;
  if (m === 'power') return `${Math.round(v)} W`;
  if (m === 'distance') return `${Math.round(v)} m`;
  if (m === 'height') return `${Math.round(v)} cm`;
  return `${Math.round(v)} reps`;
}

function Delta({ now, prev, lowerBetter, fmt }: { now: number; prev: number | null; lowerBetter: boolean; fmt: (n: number) => string }) {
  if (prev == null || now === prev) return null;
  const better = lowerBetter ? now < prev : now > prev;
  const diff = Math.abs(now - prev);
  return (
    <span className={cn('t-meta t-tnum', better ? 'text-v2-ok' : 'text-v2-warn')}>
      {now > prev ? '+' : '−'}
      {fmt(diff)}
    </span>
  );
}

export function FuerzaBlock({ maxes, benchmarks }: { maxes: StrengthMaxView[]; benchmarks: BenchmarkSeries[] }) {
  const tests = benchmarks.filter((b) => benchmarkMetric(b.unit) !== 'load');
  if (maxes.length === 0 && tests.length === 0) {
    return (
      <EmptyState
        title="Sin 1RM ni tests registrados"
        description="programa un test en «Zonas y tests» o apunta un resultado"
      />
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <SectionHeader title="1RM" count={maxes.length || null} />
        {maxes.length === 0 ? (
          <EmptyState title="Sin 1RM registrado" />
        ) : (
          <List aria-label="1RM por levantamiento">
            {maxes.map((m) => {
              const prev = m.history.length >= 2 ? m.history[m.history.length - 2]!.one_rm_kg : null;
              return (
                <ListRow
                  key={m.exercise_slug}
                  density="compact"
                  title={m.exercise_label}
                  detail={`${shortDate(m.recorded_at)} · ${SOURCE_ES[m.source] ?? m.source}`}
                  trailing={
                    <span className="flex items-center gap-3">
                      {m.history.length >= 2 ? (
                        <Sparkline
                          values={m.history.map((h) => h.one_rm_kg)}
                          labels={m.history.map((h) => shortDate(h.recorded_at))}
                          format={(v) => kg(v)}
                          width={64}
                          height={20}
                          aria-label={`${m.exercise_label}: evolución del 1RM`}
                        />
                      ) : null}
                      <Delta now={m.one_rm_kg} prev={prev} lowerBetter={false} fmt={kg} />
                      <span className="w-16 text-right t-body font-semibold text-v2-fg t-tnum">{kg(m.one_rm_kg)}</span>
                    </span>
                  }
                />
              );
            })}
          </List>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <SectionHeader title="Tests" count={tests.length || null} />
        {tests.length === 0 ? (
          <EmptyState title="Sin tests cronometrados" />
        ) : (
          <List aria-label="Tests">
            {tests.map((b) => {
              const last = b.results[b.results.length - 1]!;
              const prev = b.results.length >= 2 ? b.results[b.results.length - 2]!.value : null;
              const lowerBetter = benchmarkMetric(b.unit) === 'time';
              return (
                <ListRow
                  key={b.exercise_slug}
                  density="compact"
                  title={b.label}
                  detail={`${shortDate(last.recorded_at)} · ${b.results.length} ${b.results.length === 1 ? 'medida' : 'medidas'}`}
                  trailing={
                    <span className="flex items-center gap-3">
                      <Delta now={last.value} prev={prev} lowerBetter={lowerBetter} fmt={(n) => benchValue(b.unit, n)} />
                      <span className="w-16 text-right t-body font-semibold text-v2-fg t-tnum">{benchValue(b.unit, last.value)}</span>
                    </span>
                  }
                />
              );
            })}
          </List>
        )}
      </div>
    </div>
  );
}
