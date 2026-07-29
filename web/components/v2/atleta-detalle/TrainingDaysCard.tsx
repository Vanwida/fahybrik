'use client';

// DÍAS DE ENTRENO · REALES (#47) — the athlete's OWN declared weekly pattern
// (availability_json, Step 5 onboarding / iOS "Mis días"), read-only for the
// coach. Rendered once in the ficha's permanent context zone (AthleteDetalle),
// NOT inside a tab — it stays visible no matter which sub-tab is open. Just the
// 7-day entreno/descanso grid: no load intensity, no conflict flags (out of
// scope for #47 — see the mockup sign-off).

import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { Panel } from './parts';
import { cn } from '@/lib/utils';
import { EM_DASH, type TrainingDaysData } from '@/lib/dashboard/v2/atleta-detalle-types';

export function TrainingDaysCard({ data }: { data: TrainingDaysData }) {
  const { days, training_days_per_week, has_availability } = data;

  return (
    <Panel
      title="Días de entreno · reales"
      className="max-w-[560px]"
      action={
        training_days_per_week != null ? (
          <Pill tone={has_availability ? 'accent' : 'neutral'} variant="soft">
            {training_days_per_week} días/sem
          </Pill>
        ) : null
      }
    >
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <div
            key={d.key}
            title={has_availability ? `${d.full_label} · ${d.trains ? 'entreno' : 'descanso'}` : d.full_label}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-[var(--v2-r-s)] border py-2.5 text-center',
              !has_availability
                ? 'border-dashed border-[color:var(--v2-border)]'
                : d.trains
                  ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)]'
                  : 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]',
            )}
          >
            <span className="v2-micro text-nano">{d.label}</span>
            {!has_availability ? (
              <span className="text-eyebrow text-[color:var(--v2-faint)]">{EM_DASH}</span>
            ) : d.trains ? (
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--v2-accent)' }}
              />
            ) : (
              <MIcon name="bedtime" size={13} className="text-[color:var(--v2-muted)]" />
            )}
          </div>
        ))}
      </div>
      {!has_availability ? (
        <p className="mt-2.5 text-label text-[color:var(--v2-faint)]">
          El atleta aún no ha marcado sus días reales en su app.
        </p>
      ) : null}
    </Panel>
  );
}
