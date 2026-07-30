'use client';

// DetalleHeader — la banda de identidad de la ficha: avatar + nombre + sub-línea
// de estado, los indicadores QUE SE SABEN, la semana real comprimida y las
// acciones. Presentación pura: el dato llega del payload de la ficha.
//
// ERA EL PEOR CROMO DEL DASHBOARD: 440 px antes del primer dato a 1440 (las diez
// pestañas arrancaban en y=440), y a 390 la pantalla ENTERA era cromo —cabecera,
// indicadores vacíos, cuatro botones y la tira semanal— sin un solo dato. Ahora
// la identidad, los indicadores y las acciones comparten UNA fila, y la semana
// real viaja como tira de siete casillas en vez de como tarjeta.
//
// LO QUE NO SE SABE NO SE PINTA (§7): los indicadores llegaban con «—» cuando no
// había medida, así que en la esquina más valiosa de la ficha de un atleta recién
// dado de alta había CUATRO RAYAS. El contrato lo prohíbe con todas las letras
// («ni con guiones»). Un indicador sin medida no se pinta, y si no se sabe
// ninguno el grupo entero desaparece. No es un contador —«0 tests» sí sería
// información (§6.2 bis)—: es un valor medido, y hasta que se mide no existe.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { AuthorStamp } from '@/components/v2/AuthorStamp';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { StatusDot } from '@/components/v2/StatusDot';
import { StatTile } from '@/components/v2/StatTile';
import { LifecycleControl } from '@/components/v2/atleta-detalle/lifecycle/LifecycleControl';
import { TrainingDaysStrip } from '@/components/v2/atleta-detalle/TrainingDaysCard';
import { cn } from '@/lib/utils';
import {
  EM_DASH,
  type DetalleHeader as HeaderData,
  type DetalleStat,
  type TrainingDaysData,
} from '@/lib/dashboard/v2/atleta-detalle-types';

function HeaderAction({
  href,
  icon,
  label,
  primary,
}: {
  href: string;
  icon: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] px-3 text-body font-semibold transition-colors',
        primary
          ? 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]'
          : 'border border-[color:var(--v2-border)] text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
      )}
    >
      <MIcon name={icon} size={17} />
      {label}
    </Link>
  );
}

export function DetalleHeader({
  header,
  stats,
  training_days,
}: {
  header: HeaderData;
  stats: DetalleStat[];
  training_days: TrainingDaysData;
}) {
  const sub = [
    header.level != null ? `Nivel ${header.level}` : null,
    header.status_label,
    header.tenure_label,
    header.phase_label,
  ].filter(Boolean) as string[];

  // §7 — sólo los indicadores MEDIDOS. Sin ninguno, no hay grupo.
  const medidos = stats.filter((s) => s.value !== EM_DASH);

  return (
    <div className="flex flex-col gap-2.5">
      {/* ── Fila única: identidad · indicadores · semana · acciones ────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <AthleteAvatar name={header.full_name} size="lg" className="h-10 w-10 shrink-0 text-sm" />
          <div className="flex min-w-0 flex-col">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="v2-display truncate text-xl text-[color:var(--v2-fg)] sm:text-2xl">
                {header.full_name}
              </h1>
              <LevelBadge level={header.level} />
              {header.modality_label ? (
                <span className="v2-micro hidden sm:inline">{header.modality_label}</span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-label text-[color:var(--v2-muted)]">
              <StatusDot status={header.status} />
              {sub.map((s, i) => (
                <span key={s} className="flex items-center gap-2">
                  {i > 0 ? <span className="text-[color:var(--v2-faint)]">·</span> : null}
                  <span className={i === 0 ? 'font-semibold text-[color:var(--v2-fg)]' : undefined}>
                    {s}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Indicadores medidos + semana real. Los dos se callan si no hay dato.
            Sin `shrink-0`: a 390 el grupo tiene que poder ROMPER en varias
            líneas, no salirse por el borde derecho. */}
        {medidos.length > 0 || training_days ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
            {medidos.map((s) => (
              <StatTile key={s.label} label={s.label} value={s.value} tone={s.tone} className="gap-0.5" />
            ))}
            <TrainingDaysStrip data={training_days} />
          </div>
        ) : null}

        {/* Acciones — la principal y la de contacto juntas; el ciclo de vida al
            lado, que es raro y no debe pesar como «Ver plan» (§6 regla 4). */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <HeaderAction href="/mensajes" icon="forum" label="Mensaje" />
          <HeaderAction
            href={`/atletas/${header.athlete_id}?tab=plan`}
            icon="calendar_month"
            label="Ver plan"
            primary
          />
          <LifecycleControl athleteId={header.athlete_id} lifecycle={header.lifecycle} compact />
        </div>
      </div>

      {/* Sello de autoría (#43): quién dio el alta y quién editó. Cada uno se
          calla cuando no está atribuido. */}
      {header.authored.alta_by_name || header.authored.edited_by_name ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <AuthorStamp
            kind="coach"
            name={header.authored.alta_by_name}
            verb="dio de alta"
            at={header.authored.alta_at}
          />
          <AuthorStamp
            kind="coach"
            name={header.authored.edited_by_name}
            verb="editó"
            at={header.authored.edited_at}
          />
        </div>
      ) : null}
    </div>
  );
}
