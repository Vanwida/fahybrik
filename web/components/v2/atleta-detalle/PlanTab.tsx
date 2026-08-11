'use client';

// PLAN ACTUAL — the athlete's live microcycle at a glance. Header (microcycle
// name + phase/week pill + published/draft status + open-in-editor); a microcycle
// progress strip (mini week-cards w/ load bars); then two columns: LEFT today's
// session + this-week 7-day cells, RIGHT a 4-tile snapshot + recent execution
// (prescrito→hecho) + "a vigilar" + actions. All from the real AthletePlanPayload
// (weeks/sessions) + AthleteResumen (compliance, readiness). Empty plan → a calm
// EmptyState with a link to assign.

import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { SessionDetailDrawer } from './SessionDetailDrawer';
import { MODALITY_META } from '@/components/v2/constants';
import { Pill } from '@/components/v2/Pill';
import { StatTile } from '@/components/v2/StatTile';
import { EmptyState } from '@/components/v2/EmptyState';
import { OrderAlteredNotice } from '@/components/v2/OrderAlteredSignal';
import { ComoSeEncuentraPanel } from './ComoSeEncuentraPanel';
import { PersonalizarPlanModal } from './PersonalizarPlanModal';
import { VolverPeriodizacionModal } from './VolverPeriodizacionModal';
import { CadenaPersonalPanel } from './CadenaPersonalPanel';
import { PlanesPersonalesPanel } from './PlanesPersonalesPanel';
import { Panel, WeekStrip, type WeekStripDay } from './parts';
import { modalityColor, sessionModalityView } from './modality';
import type { AthletePlanPayload, PlanSession, PlanWeekRow } from '@/lib/dashboard/coach/athlete-plan';
import type { AthleteResumen } from '@/lib/dashboard/coach/resumen';
import { cn } from '@/lib/utils';

function findTodaySession(plan: AthletePlanPayload): PlanSession | null {
  for (const w of plan.weeks) {
    const today = w.days.find((d) => d.is_today);
    if (today) return today.sessions[0] ?? null;
  }
  return null;
}

// One week → the 7 day chips: modality color + state + the session FOCUS/title +
// a link into that day's editor (only days WITH a session are clickable).
function mapWeekToStripDays(week: PlanWeekRow, athleteId: string): WeekStripDay[] {
  return week.days.map((d) => {
    const s = d.sessions[0] ?? null;
    const modality = s ? sessionModalityView(s).slug : null;
    let state: WeekStripDay['state'] = 'rest';
    if (!s) state = 'rest';
    else if (d.is_today) state = 'today';
    // 'partial' is performed-but-incomplete — the coarse week strip treats it as
    // done (the precise ½ shows in the recent-sessions row + the session drawer).
    else if (s.status === 'completed' || s.status === 'partial') state = 'done';
    else state = 'scheduled';
    return {
      label: d.label,
      modality,
      state,
      title: s?.title ?? null,
      href: s ? `/atletas/${athleteId}/dia/${d.iso_date}` : null,
    };
  });
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "23–29 jun" (or "29 jun – 5 jul" across a month boundary) from ISO bounds. */
function formatWeekRange(week: PlanWeekRow): string {
  const s = week.week_start.split('-');
  const e = week.week_end.split('-');
  const sDay = Number(s[2]);
  const eDay = Number(e[2]);
  const sMonth = MONTHS_SHORT[Number(s[1]) - 1] ?? '';
  const eMonth = MONTHS_SHORT[Number(e[1]) - 1] ?? '';
  return sMonth === eMonth ? `${sDay}–${eDay} ${eMonth}` : `${sDay} ${sMonth} – ${eDay} ${eMonth}`;
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
      <span className="v2-micro text-nano">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--v2-surface)]">
        <div className="h-full rounded-full" style={{ width: `${fill}%`, background: tone }} />
      </div>
      <span className="v2-num text-eyebrow font-semibold" style={{ color: tone }}>
        {pct != null ? `${pct}%` : '—'}
      </span>
    </div>
  );
}

function RecentRow({ s, onOpen }: { s: PlanSession; onOpen: (assignmentId: string) => void }) {
  const modality = sessionModalityView(s);
  const ok = s.status === 'completed';
  const partial = s.status === 'partial';
  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={() => onOpen(s.assignment_id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(s.assignment_id);
        }
      }}
      className="v2-focus cursor-pointer border-b border-[color:var(--v2-border)] transition-colors last:border-0 hover:bg-[color:var(--v2-surface-2)]"
    >
      <td className="py-2 pr-2">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-3.5 w-0.5 shrink-0 rounded-full"
            style={{ background: modalityColor(modality.slug) }}
          />
          <span className="truncate text-xs font-medium text-[color:var(--v2-fg)]">{s.title}</span>
        </span>
      </td>
      <td className="py-2 px-2 text-xs text-[color:var(--v2-muted)]">
        {ok ? 'Hecho' : partial ? 'Parcial' : s.status === 'missed' ? 'Perdida' : 'Pendiente'}
      </td>
      <td className="v2-num py-2 px-2 text-right text-xs text-[color:var(--v2-muted)]">
        {s.rpe != null ? `RPE ${s.rpe}` : '—'}
      </td>
      <td className="py-2 pl-2 text-right">
        <MIcon
          name={
            ok
              ? 'check_circle'
              : partial
                ? 'contrast'
                : s.status === 'missed'
                  ? 'warning'
                  : 'schedule'
          }
          size={16}
          filled={ok}
          className={cn(
            ok
              ? 'text-[color:var(--v2-ok)]'
              : partial
                ? 'text-[color:var(--v2-warn)]'
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
  // The session whose prescrito→hecho detail is open in the drawer (assignment id).
  const [openSession, setOpenSession] = useState<string | null>(null);
  // Week navigation: index into plan.weeks for the "esta semana" strip. Defaults
  // to the week containing today; prev/next move within the materialized weeks.
  const initialWeekIdx = plan
    ? Math.max(0, plan.weeks.findIndex((w) => w.days.some((d) => d.is_today)))
    : 0;
  const [weekIdx, setWeekIdx] = useState(initialWeekIdx);
  // Personalizar plan (0164) — the confirmation modal that forks the athlete's
  // CURRENT microciclo into a bespoke one. Lives here (not inside the empty-plan
  // branch) since it needs a real current plan to fork FROM.
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  // Volver a la periodización (0166) — the inverse action, only ever offered
  // when there's a detached sequence cursor to resume (plan.can_revert_to_sequence).
  const [revertOpen, setRevertOpen] = useState(false);

  if (!plan || plan.total_sessions === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4">
        <EmptyState
          icon="event_busy"
          title="Sin plan asignado todavía"
          description="Cuando el atleta esté clasificado, su secuencia se propone en Hoy para asignarla en un clic — o empieza un plan a medida solo para él."
          action={
            <Link
              href="/hoy"
              className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-body font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]"
            >
              <MIcon name="play_arrow" size={17} />
              Asignar secuencia en Hoy
            </Link>
          }
        />
        <PlanesPersonalesPanel athleteId={athlete_id} />
      </div>
    );
  }

  // Microciclo name resolved server-side. Falls back to the raw microciclo name
  // only if no label was resolved.
  const blockName = plan.current_block_label ?? plan.current_block ?? '—';
  const blockWeek = plan.macro.block_week;
  // El nombre del microciclo que toca: el de la semana ACTUAL, y si el plan aún
  // no ha arrancado, el de la primera que viene.
  //
  // Se casa por FECHA, no por id: `phase_assignments[].microcycle_id` es el id
  // del RECIBO (`athlete_month_assignments.id`), mientras que las semanas llevan
  // el id de microciclo real de la asignación. Compararlos nunca casaba, así que
  // el encabezado decía «Microciclo «—»» siempre — incluso con el plan en marcha.
  const namedWeek =
    plan.macro.weeks.find((w) => w.status === 'current') ??
    plan.macro.weeks.find((w) => w.status === 'upcoming');
  const microName = namedWeek
    ? plan.macro.phase_assignments.find(
        (p) => p.start_date <= namedWeek.week_start && p.end_date >= namedWeek.week_start,
      )?.name
    : undefined;

  const todaySession = findTodaySession(plan);

  // The today-week (snapshot tiles stay anchored to it) vs the navigable active
  // week shown in the strip.
  //
  // `todayWeek` es NULL cuando ninguna semana del plan contiene hoy — el caso
  // real de un plan recién asignado, que siempre arranca en lunes y por tanto
  // empieza DESPUÉS de hoy. Antes esto caía a `plan.weeks[0]`, así que la
  // primera semana del plan se rotulaba «Esta semana» siendo la que viene: el
  // coach leía como actual algo que aún no ha empezado.
  const todayWeek = plan.weeks.find((w) => w.days.some((d) => d.is_today)) ?? null;
  const todayWeekDays = todayWeek ? mapWeekToStripDays(todayWeek, athlete_id) : [];
  const clampedWeekIdx = Math.min(Math.max(weekIdx, 0), plan.weeks.length - 1);
  const activeWeek = plan.weeks[clampedWeekIdx] ?? todayWeek;
  const activeWeekDays = activeWeek ? mapWeekToStripDays(activeWeek, athlete_id) : [];
  const isTodayWeek = todayWeek !== null && activeWeek === todayWeek;
  // El plan aún no ha arrancado: no hay «esta semana» que enseñar, así que la
  // etiqueta dice el rango real en vez de mentir.
  const planNotStarted = todayWeek === null;
  // El primer día CON sesión de todo el plan — lo que el coach quiere saber
  // («arranca el 10 ago»), no el lunes de la primera semana si esa semana
  // empieza el martes.
  const planStartLabel = planNotStarted
    ? (() => {
        const firstDay = plan.weeks
          .flatMap((w) => w.days)
          .find((d) => d.sessions.length > 0);
        if (!firstDay) return null;
        const [, m, day] = firstDay.iso_date.split('-');
        return `${Number(day)} ${MONTHS_SHORT[Number(m) - 1] ?? ''}`;
      })()
    : null;
  const weekLabel = !activeWeek
    ? 'Esta semana'
    : isTodayWeek
      ? 'Esta semana'
      : formatWeekRange(activeWeek);
  const canPrev = clampedWeekIdx > 0;
  const canNext = clampedWeekIdx < plan.weeks.length - 1;

  // "Abrir en editor de día" target: today's session if any, else the first
  // session day of the today-week, else the first session day overall.
  const allDays = plan.weeks.flatMap((w) => w.days);
  const todayDay = allDays.find((d) => d.is_today) ?? null;
  const editorTargetDate =
    todayDay && todayDay.sessions.length > 0
      ? todayDay.iso_date
      : (todayWeek?.days.find((d) => d.sessions.length > 0)?.iso_date ??
        allDays.find((d) => d.sessions.length > 0)?.iso_date ??
        todayDay?.iso_date ??
        null);

  // Microcycle progress: the macro weeks of the active block.
  const macroWeeks = plan.macro.weeks.slice(0, 6);

  // Recent execution = the most recent sessions with an outcome.
  const recent: PlanSession[] = plan.weeks
    .flatMap((w) => w.days.flatMap((d) => d.sessions))
    .filter((s) => s.status === 'completed' || s.status === 'missed')
    .slice(-5)
    .reverse();

  const adher = resumen?.adherence_pct_30d ?? null;
  const adherTone = adher == null ? 'fg' : adher >= 75 ? 'ok' : adher >= 60 ? 'warn' : 'danger';
  const currentWeek = plan.macro.weeks.find((w) => w.status === 'current');
  const completedThisWeek = todayWeekDays.filter((d) => d.state === 'done').length;
  const plannedThisWeek = todayWeekDays.filter((d) => d.state !== 'rest').length;

  return (
    <>
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
          {/* Plan personal (0164) — este microciclo es solo de este atleta, no
              viene de la periodización por nivel×días. */}
          {plan.is_personal ? (
            <Pill tone="accent" variant="soft" title="Este plan es solo de este atleta">
              <MIcon name="person" size={12} />
              plan personal
            </Pill>
          ) : null}
          {/* Honest publish badge — derived from the microciclo's real weekly_plans
              state, never hardcoded. */}
          {!plan.microciclo || plan.microciclo.session_count === 0 ? (
            <Pill tone="neutral" variant="soft">
              sin publicar
            </Pill>
          ) : plan.microciclo.publish_state === 'published' ? (
            <Pill tone="ok" variant="soft">
              publicado
            </Pill>
          ) : plan.microciclo.publish_state === 'partial' ? (
            <Pill tone="warn" variant="soft">
              {`parcial · ${plan.microciclo.draft_week_count} sem en borrador`}
            </Pill>
          ) : (
            <Pill tone="warn" variant="soft">
              borrador
            </Pill>
          )}
          {/* #4 — a plan already scheduled to start after today, queued up behind
              whatever is showing above. Named explicitly ("programado") so it's
              never confused with what's live right now. */}
          {plan.upcoming_plan ? (
            <Pill
              tone="neutral"
              variant="soft"
              title={`Empieza el ${plan.upcoming_plan.start_date}`}
            >
              <MIcon name="event_upcoming" size={12} />
              programado: «{plan.upcoming_plan.name}»
            </Pill>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Publicar microciclo — flips every draft week of the assigned microciclo
              to published so the athlete sees it. Shown only when there's a real
              draft to publish (a materialized microciclo with hidden weeks). */}
          {plan.microciclo &&
          plan.microciclo.session_count > 0 &&
          plan.microciclo.publish_state !== 'published' ? (
            <PublishMicrocicloButton
              athleteId={athlete_id}
              assignmentId={plan.microciclo.assignment_id}
            />
          ) : null}
          {editorTargetDate ? (
            <Link
              href={`/atletas/${athlete_id}/dia/${editorTargetDate}`}
              className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
            >
              Abrir en editor de día
              <MIcon name="arrow_forward" size={15} />
            </Link>
          ) : null}
          {/* Personalizar plan (0164) / Volver a la periodización (0166) — se
              excluyen mutuamente y cada uno solo aparece cuando de verdad aplica
              (nunca deshabilitado con un error después):
                · no personal            → Personalizar plan.
                · personal, forkeado     → Volver a la periodización (hay un
                  cursor de secuencia detached al que reenganchar).
                · personal, desde cero   → ninguno de los dos — no hay ni
                  periodización activa que dejar ni una a la que volver. */}
          {!plan.is_personal ? (
            <button
              type="button"
              onClick={() => setPersonalizeOpen(true)}
              title="Convierte el plan actual en uno a medida para este atleta"
              className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
            >
              <MIcon name="auto_fix_high" size={15} />
              Personalizar plan
            </button>
          ) : plan.can_revert_to_sequence ? (
            <button
              type="button"
              onClick={() => setRevertOpen(true)}
              title="Deja el plan personal y retoma la periodización por nivel"
              className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
            >
              <MIcon name="history" size={15} />
              Volver a la periodización
            </button>
          ) : null}
        </div>
      </div>

      {/* LA FORMA DEL PLAN, arriba del todo.
          Un coach que abre la ficha de un atleta pregunta tres cosas y en este
          orden: QUÉ está siguiendo · QUÉ hace hoy · CÓMO va. Hasta hoy la
          primera estaba la última —la cadena y los planes personales vivían al
          fondo de la columna derecha, debajo de «Ejecución reciente»— y por eso
          no se encontraban.

          La cadena SUSTITUYE a la antigua tira «Progreso del microciclo»: dice
          lo mismo (las semanas y su cumplimiento) y además dice de qué tramo es
          cada una y qué viene después. Una tira a todo el ancho para enseñar una
          sola semana al 1% era desproporcionada y no contaba el plan. */}
      <CadenaPersonalPanel athleteId={athlete_id} athleteName={plan.athlete_name} />

      {/* La tira de semanas se mantiene SOLO cuando el atleta no tiene cadena
          personal (sigue la periodización por nivel): ahí no hay tramos que
          encadenar y las semanas del microciclo asignado son toda la forma que
          hay que enseñar. */}
      {!plan.is_personal ? (
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
      ) : null}

      {/* Two columns */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.1fr_1fr]">
        {/* LEFT */}
        <div className="flex flex-col gap-5">
          <Panel title="Sesión de hoy" bodyClassName="flex flex-col gap-3">
            {todaySession ? (
              <TodaySessionCard session={todaySession} onOpen={setOpenSession} />
            ) : planNotStarted ? (
              // Hoy NO es un día de descanso: el plan todavía no ha empezado.
              // Llamarlo descanso hacía pensar que estaba programado así.
              <p className="py-4 text-center text-xs text-[color:var(--v2-muted)]">
                El plan aún no ha empezado
                {planStartLabel ? ` · arranca el ${planStartLabel}` : ''}
              </p>
            ) : (
              <p className="py-4 text-center text-xs text-[color:var(--v2-muted)]">
                Sin sesión programada hoy · día de descanso
              </p>
            )}
          </Panel>

          <Panel
            title={weekLabel}
            action={
              plan.weeks.length > 1 ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!canPrev}
                    onClick={() => setWeekIdx(clampedWeekIdx - 1)}
                    aria-label="Semana anterior"
                    className="v2-focus inline-flex h-6 w-6 items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <MIcon name="chevron_left" size={16} />
                  </button>
                  {!isTodayWeek ? (
                    <button
                      type="button"
                      onClick={() => setWeekIdx(initialWeekIdx)}
                      className="v2-focus inline-flex h-6 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
                    >
                      Hoy
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={!canNext}
                    onClick={() => setWeekIdx(clampedWeekIdx + 1)}
                    aria-label="Semana siguiente"
                    className="v2-focus inline-flex h-6 w-6 items-center justify-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <MIcon name="chevron_right" size={16} />
                  </button>
                </div>
              ) : null
            }
          >
            {activeWeekDays.length > 0 ? (
              <WeekStrip days={activeWeekDays} />
            ) : (
              <p className="text-center text-xs text-[color:var(--v2-muted)]">Semana sin datos</p>
            )}
          </Panel>

          {/* Planes personales — borradores SIN fecha todavía. Estaban al fondo
              de la columna derecha, detrás de «Ejecución reciente», y no se
              encontraban. Aquí abajo a la izquierda llenan el hueco que dejaba
              la semana y quedan a la vista sin competir con la cadena, que es
              lo que de verdad está en marcha. */}
          <PlanesPersonalesPanel athleteId={athlete_id} athleteName={plan.athlete_name} />
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            <SnapshotTile label="Adherencia 30d" value={adher != null ? `${adher}%` : '—'} tone={adherTone} />
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

          {/* «Cómo se encuentra» — the subjective WHY under the Readiness tile
              above (mockup docs/design/como-se-encuentra-mockup.html). */}
          <ComoSeEncuentraPanel checkin={resumen?.checkin ?? null} week={resumen?.checkin_week ?? []} />

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
                    <RecentRow key={s.assignment_id} s={s} onOpen={setOpenSession} />
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

          {/* Soft INFO — cumplió la semana pero en distinto orden/día (sin penalización) */}
          {resumen?.order_altered ? <OrderAlteredNotice /> : null}

          {/* El botón «Mensaje» que había aquí se ha quitado: ya existe en la
              cabecera de la ficha, a dos dedos de distancia, y repetirlo en
              mitad de la columna sólo añadía ruido. */}
        </div>
      </div>
    </div>
    {openSession ? (
      <SessionDetailDrawer
        key={openSession}
        athleteId={athlete_id}
        assignmentId={openSession}
        onClose={() => setOpenSession(null)}
      />
    ) : null}
    {personalizeOpen ? (
      <PersonalizarPlanModal
        athleteId={athlete_id}
        athleteName={plan.athlete_name}
        currentBlockName={microName ?? blockName}
        currentWeek={blockWeek}
        onClose={() => setPersonalizeOpen(false)}
      />
    ) : null}
    {revertOpen ? (
      <VolverPeriodizacionModal
        athleteId={athlete_id}
        athleteName={plan.athlete_name}
        personalPlanName={microName ?? blockName}
        onClose={() => setRevertOpen(false)}
      />
    ) : null}
    </>
  );
}

function TodaySessionCard({
  session,
  onOpen,
}: {
  session: PlanSession;
  onOpen: (assignmentId: string) => void;
}) {
  const modality = sessionModalityView(session);
  return (
    <div
      className="flex flex-col gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3"
      style={{ borderLeft: `3px solid ${modalityColor(modality.slug)}` }}
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
          {modality.label}
          {session.duration_min != null ? ` · ${session.duration_min} min` : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => onOpen(session.assignment_id)}
          className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
        >
          <MIcon name="visibility" size={15} />
          Ver detalle
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

/** Publishes the athlete's assigned microciclo (every draft week → published) via
 *  the coach publish endpoint, then refreshes so the badge + plan reflect it.
 *  Optimistic disabled state; honest inline error. */
function PublishMicrocicloButton({
  athleteId,
  assignmentId,
}: {
  athleteId: string;
  assignmentId: string;
}) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    if (publishing) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/microciclo/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ month_assignment_id: assignmentId }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!res.ok) {
        setError(body?.error?.message ?? 'No se pudo publicar el microciclo.');
        return;
      }
      router.refresh();
    } catch {
      setError('No se pudo publicar el microciclo.');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={publish}
        disabled={publishing}
        title="Publica el microciclo para que el atleta lo vea"
        className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-60"
      >
        <MIcon name={publishing ? 'progress_activity' : 'send'} size={15} className={publishing ? 'animate-spin' : undefined} />
        {publishing ? 'Publicando…' : 'Publicar microciclo'}
      </button>
      {error ? (
        <span className="text-label font-medium text-[color:var(--v2-danger)]">{error}</span>
      ) : null}
    </div>
  );
}

// A plan action is always a real navigation (it links somewhere) — there are no
// placeholder/no-op actions here.
function PlanAction({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
    >
      <MIcon name={icon} size={15} />
      {label}
    </Link>
  );
}
