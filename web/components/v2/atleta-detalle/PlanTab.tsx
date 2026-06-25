'use client';

// PLAN ACTUAL — the athlete's live microcycle at a glance. Header (microcycle
// name + phase/week pill + published/draft status + open-in-editor); a microcycle
// progress strip (mini week-cards w/ load bars); then two columns: LEFT today's
// session + this-week 7-day cells, RIGHT a 4-tile snapshot + recent execution
// (prescrito→hecho) + "a vigilar" + actions. All from the real AthletePlanPayload
// (weeks/sessions) + AthleteResumen (compliance, readiness). Empty plan → a calm
// EmptyState with a link to assign.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { MODALITY_META } from '@/components/v2/constants';
import { Pill } from '@/components/v2/Pill';
import { StatTile } from '@/components/v2/StatTile';
import { EmptyState } from '@/components/v2/EmptyState';
import { Panel, WeekStrip, type WeekStripDay } from './parts';
import { sessionModality } from './modality';
import type { AthletePlanPayload, PlanSession } from '@/lib/dashboard/coach/athlete-plan';
import type { AthleteResumen } from '@/lib/dashboard/coach/resumen';
import { cn } from '@/lib/utils';

function findTodaySession(plan: AthletePlanPayload): PlanSession | null {
  for (const w of plan.weeks) {
    const today = w.days.find((d) => d.is_today);
    if (today) return today.sessions[0] ?? null;
  }
  return null;
}

function findCurrentWeekDays(plan: AthletePlanPayload): WeekStripDay[] {
  const week = plan.weeks.find((w) => w.days.some((d) => d.is_today)) ?? plan.weeks[0];
  if (!week) return [];
  return week.days.map((d) => {
    const s = d.sessions[0] ?? null;
    const modality = s ? sessionModality({ format: s.format, title: s.title }) : null;
    let state: WeekStripDay['state'] = 'rest';
    if (!s) state = 'rest';
    else if (d.is_today) state = 'today';
    else if (s.status === 'completed') state = 'done';
    else state = 'scheduled';
    return { label: d.label, modality, state };
  });
}

/** Compact load bar fill (0–100) for a microcycle progress mini-card. We use the
 *  week's compliance as the visible load proxy until a true planned-load metric
 *  is exposed. */
function MiniWeekCard({
  label,
  pct,
  status,
}: {
  label: string;
  pct: number | null;
  status: 'completed' | 'current' | 'upcoming' | 'missed';
}) {
  const fill = pct ?? 0;
  const tone =
    status === 'missed'
      ? 'var(--v2-danger)'
      : status === 'current'
        ? 'var(--v2-accent)'
        : status === 'completed'
          ? 'var(--v2-ok)'
          : 'var(--v2-faint)';
  return (
    <div
      className={cn(
        'flex min-w-[68px] flex-1 flex-col gap-1.5 rounded-[var(--v2-r-s)] border px-2.5 py-2',
        status === 'current'
          ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)]'
          : 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]',
      )}
    >
      <span className="v2-micro text-[9px]">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--v2-surface)]">
        <div className="h-full rounded-full" style={{ width: `${fill}%`, background: tone }} />
      </div>
      <span className="v2-num text-[10px] font-semibold" style={{ color: tone }}>
        {pct != null ? `${pct}%` : '—'}
      </span>
    </div>
  );
}

function RecentRow({ s }: { s: PlanSession }) {
  const modality = sessionModality({ format: s.format, title: s.title });
  const ok = s.status === 'completed';
  return (
    <tr className="border-b border-[color:var(--v2-border)] last:border-0">
      <td className="py-2 pr-2">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-3.5 w-0.5 shrink-0 rounded-full"
            style={{ background: `var(${MODALITY_META[modality].colorVar})` }}
          />
          <span className="truncate text-xs font-medium text-[color:var(--v2-fg)]">{s.title}</span>
        </span>
      </td>
      <td className="py-2 px-2 text-xs text-[color:var(--v2-muted)]">
        {ok ? 'Hecho' : s.status === 'missed' ? 'Perdida' : 'Pendiente'}
      </td>
      <td className="v2-num py-2 px-2 text-right text-xs text-[color:var(--v2-muted)]">
        {s.rpe != null ? `RPE ${s.rpe}` : '—'}
      </td>
      <td className="py-2 pl-2 text-right">
        <MIcon
          name={ok ? 'check_circle' : s.status === 'missed' ? 'warning' : 'schedule'}
          size={16}
          filled={ok}
          className={cn(
            ok
              ? 'text-[color:var(--v2-ok)]'
              : s.status === 'missed'
                ? 'text-[color:var(--v2-danger)]'
                : 'text-[color:var(--v2-faint)]',
          )}
        />
      </td>
    </tr>
  );
}

export function PlanTab({
  plan,
  resumen,
  athlete_id,
}: {
  plan: AthletePlanPayload | null;
  resumen: AthleteResumen | null;
  athlete_id: string;
}) {
  if (!plan || plan.total_sessions === 0) {
    return (
      <EmptyState
        icon="event_busy"
        title="Sin plan asignado todavía"
        description="Cuando el atleta esté clasificado, su secuencia se propone en Hoy para asignarla en un clic."
        action={
          <Link
            href="/v2/hoy"
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-[13px] font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="play_arrow" size={17} />
            Asignar secuencia en Hoy
          </Link>
        }
      />
    );
  }

  // Phase label resolved server-side through the coach's methodology_phases
  // (agnostic). Falls back to the raw enum only if the resolver yielded nothing.
  const blockName = plan.current_block_label ?? plan.current_block ?? '—';
  const blockWeek = plan.macro.block_week;
  const microName = plan.macro.phase_assignments.find(
    (p) => p.microcycle_id === plan.macro.weeks.find((w) => w.status === 'current')?.microcycle_id,
  )?.name;

  const todaySession = findTodaySession(plan);
  const weekDays = findCurrentWeekDays(plan);

  // Microcycle progress: the macro weeks of the active block.
  const macroWeeks = plan.macro.weeks.slice(0, 6);

  // Recent execution = the most recent sessions with an outcome.
  const recent: PlanSession[] = plan.weeks
    .flatMap((w) => w.days.flatMap((d) => d.sessions))
    .filter((s) => s.status === 'completed' || s.status === 'missed')
    .slice(-5)
    .reverse();

  const adher = resumen?.compliance_pct_7d ?? null;
  const adherTone = adher == null ? 'fg' : adher >= 75 ? 'ok' : adher >= 60 ? 'warn' : 'danger';
  const currentWeek = plan.macro.weeks.find((w) => w.status === 'current');
  const completedThisWeek = weekDays.filter((d) => d.state === 'done').length;
  const plannedThisWeek = weekDays.filter((d) => d.state !== 'rest').length;

  return (
    <div className="flex flex-col gap-5">
      {/* Header band */}
      <div className="flex flex-col gap-3 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3.5 shadow-[var(--v2-shadow-card)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-[color:var(--v2-fg)]">
            Microciclo «{microName ?? blockName}»
          </span>
          <Pill tone="neutral" variant="soft">
            {blockName}
            {blockWeek != null ? ` · sem ${blockWeek}` : ''}
          </Pill>
          <Pill tone="ok" variant="soft">
            publicado
          </Pill>
        </div>
        <Link
          href={`/v2/atletas/${athlete_id}?tab=plan`}
          className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
        >
          Abrir en editor de día
          <MIcon name="arrow_forward" size={15} />
        </Link>
      </div>

      {/* Microcycle progress strip */}
      <section className="flex flex-col gap-2.5">
        <h3 className="v2-micro">Progreso del microciclo</h3>
        <div className="flex flex-wrap gap-2">
          {macroWeeks.map((w, i) => (
            <MiniWeekCard
              key={w.week_start}
              label={`S${i + 1}`}
              pct={w.compliance_pct != null ? Math.round(w.compliance_pct) : null}
              status={w.status}
            />
          ))}
        </div>
      </section>

      {/* Two columns */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.1fr_1fr]">
        {/* LEFT */}
        <div className="flex flex-col gap-5">
          <Panel title="Sesión de hoy" bodyClassName="flex flex-col gap-3">
            {todaySession ? (
              <TodaySessionCard session={todaySession} />
            ) : (
              <p className="py-4 text-center text-xs text-[color:var(--v2-muted)]">
                Sin sesión programada hoy · día de descanso
              </p>
            )}
          </Panel>

          <Panel title="Esta semana">
            {weekDays.length > 0 ? (
              <WeekStrip days={weekDays} />
            ) : (
              <p className="text-center text-xs text-[color:var(--v2-muted)]">Semana sin datos</p>
            )}
          </Panel>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            <SnapshotTile label="Adherencia fase" value={adher != null ? `${adher}%` : '—'} tone={adherTone} />
            <SnapshotTile
              label="Cumplidas"
              value={`${completedThisWeek}/${plannedThisWeek || '—'}`}
              tone="fg"
            />
            <SnapshotTile
              label="Cumpl. semana"
              value={currentWeek?.compliance_pct != null ? `${Math.round(currentWeek.compliance_pct)}%` : '—'}
              tone="fg"
            />
            <SnapshotTile
              label="Readiness"
              value={resumen?.readiness_score != null ? `${resumen.readiness_score}` : '—'}
              tone={
                resumen?.readiness_score != null && resumen.readiness_score < 45
                  ? 'danger'
                  : resumen?.readiness_score != null && resumen.readiness_score < 55
                    ? 'warn'
                    : 'fg'
              }
            />
          </div>

          <Panel title="Ejecución reciente" bodyClassName="p-0 overflow-hidden">
            {recent.length > 0 ? (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[color:var(--v2-border)]">
                    <th className="v2-micro py-2 pl-3.5 text-left">Sesión</th>
                    <th className="v2-micro py-2 px-2 text-left">Estado</th>
                    <th className="v2-micro py-2 px-2 text-right">RPE</th>
                    <th className="v2-micro py-2 pr-3.5 text-right">✓</th>
                  </tr>
                </thead>
                <tbody className="[&>tr>td:first-child]:pl-3.5 [&>tr>td:last-child]:pr-3.5">
                  {recent.map((s) => (
                    <RecentRow key={s.assignment_id} s={s} />
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-3.5 py-5 text-center text-xs text-[color:var(--v2-muted)]">
                Sin ejecuciones registradas todavía
              </p>
            )}
          </Panel>

          {resumen?.readiness_score != null && resumen.readiness_score < 55 ? (
            <div className="flex items-start gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-warn)] bg-[color:var(--v2-warn-soft)] p-3">
              <MIcon name="visibility" size={18} className="mt-0.5 shrink-0 text-[color:var(--v2-warn)]" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold text-[color:var(--v2-fg)]">A vigilar</span>
                <span className="text-xs text-[color:var(--v2-muted)]">
                  Readiness {resumen.readiness_score}% — considera descargar carga esta semana.
                </span>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <PlanAction icon="forum" label="Mensaje" href="/v2/mensajes" />
            <PlanAction icon="event_repeat" label="Reprogramar" />
            <PlanAction icon="tune" label="Ajustar fase" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TodaySessionCard({ session }: { session: PlanSession }) {
  const modality = sessionModality({ format: session.format, title: session.title });
  const meta = MODALITY_META[modality];
  return (
    <div
      className="flex flex-col gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3"
      style={{ borderLeft: `3px solid var(${meta.colorVar})` }}
    >
      <div className="flex items-center justify-between gap-2">
        <Pill tone="accent" variant="solid">
          HOY
        </Pill>
        {session.status !== 'completed' ? (
          <Pill tone="warn" variant="soft">
            pendiente
          </Pill>
        ) : (
          <Pill tone="ok" variant="soft">
            completada
          </Pill>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-[color:var(--v2-fg)]">{session.title}</span>
        <span className="v2-num text-xs text-[color:var(--v2-muted)]">
          {meta.label}
          {session.duration_min != null ? ` · ${session.duration_min} min` : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
        >
          <MIcon name="visibility" size={15} />
          Ver / editar
        </button>
        <button
          type="button"
          className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] px-3 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="event_repeat" size={15} />
          Reprogramar
        </button>
      </div>
    </div>
  );
}

function SnapshotTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'fg' | 'ok' | 'warn' | 'danger' | 'info';
}) {
  return (
    <div className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3 shadow-[var(--v2-shadow-card)]">
      <StatTile label={label} value={value} tone={tone} className="gap-0.5" />
    </div>
  );
}

function PlanAction({ icon, label, href }: { icon: string; label: string; href?: string }) {
  const cls =
    'v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]';
  if (href) {
    return (
      <Link href={href} className={cls}>
        <MIcon name={icon} size={15} />
        {label}
      </Link>
    );
  }
  return (
    <button type="button" className={cls}>
      <MIcon name={icon} size={15} />
      {label}
    </button>
  );
}
