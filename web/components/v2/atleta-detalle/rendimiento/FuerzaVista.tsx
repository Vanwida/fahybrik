'use client';

// Fuerza — 1RM, tests, salto. Lo que ya viene en la ficha, sin otro fetch.

import { Link } from '@/i18n/navigation';
import { FichaCard, FichaLabel, FilaVacia } from '../resumen/piezas';
import { formatFechaCorta } from '@/lib/dashboard/v2/ficha-resumen';
import type { V2AthleteDetalle } from '@/lib/dashboard/v2/atleta-detalle-types';
import { cn } from '@/lib/utils';

export function FuerzaVista({ detalle }: { detalle: V2AthleteDetalle }) {
  const id = detalle.header.athlete_id;
  const maxes = detalle.strength_maxes;
  const tests = detalle.tests;
  const pendientes = tests.filter((t) => t.result_pending);
  const hechos = tests.filter((t) => t.result_captured);
  const saltos = tests.filter((t) => t.jump_profile != null);

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
          <div className="mt-3 grid grid-cols-2 divide-y divide-[color:var(--v2-border)] overflow-hidden rounded-[10px] border border-[color:var(--v2-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
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
                          delta > 0 ? 'text-[#2F7D4F]' : 'text-[#B04A2F]',
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

      {saltos.length > 0 ? (
        <FichaCard>
          <FichaLabel>Salto</FichaLabel>
          <ul className="mt-3 divide-y divide-[color:var(--v2-border)]">
            {saltos.map((t) => (
              <li key={t.assignment_id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="text-[13px] font-semibold">{t.label}</span>
                <span className="v2-num text-[13px] text-[color:var(--v2-muted)]">
                  {t.result_label ?? 'sin número'}
                </span>
              </li>
            ))}
          </ul>
        </FichaCard>
      ) : null}

      <FichaCard>
        <FichaLabel>Tests</FichaLabel>
        {pendientes.length > 0 ? (
          <div className="mt-2.5 flex flex-col gap-1.5">
            {pendientes.map((t) => (
              <FilaVacia
                key={t.assignment_id}
                texto={`${t.label} · sin resultado`}
                cta="Ver"
                href={`/atletas/${id}?tab=plan`}
              />
            ))}
          </div>
        ) : null}
        {hechos.length > 0 ? (
          <ul className="mt-3 divide-y divide-[color:var(--v2-border)]">
            {hechos.map((t) => (
              <li key={t.assignment_id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="text-[13px] font-semibold">{t.label}</span>
                <span className="v2-num text-[13px] text-[color:var(--v2-muted)]">
                  {t.result_label}
                  {t.scheduled_for ? ` · ${formatFechaCorta(t.scheduled_for)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : pendientes.length === 0 ? (
          <p className="mt-3 text-[13px] text-[color:var(--v2-muted)]">
            No hay tests programados.{' '}
            <Link href={`/atletas/${id}?tab=atleta`} className="font-semibold text-[#C24A0F]">
              Programar →
            </Link>
          </p>
        ) : null}
      </FichaCard>
    </div>
  );
}
