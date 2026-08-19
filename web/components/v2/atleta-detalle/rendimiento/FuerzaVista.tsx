'use client';

// Fuerza — 1RM y tests (docs/DECISIONS.md 2026-08-13). No sexta pestaña.

import { FichaCard, FichaLabel } from '../resumen/piezas';
import { formatFechaCorta } from '@/lib/dashboard/v2/ficha-resumen';
import { TestsPanel } from '../tests/TestsPanel';
import type { V2AthleteDetalle } from '@/lib/dashboard/v2/atleta-detalle-types';
import { cn } from '@/lib/utils';

export function FuerzaVista({
  detalle,
  coachName,
}: {
  detalle: V2AthleteDetalle;
  coachName: string;
}) {
  const maxes = detalle.strength_maxes;

  return (
    <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-4">
      <FichaCard>
        <div className="flex items-baseline justify-between gap-2">
          <FichaLabel>1RM</FichaLabel>
          {maxes[0]?.recorded_at ? (
            <span className="v2-num text-[11.5px] text-[color:var(--v2-muted)]">
              {formatFechaCorta(maxes[0].recorded_at.slice(0, 10))}
            </span>
          ) : null}
        </div>
        {maxes.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 divide-y divide-[color:var(--v2-border)] overflow-hidden rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {maxes.map((m) => {
              const prev = m.history.length >= 2 ? m.history[m.history.length - 2]!.one_rm_kg : null;
              const delta = prev != null ? m.one_rm_kg - prev : null;
              return (
                <div key={m.exercise_slug} className="px-3.5 py-3">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[color:var(--v2-muted)]">
                    {m.exercise_label}
                  </p>
                  <p className="mt-1 font-[family-name:var(--v2-font-display)] text-[28px] font-extrabold italic leading-none tracking-[-0.03em]">
                    {Math.round(m.one_rm_kg)}
                    <span className="ml-1 text-[12px] font-medium not-italic text-[color:var(--v2-muted)]">
                      kg
                    </span>
                    {delta != null && delta !== 0 ? (
                      <span
                        className={cn(
                          'ml-1.5 text-[12px] font-semibold not-italic',
                          delta > 0 ? 'text-[color:var(--v2-ok)]' : 'text-[color:var(--v2-danger)]',
                        )}
                      >
                        {delta > 0 ? '+' : ''}
                        {Math.round(delta)}
                      </span>
                    ) : null}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-[color:var(--v2-muted)]">Todavía no hay un 1RM registrado.</p>
        )}
      </FichaCard>

      <TestsPanel
        athleteId={detalle.header.athlete_id}
        athleteName={detalle.header.full_name}
        coachName={coachName}
        tests={detalle.tests}
        library={detalle.test_library}
      />
    </div>
  );
}
