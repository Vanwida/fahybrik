'use client';

// AthleteTableRow — una fila del roster, enlace entero a la ficha del atleta.
//
// DOS FORMAS, EL MISMO DATO (§9.3 «el responsive recompone, no esconde»):
//   · < lg → dos líneas: identidad arriba; fase · adherencia · último registro
//            abajo. Antes la adherencia sólo existía desde 1024 y el último
//            registro desde 1280, así que en el móvil de Pablo el roster no
//            servía para triar: se veían un nombre y un estado.
//   · ≥ lg → la fila de tabla, con las columnas de `GRID_COLS`.
// No hay ni un dato que exista en un ancho y falte en otro.
//
// La fila lleva un acento izquierdo del color de su estado + un tinte suave, así
// el ojo baja la lista triando por color antes de leer.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { AdherenceBar } from '@/components/v2/AdherenceBar';
import { Pill } from '@/components/v2/Pill';
import { RosterStatusDot } from '@/components/v2/atletas/RosterStatusDot';
import { ROSTER_STATUS_META } from '@/lib/dashboard/v2/atletas-status';
import { injuryBadge } from '@/components/v2/atleta-detalle/injuries/injury-presentation';
import type { RosterRow } from '@/lib/dashboard/v2/atletas-row';
import { formatRelative } from '@/lib/dashboard/relative-time';
import { cn } from '@/lib/utils';
import { GRID_COLS } from '@/components/v2/atletas/grid';
import { WeekStateChip } from '@/components/v2/WeekStateChip';

/** Las marcas que cuelgan del estado (lesión, pausa pedida, check-in en riesgo).
 *  Se pintan igual en las dos formas de la fila, así que viven en un sitio. */
function MarcasDeEstado({ row }: { row: RosterRow }) {
  return (
    <>
      {row.injury
        ? (() => {
            const badge = injuryBadge(row.injury.zone, row.injury.status);
            return (
              <Pill tone={badge.tone} variant="soft" className="max-w-full" title="Lesión registrada">
                <MIcon name="personal_injury" size={11} />
                <span className="truncate">{badge.label}</span>
              </Pill>
            );
          })()
        : null}
      {row.pause_request_label ? (
        <Pill tone="warn" variant="soft" className="max-w-full" title="El atleta ha pedido una pausa">
          <MIcon name="pan_tool" size={11} />
          <span className="truncate">Pidió pausa</span>
        </Pill>
      ) : null}
      {row.checkin_risk_sub != null ? (
        <Pill
          tone="danger"
          variant="soft"
          className="max-w-full"
          title="El check-in de HOY viene en banda de riesgo"
        >
          <MIcon name="sentiment_dissatisfied" size={11} />
          <span className="truncate">
            Check-in <span className="font-mono">{row.checkin_risk_sub}</span>
          </span>
        </Pill>
      ) : null}
    </>
  );
}

/** Último registro — «hace 2 d», o la ausencia dicha en claro. */
function UltimoRegistro({ row }: { row: RosterRow }) {
  return row.last_activity_at ? (
    <span className="v2-num text-xs text-[color:var(--v2-muted)]">
      {formatRelative(row.last_activity_at)}
    </span>
  ) : (
    <span className="text-xs text-[color:var(--v2-faint)]">sin registros</span>
  );
}

export function AthleteTableRow({ row, index }: { row: RosterRow; index: number }) {
  const statusMeta = ROSTER_STATUS_META[row.status];
  const tint = statusMeta.rowTintVar;

  return (
    <Link
      href={`/atletas/${row.athlete_id}`}
      className={cn(
        'v2-focus v2-stagger group block border-b border-[color:var(--v2-border)] px-3 py-2.5',
        'transition-colors hover:bg-[color:var(--v2-elevated)]',
        // Los estados en reposo (pausa / baja) se leen apagados; el hover les
        // devuelve el contraste cuando el coach los enfoca.
        statusMeta.muted && 'opacity-60 hover:opacity-100',
        'lg:grid lg:items-center lg:gap-3',
        GRID_COLS,
      )}
      style={{
        ['--v2-stagger-i' as string]: index,
        boxShadow: `inset 3px 0 0 0 var(${statusMeta.colorVar})`,
        background: tint ? `var(${tint})` : undefined,
      }}
    >
      {/* ── Atleta ─────────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 items-center gap-2.5 pl-1">
        <AthleteAvatar name={row.full_name} imageUrl={row.avatar_url} size="sm" />
        <span className="truncate text-body font-semibold text-[color:var(--v2-fg)]">
          {row.full_name}
        </span>
        {/* El nivel viaja pegado al nombre por debajo de lg (arriba tiene columna). */}
        <span className="lg:hidden">
          <LevelBadge level={row.level} />
        </span>
        <span className="ml-auto shrink-0 text-[color:var(--v2-faint)] lg:hidden">
          <MIcon name="chevron_right" size={18} />
        </span>
      </div>

      {/* ── Nivel (columna propia sólo en tabla) ───────────────────────────── */}
      <div className="hidden lg:block">
        <LevelBadge level={row.level} />
      </div>

      {/* ── Estado ─────────────────────────────────────────────────────────── */}
      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1 lg:mt-0 lg:flex-col lg:items-start">
        <RosterStatusDot status={row.status} detail={row.status_detail} />
        <MarcasDeEstado row={row} />
      </div>

      {/* ── Semana calendario — la ve / no la ve / vacía / acabó / sin plan ─ */}
      <div className="hidden min-w-0 lg:block">
        <WeekStateChip chip={row.week_chip} />
      </div>

      {/* ── Fase actual — bloque para que `truncate` recorte de verdad ─────── */}
      <div className="hidden min-w-0 lg:block" title={row.phase_label}>
        <span
          className={cn(
            'block truncate text-xs',
            row.phase_code ? 'text-[color:var(--v2-muted)]' : 'text-[color:var(--v2-faint)]',
          )}
        >
          {row.phase_label}
        </span>
      </div>

      {/* ── Adherencia (tabla) ─────────────────────────────────────────────── */}
      <div className="hidden lg:block">
        <AdherenceBar pct={row.adherence_pct} />
      </div>

      {/* ── Último registro (tabla) ────────────────────────────────────────── */}
      <div className="hidden lg:block">
        <UltimoRegistro row={row} />
      </div>

      {/* ── Chevron (tabla) ────────────────────────────────────────────────── */}
      <div className="hidden justify-end text-[color:var(--v2-faint)] transition-colors group-hover:text-[color:var(--v2-muted)] lg:flex">
        <MIcon name="chevron_right" size={20} />
      </div>

      {/* ── Segunda línea (< lg) — los datos de triaje, que antes desaparecían.
             Misma información que las columnas de arriba, recompuesta. ─────── */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[calc(1.75rem+0.625rem+0.25rem)] lg:hidden">
        <WeekStateChip chip={row.week_chip} />
        <span className="min-w-0 max-w-full truncate text-xs text-[color:var(--v2-faint)]" title={row.phase_label}>
          {row.phase_label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="v2-micro">adh.</span>
          <AdherenceBar pct={row.adherence_pct} />
        </span>
        <UltimoRegistro row={row} />
      </div>
    </Link>
  );
}
