'use client';

// Rail de contexto del plan (UX redesign hierarchy §6): columna estrecha,
// compacta y apilada — progreso del bloque ATR (fase + semana-en-fase + barra),
// próxima carrera (compacta) y suscripción (mini). Sustituye al antiguo grid
// ancho con la tarjeta enorme y vacía de suscripción. Naranja reservado al
// "hoy"/CTA/identidad: aquí el rail es neutro, con color semántico solo donde
// significa estado (adherencia del bloque, estado de la suscripción).

import { useEffect, useState } from 'react';
import type { AthletePlanPayload } from '@/lib/dashboard/coach/athlete-plan';
import type { AthleteSubscriptionStatus } from '@/lib/dashboard/coach/subscription-status';
import type { NextRace } from '@fahybrid/shared/schema';
import type { RaceListItem } from '@/lib/races/coach-races';
import type { AtrBlockType } from '@fahybrid/shared/domain/coach/types';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import { resolvePhase } from '@/lib/dashboard/coach/resolve-phase';
import { formatRaceTime, raceCategoryLineEs } from '@/lib/dashboard/coach/race-labels';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

interface AthleteContextRailProps {
  plan: AthletePlanPayload;
  blockWeek: number | null;
  /** Fases de periodización del coach (0052). [] → fallback ATR legacy. */
  coachPhases: ReadonlyArray<MethodologyPhase>;
  subscription: AthleteSubscriptionStatus | null;
}

// ── Card chrome shared by the three rail panels ────────────────────────────
function RailCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="micro-label">{title}</h3>
        <MIcon name={icon} size={16} className="text-[color:var(--text-muted)]" aria-hidden />
      </div>
      {children}
    </section>
  );
}

export function AthleteContextRail({
  plan,
  blockWeek,
  coachPhases,
  subscription,
}: AthleteContextRailProps) {
  return (
    <aside aria-label="Contexto del plan" className="flex flex-col gap-[var(--gutter)]">
      <AtrBlockPanel plan={plan} blockWeek={blockWeek} coachPhases={coachPhases} />
      <RaceRailPanel athleteId={plan.athlete_id} />
      <SubscriptionRailPanel subscription={subscription} />
    </aside>
  );
}

// ── 1) Progreso del bloque ───────────────────────────────────────────────────
function AtrBlockPanel({
  plan,
  blockWeek,
  coachPhases,
}: {
  plan: AthletePlanPayload;
  blockWeek: number | null;
  coachPhases: ReadonlyArray<MethodologyPhase>;
}) {
  const block = plan.macro.block;
  // Nombre de fase del resolver: usa el phase_id del bloque ACTIVO (0052) para
  // mostrar la fase del coach — idéntico al Macro roadmap. Sin phase_id / sin
  // fases del coach → cae al label ATR legacy.
  const phase = block
    ? resolvePhase(
        { type: block as AtrBlockType, phase_id: plan.macro.block_phase_id },
        coachPhases,
      ).label
    : null;
  const week = plan.macro.block_week ?? blockWeek;
  const span = block ? plan.macro.block_spans.find((s) => s.block_type === block) : null;
  const total = span?.week_count ?? null;
  const pct = week != null && total ? Math.min(100, Math.round((week / total) * 100)) : null;

  return (
    <RailCard title="Bloque" icon="view_week">
      {phase == null ? (
        <p className="text-xs text-[color:var(--text-muted)]">Sin bloque activo.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-heading-sm text-[color:var(--fg)]">{phase}</span>
            {week != null ? (
              <span className="metric-num text-xs text-[color:var(--text-muted)]">
                Semana {week}
                {total ? ` de ${total}` : ''}
              </span>
            ) : null}
          </div>
          {pct != null ? (
            <div
              className="h-1.5 w-full overflow-hidden rounded-[var(--r-pill)] bg-[color:var(--surface-container-high)]"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progreso del bloque: ${pct}%`}
            >
              <span
                className="block h-full rounded-[var(--r-pill)] bg-[color:var(--text-muted)]"
                style={{ width: `${pct}%` }}
              />
            </div>
          ) : null}
        </div>
      )}
    </RailCard>
  );
}

// ── 2) Próxima carrera (compacta) ──────────────────────────────────────────
type RaceLoad =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; target: NextRace | null; upcoming: RaceListItem[] };

function RaceRailPanel({ athleteId }: { athleteId: string }) {
  const [load, setLoad] = useState<RaceLoad>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/coach/athletes/${athleteId}/races`, {
          credentials: 'include',
        });
        if (!res.ok) {
          if (!cancelled) setLoad({ state: 'error' });
          return;
        }
        const payload = (await res.json()) as {
          target_race: NextRace | null;
          races: RaceListItem[];
        };
        const upcoming = payload.races.filter((r) => r.status !== 'completed');
        if (!cancelled) {
          setLoad({ state: 'ready', target: payload.target_race, upcoming });
        }
      } catch {
        if (!cancelled) setLoad({ state: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  return (
    <RailCard title="Próxima carrera" icon="flag">
      {load.state === 'loading' ? (
        <div className="h-16 animate-pulse rounded-[var(--r-m)] bg-[color:var(--surface-container-high)]" aria-hidden />
      ) : load.state === 'error' ? (
        <p className="text-xs text-[color:var(--text-muted)]">No se pudieron cargar las carreras.</p>
      ) : load.target == null ? (
        <div className="flex flex-col items-center gap-1 py-2 text-center">
          <MIcon name="event_busy" size={22} className="text-[color:var(--text-muted)]" aria-hidden />
          <p className="text-xs text-[color:var(--text-muted)]">Sin carrera objetivo.</p>
        </div>
      ) : (
        <RaceRailBody race={load.target} extra={load.upcoming.length - 1} />
      )}
    </RailCard>
  );
}

function formatRaceDateEs(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function RaceRailBody({ race, extra }: { race: NextRace; extra: number }) {
  const goal = formatRaceTime(race.goal_time_seconds);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-black italic leading-tight text-[color:var(--fg)]">
            {race.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
            {raceCategoryLineEs(race)}
          </p>
        </div>
        {/* Cuenta atrás: grande pero NEUTRA (naranja reservado a hoy/CTA, §4). */}
        <div className="shrink-0 text-right">
          <span className="metric-num block text-2xl font-bold leading-none text-[color:var(--fg)]">
            {race.days_until <= 0 ? '0' : race.days_until}
          </span>
          <span className="micro-label">{race.days_until === 1 ? 'día' : 'días'}</span>
        </div>
      </div>

      {/* Hechos apilados a ancho completo: la fecha larga ("2 de agosto de 2026")
          ya no se recorta (antes en grid de 2 columnas estrechas). */}
      <dl className="flex flex-col gap-2 border-t border-[color:var(--border-subtle)] pt-3">
        <RaceFact icon="calendar_month" label="Fecha" value={formatRaceDateEs(race.race_date)} />
        {goal ? <RaceFact icon="timer" label="Objetivo" value={goal} /> : null}
      </dl>

      {extra > 0 ? (
        <p className="text-[11px] text-[color:var(--text-muted)]">
          +{extra} carrera{extra === 1 ? '' : 's'} más en el calendario
        </p>
      ) : null}
    </div>
  );
}

function RaceFact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="flex shrink-0 items-center gap-1 micro-label tracking-[0.08em]">
        <MIcon name={icon} size={12} />
        {label}
      </dt>
      <dd className="metric-num text-right text-[13px] font-semibold text-[color:var(--fg)]">
        {value}
      </dd>
    </div>
  );
}

// ── 3) Suscripción (mini) ──────────────────────────────────────────────────
const PLAN_LABEL: Record<string, string> = {
  individual: 'Individual',
  dobles: 'Dobles',
  pro_elite: 'Pro',
};

type BadgeTone = 'success' | 'warning' | 'danger' | 'info';
const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: 'Activa', tone: 'success' },
  trialing: { label: 'Trial', tone: 'info' },
  past_due: { label: 'Pago pendiente', tone: 'warning' },
  incomplete: { label: 'Pago pendiente', tone: 'warning' },
  canceled: { label: 'Cancelada', tone: 'danger' },
};
const TONE_CLASS: Record<BadgeTone, string> = {
  success:
    'border-[color:color-mix(in_srgb,var(--status-success)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--status-success)_14%,transparent)] text-[color:var(--status-success)]',
  warning:
    'border-[color:color-mix(in_srgb,var(--status-warning)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--status-warning)_14%,transparent)] text-[color:var(--status-warning)]',
  danger:
    'border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_14%,transparent)] text-[color:var(--danger)]',
  info: 'border-[color:color-mix(in_srgb,var(--tertiary)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--tertiary)_14%,transparent)] text-[color:var(--tertiary)]',
};

function SubscriptionRailPanel({
  subscription,
}: {
  subscription: AthleteSubscriptionStatus | null;
}) {
  return (
    <RailCard title="Suscripción" icon="payments">
      {subscription == null ? (
        <p className="text-xs text-[color:var(--text-muted)]">Sin suscripción activa aún.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-[var(--r-pill)] border px-2 py-0.5',
              'text-[10px] font-bold uppercase tracking-[0.08em]',
              TONE_CLASS[STATUS_META[subscription.status]?.tone ?? 'info'],
            )}
          >
            {STATUS_META[subscription.status]?.label ?? subscription.status}
          </span>
          <span className="text-[13px] font-semibold text-[color:var(--fg)]">
            {PLAN_LABEL[subscription.plan_type] ?? subscription.plan_type}
          </span>
          {subscription.is_partner ? (
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
              · Pareja
            </span>
          ) : null}
        </div>
      )}
    </RailCard>
  );
}
