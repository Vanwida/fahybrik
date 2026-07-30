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

/** La misma semana, comprimida a una tira de siete casillas para la banda fija de
 *  la ficha. El #47 pedía que los días reales se vean SIEMPRE, sin depender de la
 *  pestaña abierta — pero en su forma de tarjeta costaba ~100 px de los 440 de
 *  cromo que había antes del primer dato. Aquí se cumple lo mismo por ~28 px.
 *  Comparte las celdas con la tarjeta: una sola fuente de la semana. */
export function TrainingDaysStrip({ data }: { data: TrainingDaysData }) {
  const { days, training_days_per_week, has_availability } = data;
  if (!has_availability && training_days_per_week == null) return null;

  return (
    <div
      className="flex items-center gap-2"
      title={
        has_availability
          ? `Días de entreno reales: ${days.filter((d) => d.trains).map((d) => d.full_label).join(', ')}`
          : 'El atleta aún no ha marcado sus días reales en su app'
      }
    >
      <span className="v2-micro hidden sm:inline">días</span>
      <div className="flex items-center gap-1">
        {days.map((d) => (
          <span
            key={d.key}
            aria-hidden
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-[var(--v2-r-2xs)] text-nano font-bold uppercase',
              !has_availability
                ? 'border border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-faint)]'
                : d.trains
                  ? 'bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]'
                  : 'bg-[color:var(--v2-surface-2)] text-[color:var(--v2-faint)]',
            )}
          >
            {d.label.slice(0, 1)}
          </span>
        ))}
      </div>
      <span className="sr-only">
        {has_availability
          ? `Días de entreno reales: ${days.filter((d) => d.trains).map((d) => d.full_label).join(', ')}`
          : 'El atleta aún no ha marcado sus días reales'}
      </span>
    </div>
  );
}

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
