'use client';

// Cabecera de la ficha: dos filas, nunca tres. Lo pendiente es una línea de
// enlaces, no un banner. VO₂ / FC / VFC no viven aquí.

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { cn } from '@/lib/utils';
import type { DetalleHeader as HeaderData } from '@/lib/dashboard/v2/atleta-detalle-types';
import type { Pendiente } from '@/lib/dashboard/v2/ficha-resumen';
import { LifecycleControl } from '@/components/v2/atleta-detalle/lifecycle/LifecycleControl';

function HeaderAction({
  href,
  label,
  primary,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'v2-focus inline-flex h-[34px] items-center rounded-[8px] px-[13px] text-[12.5px] font-semibold transition-colors',
        primary
          ? 'bg-[color:var(--v2-accent)] px-[15px] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]'
          : 'border border-[color:var(--v2-border-strong)] text-[color:var(--v2-fg)] hover:bg-[color:var(--v2-surface-2)]',
      )}
    >
      {label}
    </Link>
  );
}

export function DetalleHeader({
  header,
  meta,
  pendientes,
  ocultarVerPlan,
}: {
  header: HeaderData;
  /** «Individual · 5 días/sem · alta hace 5 sem» — una sola línea. */
  meta: string;
  pendientes: Pendiente[];
  ocultarVerPlan?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const bloquea = pendientes.some((p) => p.bloquea);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <AthleteAvatar name={header.full_name} size="lg" className="h-11 w-11 shrink-0 text-sm" />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="v2-display truncate text-[27px] text-[color:var(--v2-fg)]">
                {header.full_name}
              </h1>
              <LevelBadge level={header.level} />
            </div>
            <p className="mt-0.5 truncate text-[13px] text-[color:var(--v2-muted)]">{meta}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <HeaderAction href={`/atletas/${header.athlete_id}?tab=mensajes`} label="Mensaje" />
          {ocultarVerPlan ? null : (
            <HeaderAction href={`/atletas/${header.athlete_id}?tab=plan`} label="Ver plan" primary />
          )}
          <div className="relative">
            <button
              type="button"
              aria-label="Más acciones"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
              className="v2-focus inline-flex h-[34px] w-[34px] items-center justify-center rounded-[8px] border border-[color:var(--v2-border-strong)] text-[color:var(--v2-fg)] hover:bg-[color:var(--v2-surface-2)]"
            >
              <span aria-hidden className="text-[16px] leading-none">
                ···
              </span>
            </button>
            {menu ? (
              <div className="absolute right-0 z-20 mt-1.5 min-w-[200px] rounded-[10px] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-1.5 shadow-[var(--v2-shadow-card)]">
                <LifecycleControl athleteId={header.athlete_id} lifecycle={header.lifecycle} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {pendientes.length > 0 ? (
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-[13px] leading-snug">
          <span
            aria-hidden
            className={cn(
              'mb-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full',
              bloquea ? 'bg-[color:var(--v2-danger)]' : 'bg-[color:var(--v2-accent)]',
            )}
          />
          <span className="text-[color:var(--v2-fg)]">
            {pendientes.length} {pendientes.length === 1 ? 'cosa tuya pendiente' : 'cosas tuyas pendientes'}:
          </span>
          {pendientes.map((p, i) => (
            <span key={p.key} className="inline-flex items-baseline gap-1.5">
              {i > 0 ? <span className="text-[color:var(--v2-faint)]">·</span> : null}
              <Link
                href={p.href}
                className={cn(
                  'v2-focus font-semibold underline decoration-[color:var(--v2-accent)] underline-offset-2 hover:text-[color:var(--v2-accent)]',
                  p.bloquea ? 'text-[color:var(--v2-danger)]' : 'text-[#C24A0F]',
                )}
              >
                {p.label}
              </Link>
            </span>
          ))}
          {pendientes.some((p) => p.en_hoy) ? (
            <span className="v2-num text-[11.5px] text-[color:var(--v2-faint)]">— también en Hoy</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
