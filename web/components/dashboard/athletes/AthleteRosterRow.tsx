'use client';

// Fila de atleta del ROSTER (/atletas) — modelo TRAINING-LOG (à la
// AthleteWeekCalendar / revisar-mock): filas densas y escaneables a ancho
// completo, NO tarjetas grandes flotando en el vacío. La fila responde a la
// pregunta del coach al entrar: "¿a quién atiendo primero?". Columnas que USAN
// el ancho, sin dato anclado al borde derecho ni hueco muerto:
//   [barra de estado por READ del atleta] · [avatar + nombre + modalidad] ·
//   [bloque/fase ATR] · [métricas etiquetadas: Cumpl. N% · Readiness N] ·
//   [bandera de acción si la hay] · [carrera + cuenta atrás] · [chevron].
// Fila entera clicable → /atletas/[id] (mismo routing que la tarjeta anterior).
// Color: el acento es SOLO identidad/acción; el estado usa color SEMÁNTICO.

import { Link } from '@/i18n/navigation';
import type { AthleteRow } from '@/lib/dashboard/athletes/list';
import { disciplineLabel } from '@/lib/dashboard/athletes/discipline-label';
import {
  computeAthleteState,
  type AthleteStateRead,
} from '@/lib/dashboard/coach/athlete-status';
import { resolvePhase } from '@/lib/dashboard/coach/resolve-phase';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import { formatDaysUntilShort } from '@/lib/dashboard/coach/race-labels';
import { cn } from '@/lib/utils';
import { AthleteAvatar } from '@/components/dashboard/atoms/AthleteAvatar';
import { MIcon } from '@/components/dashboard/MIcon';

// ── Bandera de "necesita tu decisión" ───────────────────────────────────────
// Deriva de intake + estado de programación. UNA bandera (la más urgente), no
// chip-soup. El intake pendiente manda (bloquea la asignación del plan).
type ActionFlag = {
  label: string;
  icon: string;
  tone: 'accent' | 'danger' | 'warning';
};

function resolveActionFlag(athlete: AthleteRow): ActionFlag | null {
  if (athlete.intake_pending) {
    return { label: 'Intake pendiente', icon: 'assignment_ind', tone: 'accent' };
  }
  switch (athlete.programming_status) {
    case 'no_month':
      return { label: 'Sin plan activo', icon: 'event_busy', tone: 'danger' };
    case 'month_2_pending':
      return { label: 'Mes pendiente', icon: 'pending_actions', tone: 'warning' };
    case 'pending_proposal':
      return { label: 'Propuesta IA', icon: 'neurology', tone: 'accent' };
    case 'empty_week':
      return { label: 'Semana en borrador', icon: 'draft', tone: 'warning' };
    default:
      return null;
  }
}

const FLAG_TONE: Record<ActionFlag['tone'], string> = {
  accent:
    'border-[color:color-mix(in_srgb,var(--accent)_38%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] text-[color:var(--accent)]',
  danger:
    'border-[color:color-mix(in_srgb,var(--danger)_38%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_12%,transparent)] text-[color:var(--danger)]',
  warning:
    'border-[color:color-mix(in_srgb,var(--status-warning)_38%,transparent)] bg-[color:color-mix(in_srgb,var(--status-warning)_12%,transparent)] text-[color:var(--status-warning)]',
};

/** Resultado del read de estado memoizado por fila — expuesto para el orden. */
export function athleteStateRead(athlete: AthleteRow): AthleteStateRead {
  return computeAthleteState(athlete.compliance_pct, athlete.readiness_score);
}

interface AthleteRosterRowProps {
  athlete: AthleteRow;
  /**
   * Índice id→fase del coach (migración 0052) para resolver el nombre de fase del
   * bloque igual que la ficha del atleta. Map vacío pre-migración → el resolver
   * cae al enum ATR legacy y la etiqueta es idéntica a hoy.
   */
  phasesById: ReadonlyMap<string, MethodologyPhase>;
  withDivider: boolean;
  /** Índice en la lista — cadencia del reveal escalonado al cargar. */
  index?: number;
}

export function AthleteRosterRow({
  athlete,
  phasesById,
  withDivider,
  index = 0,
}: AthleteRosterRowProps) {
  const state = athleteStateRead(athlete);
  const flag = resolveActionFlag(athlete);
  // Resuelve la fase del bloque actual con las fases del coach (consistente con la
  // ficha del atleta): la etiqueta es el nombre de fase del coach ("Transformación")
  // y NO la etiqueta ATR legacy ("Intensificación"). Sin block_type → sin bloque.
  const phaseLabel = athlete.block_type
    ? resolvePhase(
        { type: athlete.block_type, phase_id: athlete.block_phase_id },
        phasesById,
      ).label
    : null;
  const dimmed = athlete.programming_status === 'empty_week';

  // "Intensificación · sem 1 de 4" — fase + semana RELATIVA AL BLOQUE (idéntica
  // al Hub: week_number macro − first_week + 1, no la week_number macro). El "de
  // N" usa el nº real de microciclos del bloque. Vocabulario del fundador:
  // "bloque"/fase, nunca "microciclo".
  const phaseLine = phaseLabel
    ? athlete.block_week != null
      ? athlete.block_total != null
        ? `${phaseLabel} · sem ${athlete.block_week} de ${athlete.block_total}`
        : `${phaseLabel} · sem ${athlete.block_week}`
      : phaseLabel
    : null;

  return (
    <Link
      role="listitem"
      href={`/atletas/${athlete.athlete_id}`}
      style={{ '--stagger-i': index } as React.CSSProperties}
      aria-label={`${athlete.full_name} — ${state.word}. Abrir ficha`}
      className={cn(
        'stagger-in focus-ring group/row relative flex min-h-[68px] w-full items-center gap-3 py-3 pl-4 pr-2',
        'transition-colors hover:bg-[color:var(--surface-container-low)]',
        withDivider && 'border-t border-[color:var(--border-subtle)]',
        dimmed && 'opacity-70',
      )}
    >
      {/* Barra de estado a altura completa, color SEMÁNTICO por read del atleta. */}
      <span
        aria-hidden
        className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r-[2px]"
        style={{ backgroundColor: state.tone }}
      />

      {/* IDENTIDAD: avatar + nombre + modalidad/disciplina + palabra de estado. */}
      <span className="flex min-w-0 flex-[2] items-center gap-3">
        <AthleteAvatar
          name={athlete.full_name}
          size="sm"
          className={cn(dimmed && 'opacity-60 grayscale')}
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-body-md text-[14px] font-semibold leading-tight text-[color:var(--fg)]">
            {athlete.full_name}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: state.tone }}
            />
            <span
              className="micro-label normal-case tracking-[0.04em]"
              style={{ color: state.tone }}
            >
              {state.word}
            </span>
            <span aria-hidden className="text-[color:var(--tertiary)]">·</span>
            <span className="truncate micro-label normal-case tracking-[0.04em]">
              {disciplineLabel(athlete.primary_discipline)}
            </span>
          </span>
        </span>
      </span>

      {/* BLOQUE / FASE ATR — "Intensificación · sem 1/4". Colapsa en pantallas
          estrechas (la info crítica de estado + acción se mantiene). */}
      <span className="hidden min-w-0 flex-1 lg:flex lg:flex-col lg:gap-0.5">
        {phaseLine ? (
          <>
            <span className="micro-label">Bloque</span>
            <span className="truncate font-body-md text-[13px] font-medium text-[color:var(--fg)]">
              {phaseLine}
            </span>
          </>
        ) : (
          <span className="micro-label text-[color:var(--text-muted)]">Sin bloque</span>
        )}
      </span>

      {/* MÉTRICAS etiquetadas — escala consistente, sin barra engañosa. Un % bajo
          se lee bajo (sin barra verde que lo contradiga). */}
      <span className="hidden shrink-0 flex-col gap-0.5 sm:flex sm:w-[7.5rem]">
        <span className="micro-label">Cumplimiento</span>
        <span className="font-body-md text-[13px] text-[color:var(--text-muted)]">
          <span className="metric-num font-semibold text-[color:var(--fg)]">
            {athlete.compliance_pct != null ? `${athlete.compliance_pct}%` : '—'}
          </span>
          <span aria-hidden className="px-1 text-[color:var(--tertiary)]">·</span>
          <span className="metric-num font-semibold text-[color:var(--fg)]">
            {athlete.readiness_score != null ? athlete.readiness_score : '—'}
          </span>{' '}
          <span className="micro-label normal-case tracking-[0.02em]">read.</span>
        </span>
      </span>

      {/* BANDERA de acción (si la hay) + CARRERA — agrupadas a la derecha pero
          ANTES del chevron, sin anclarse al borde. */}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {flag ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-[var(--r-pill)] border px-2.5 py-1',
              'text-[10px] font-bold uppercase tracking-[0.06em]',
              FLAG_TONE[flag.tone],
            )}
          >
            <MIcon name={flag.icon} size={13} filled aria-hidden />
            <span className="hidden md:inline">{flag.label}</span>
          </span>
        ) : null}

        {athlete.target_race ? (
          <span
            className="hidden max-w-[12rem] items-center gap-1.5 rounded-[var(--r-pill)] border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] xl:inline-flex border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] text-[color:var(--text-muted)]"
            title={`Carrera objetivo: ${athlete.target_race.name} · ${formatDaysUntilShort(athlete.target_race.days_until)}`}
          >
            <MIcon name="flag" size={13} className="shrink-0" aria-hidden />
            <span className="truncate">{athlete.target_race.name}</span>
            <span aria-hidden className="text-[color:var(--tertiary)]">·</span>
            <span className="metric-num shrink-0 normal-case text-[color:var(--fg)]">
              {formatDaysUntilShort(athlete.target_race.days_until)}
            </span>
          </span>
        ) : null}

        <MIcon
          name="chevron_right"
          size={18}
          className="shrink-0 text-[color:var(--text-muted)] transition-colors group-hover/row:text-[color:var(--fg)]"
          aria-hidden
        />
      </span>
    </Link>
  );
}
