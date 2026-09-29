'use client';

// 1RM medido de cada levantamiento con su tendencia (cada versión es una medida
// real, nunca estimada de un WOD). Sus tests cronometrados los leen Progreso y
// Récords del panel. Sin nada: una línea con cómo conseguirlo.

import { EmptyState, List, ListRow, Sparkline } from '@/components/v2/ui';
import { shortDate } from '@/components/v2/shared/format';
import type { StrengthMaxView } from '@/lib/dashboard/v2/ficha-rendimiento';
import { cn } from '@/lib/utils';

const SOURCE_ES: Record<string, string> = {
  onboarding: 'lo dijo al darse de alta',
  coach_test: 'test con el coach',
  athlete_test: 'test del atleta',
};

function kg(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')} kg`;
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

export function FuerzaBlock({ maxes }: { maxes: StrengthMaxView[] }) {
  if (maxes.length === 0) {
    return <EmptyState title="Sin 1RM medido" description="sale de un test de fuerza o de lo que dijo al darse de alta" />;
  }
  return (
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
  );
}
