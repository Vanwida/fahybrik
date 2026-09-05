'use client';

// PLAN — «¿qué le mando y cómo lo cambio?»
// La semana es el lienzo. Adherencia, check-in y readiness viven en Resumen.

import { useCallback, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { SessionDetailDrawer } from './SessionDetailDrawer';
import { InlineSaveBadge, useInlineSave } from '@/components/v2/InlineSave';
import { OrderAlteredNotice } from '@/components/v2/OrderAlteredSignal';
import { PersonalizarPlanModal } from './PersonalizarPlanModal';
import { VolverPeriodizacionModal } from './VolverPeriodizacionModal';
import { CadenaPersonalPanel } from './CadenaPersonalPanel';
import { PlanesPersonalesPanel } from './PlanesPersonalesPanel';
import { FichaCard, FichaLabel, FilaVacia } from './resumen/piezas';
import { SemanaCanvas } from './plan/semana';
import { MicrocicloRail } from './plan/carril';
import type { AthletePlanPayload, PlanSession } from '@/lib/dashboard/coach/athlete-plan';
import type { AthleteResumen } from '@/lib/dashboard/coach/resumen';
import type { AthleteWeekChip } from '@fahybrid/shared/domain/coach/athlete-week-chip';
import {
  executionStatusLabel,
  publishBadgeLabel,
} from '@fahybrid/shared/domain/coach/microciclo-rail';
import {
  honestWeekHeading,
  initialPlanWeekIndex,
  planRelationCopy,
  planWeekRelation,
} from '@fahybrid/shared/domain/coach/honest-week';
import { sesionPorId } from '@/lib/dashboard/v2/ficha-resumen';
import { addDays, isoDateString, mondayOfWeek, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import { cn } from '@/lib/utils';

const SESSION_QUERY_PARAM = 'sesion';
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatWeekRange(start: string, end: string): string {
  const s = start.split('-');
  const e = end.split('-');
  const sDay = Number(s[2]);
  const eDay = Number(e[2]);
  const sMonth = MONTHS_SHORT[Number(s[1]) - 1] ?? '';
  const eMonth = MONTHS_SHORT[Number(e[1]) - 1] ?? '';
  return sMonth === eMonth ? `${sDay}–${eDay} ${eMonth}` : `${sDay} ${sMonth} – ${eDay} ${eMonth}`;
}

export function PlanTab({
  plan,
  planMode,
  resumen,
  athlete_id,
  initialSessionId,
  intakePending,
  weekChip,
}: {
  plan: AthletePlanPayload | null;
  planMode: 'shared' | 'personal';
  resumen: AthleteResumen | null;
  athlete_id: string;
  initialSessionId?: string | null;
  intakePending?: boolean;
  weekChip: AthleteWeekChip;
}) {
  const [openSession, setOpenSession] = useState<string | null>(initialSessionId ?? null);
  const openSessionSynced = useCallback((id: string | null) => {
    setOpenSession(id);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set(SESSION_QUERY_PARAM, id);
    else url.searchParams.delete(SESSION_QUERY_PARAM);
    window.history.replaceState(window.history.state, '', url);
  }, []);

  const todayBox = startOfDayInBox(new Date());
  const today = isoDateString(todayBox);
  const heading = honestWeekHeading({
    chip: weekChip,
    calendarMonday: isoDateString(mondayOfWeek(todayBox)),
    calendarSunday: isoDateString(addDays(mondayOfWeek(todayBox), 6)),
  });
  const relation = plan
    ? planWeekRelation({ chipKind: weekChip.kind, weeks: plan.weeks, today })
    : 'none';
  const initialWeekIdx = plan ? initialPlanWeekIndex(plan.weeks, relation) : 0;
  const [weekIdx, setWeekIdx] = useState(initialWeekIdx);
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);

  if (!plan || plan.total_sessions === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-4">
        {intakePending ? (
          <FilaVacia
            texto="Cierra el alta antes de asignar plan"
            cta="Revisar intake"
            href={`/atletas/${athlete_id}/intake`}
          />
        ) : planMode === 'personal' ? (
          plan?.current_month_template_id ? (
            <FilaVacia
              texto="Este plan personal aún no tiene entrenos en la semana"
              cta="Abrir el editor"
              href={`/microciclos/${plan.current_month_template_id}`}
            />
          ) : (
            <p className="text-[13px] text-[color:var(--v2-muted)]">
              Plan personal: todavía no hay un microciclo en marcha. Añádelo abajo.
            </p>
          )
        ) : (
          <FilaVacia texto="Sin plan asignado todavía" cta="Asignar en Hoy" href="/hoy" />
        )}
        {planMode === 'personal' ? (
          <CadenaPersonalPanel athleteId={athlete_id} allowEmpty />
        ) : null}
        <PlanesPersonalesPanel athleteId={athlete_id} />
      </div>
    );
  }

  const blockName = plan.current_block_label ?? plan.current_block ?? '—';
  const blockWeek = plan.macro.block_week;
  const namedWeek =
    plan.macro.weeks.find((w) => w.status === 'current') ??
    plan.macro.weeks.find((w) => w.status === 'upcoming');
  const microName = namedWeek
    ? plan.macro.phase_assignments.find(
        (p) => p.start_date <= namedWeek.week_start && p.end_date >= namedWeek.week_start,
      )?.name
    : undefined;

  const todayWeek = plan.weeks.find((w) => w.days.some((d) => d.is_today)) ?? null;
  const clampedWeekIdx = Math.min(Math.max(weekIdx, 0), plan.weeks.length - 1);
  const activeWeek = plan.weeks[clampedWeekIdx] ?? todayWeek;
  const isCalendarWeek = activeWeek?.week_start === heading.week_start;
  const firstSessionDay = relation === 'not_started'
    ? plan.weeks.flatMap((w) => w.days).find((d) => d.sessions.length > 0)
    : null;
  const planStartLabel = firstSessionDay
    ? `${Number(firstSessionDay.iso_date.split('-')[2])} ${MONTHS_SHORT[Number(firstSessionDay.iso_date.split('-')[1]) - 1] ?? ''}`
    : null;
  const relationCopy = planRelationCopy(relation, planStartLabel);
  const weekLabel = activeWeek
    ? isCalendarWeek
      ? heading.title
      : formatWeekRange(activeWeek.week_start, activeWeek.week_end)
    : 'Semana';
  const allDays = plan.weeks.flatMap((w) => w.days);
  const todayDay = allDays.find((d) => d.is_today) ?? null;
  // «Editar día» respeta la SEMANA EN PANTALLA (Alex, QA 19-ago): hoy si cae
  // dentro de la semana activa; si no, el primer día con sesiones de ESA semana;
  // si no, su lunes. Nunca salta a otra semana por su cuenta.
  const activeWeekToday = activeWeek?.days.find((d) => d.is_today) ?? null;
  const editorTargetDate = activeWeek
    ? (activeWeekToday?.iso_date ??
      activeWeek.days.find((d) => d.sessions.length > 0)?.iso_date ??
      activeWeek.days[0]?.iso_date ??
      null)
    : (todayDay?.iso_date ?? allDays.find((d) => d.sessions.length > 0)?.iso_date ?? null);

  const recent: PlanSession[] = plan.weeks
    .flatMap((w) => w.days.flatMap((d) => d.sessions))
    .filter((s) => s.status === 'completed' || s.status === 'missed' || s.status === 'partial')
    .slice(-5)
    .reverse();

  const span = plan.macro.block_spans.find((s) => s.block_type === plan.macro.block);
  const fase =
    plan.macro.block && blockWeek != null
      ? `${plan.macro.block} · sem ${blockWeek}${span?.week_count ? ` de ${span.week_count}` : ''}`
      : blockName;

  const publish = plan.microciclo;
  const publishLabel = publish
    ? publishBadgeLabel(publish)
    : null;
  const railWeeks = publish?.weeks ?? [];
  const viewedRail = activeWeek
    ? (railWeeks.find((w) => w.week_start === activeWeek.week_start) ?? null)
    : null;
  const openRow = openSession ? sesionPorId(plan.weeks, openSession) : null;

  return (
    <>
      <div className="mx-auto grid w-full max-w-[1300px] grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1fr)_328px]">
        <div className="flex min-w-0 flex-col gap-4">
          <FichaCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <FichaLabel>Plan del atleta</FichaLabel>
                <p className="mt-1 font-[family-name:var(--v2-font-display)] text-[22px] font-extrabold leading-none tracking-[-0.03em] text-[color:var(--v2-fg)]">
                  {microName ?? blockName}
                </p>
                <p className="mt-1.5 text-[13px] text-[color:var(--v2-muted)]">
                  {[fase, plan.is_personal ? 'personal' : null, publishLabel, plan.upcoming_plan ? `luego «${plan.upcoming_plan.name}»` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {relationCopy ? (
                  <p className="mt-1 text-[12.5px] text-[color:var(--v2-muted)]">
                    {relationCopy}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {publish && publish.session_count > 0 && publish.publish_state !== 'published' ? (
                  <PublishMicrocicloButton
                    athleteId={athlete_id}
                    assignmentId={publish.assignment_id}
                  />
                ) : null}
                {editorTargetDate ? (
                  <Link
                    // SIEMPRE al día del ATLETA (su copia real), también en plan
                    // personal: la rama que mandaba a la plantilla del microciclo
                    // asumía que el día vive allí, y la semana entregada puede
                    // divergir de la plantilla (atleta 64: plantilla vacía,
                    // semana llena). La plantilla se edita desde «Editar plan».
                    href={`/atletas/${athlete_id}/dia/${editorTargetDate}`}
                    className="v2-focus inline-flex h-[34px] items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border-strong)] px-[13px] text-[12.5px] font-semibold"
                  >
                    Editar día
                  </Link>
                ) : null}
                {plan.is_personal && plan.current_month_template_id ? (
                  <Link
                    href={`/microciclos/${plan.current_month_template_id}`}
                    className="v2-focus inline-flex h-[34px] items-center rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-[13px] text-[12.5px] font-semibold text-[color:var(--v2-accent-fg)]"
                  >
                    Editar plan
                  </Link>
                ) : !plan.is_personal ? (
                  <button
                    type="button"
                    onClick={() => setPersonalizeOpen(true)}
                    className="v2-focus inline-flex h-[34px] items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border-strong)] px-[13px] text-[12.5px] font-semibold"
                  >
                    Personalizar
                  </button>
                ) : null}
                {plan.is_personal && plan.can_revert_to_sequence ? (
                  <button
                    type="button"
                    onClick={() => setRevertOpen(true)}
                    className="v2-focus inline-flex h-[34px] items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border-strong)] px-[13px] text-[12.5px] font-semibold"
                  >
                    Volver a periodización
                  </button>
                ) : null}
              </div>
            </div>
          </FichaCard>

          {railWeeks.length > 0 ? (
            <FichaCard>
              <FichaLabel>Semanas</FichaLabel>
              <div className="mt-3">
                <MicrocicloRail
                  weeks={railWeeks}
                  activeWeekStart={activeWeek?.week_start ?? null}
                  onSelect={(weekStart) => {
                    const idx = plan.weeks.findIndex((w) => w.week_start === weekStart);
                    if (idx >= 0) setWeekIdx(idx);
                  }}
                />
              </div>
            </FichaCard>
          ) : null}

          {activeWeek ? (
            <SemanaCanvas
              week={activeWeek}
              todayIso={today}
              label={weekLabel}
              chip={weekChip}
              viewedRailVisible={viewedRail ? viewedRail.visible : null}
              paintDays={!isCalendarWeek || heading.paint_days}
              emptyCopy={heading.empty_copy}
              canPrev={clampedWeekIdx > 0}
              canNext={clampedWeekIdx < plan.weeks.length - 1}
              showHoy={todayWeek !== null && activeWeek !== todayWeek}
              onPrev={() => setWeekIdx(clampedWeekIdx - 1)}
              onNext={() => setWeekIdx(clampedWeekIdx + 1)}
              onHoy={() => setWeekIdx(initialWeekIdx)}
              onOpen={openSessionSynced}
              activeSessionId={openSession}
              athleteId={athlete_id}
              // El «+N más» de un día abre el día del ATLETA (default de
              // SemanaCanvas): la ruta a la plantilla asumía días que pueden
              // no existir allí (recibos divergentes).
              dayHref={undefined}
              focus={
                <AthleteWeekFocusRow
                  key={activeWeek.week_start}
                  athleteId={athlete_id}
                  weekStart={activeWeek.week_start}
                  weekLabel={weekLabel}
                  initial={activeWeek.focus}
                />
              }
            />
          ) : (
            <FilaVacia texto="Semana sin datos" cta="Asignar en Hoy" href="/hoy" />
          )}

          <FichaCard className="p-0">
            <div className="px-4 pt-3.5">
              <FichaLabel>Ejecución reciente</FichaLabel>
            </div>
            {recent.length > 0 ? (
              <ul className="mt-2 divide-y divide-[color:var(--v2-border)]">
                {recent.map((s) => (
                  <li key={s.assignment_id}>
                    <button
                      type="button"
                      onClick={() => openSessionSynced(s.assignment_id)}
                      className="v2-focus flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[color:var(--v2-surface-2)]"
                    >
                      <span className="truncate text-[13px] font-semibold text-[color:var(--v2-fg)]">
                        {s.title}
                      </span>
                      <span className="v2-num shrink-0 text-[12px] text-[color:var(--v2-muted)]">
                        {executionStatusLabel(s.status)}
                        {s.rpe != null ? ` · RPE ${s.rpe}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-[13px] text-[color:var(--v2-muted)]">
                Sin ejecuciones todavía.
              </p>
            )}
          </FichaCard>

          {resumen?.order_altered ? <OrderAlteredNotice /> : null}
        </div>

        <div className="flex flex-col gap-4">
          {!plan.is_personal && plan.macro.weeks.length > 0 ? (
            <FichaCard>
              <FichaLabel>Cumplimiento del microciclo</FichaLabel>
              <div className="mt-3 flex flex-wrap gap-2">
                {plan.macro.weeks.slice(0, 6).map((w, i) => {
                  const actual = w.status === 'current';
                  const pct = w.compliance_pct != null ? Math.round(w.compliance_pct) : null;
                  return (
                    <div
                      key={w.week_start}
                      className={cn(
                        'flex min-w-[56px] flex-1 flex-col gap-1 rounded-[var(--v2-r-m)] px-2 py-1.5',
                        actual ? 'bg-[color:var(--v2-accent-soft)]' : 'bg-[color:var(--v2-surface-2)]',
                      )}
                    >
                      <span className="v2-num text-[10px] text-[color:var(--v2-muted)]">S{i + 1}</span>
                      <span className="v2-num text-[13px] font-semibold">
                        {pct != null ? `${pct}%` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </FichaCard>
          ) : null}

          <CadenaPersonalPanel athleteId={athlete_id} athleteName={plan.athlete_name} />
          <PlanesPersonalesPanel athleteId={athlete_id} athleteName={plan.athlete_name} />
        </div>
      </div>

      {openSession ? (
        <SessionDetailDrawer
          key={openSession}
          athleteId={athlete_id}
          assignmentId={openSession}
          isoDate={openRow?.iso_date ?? null}
          planStatus={openRow?.status ?? null}
          onClose={() => openSessionSynced(null)}
          onInvalid={() => openSessionSynced(null)}
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

function AthleteWeekFocusRow({
  athleteId,
  weekStart,
  weekLabel,
  initial,
}: {
  athleteId: string;
  weekStart: string;
  weekLabel: string;
  initial: string | null;
}) {
  const [value, setValue] = useState(initial ?? '');
  const baseline = (initial ?? '').trim();
  const { status, setStatus, save } = useInlineSave(async (next) => {
    const res = await fetch(`/api/coach/athletes/${athleteId}/weekly-plan`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ week_start: weekStart, focus: next.length > 0 ? next : null }),
    });
    return res.ok;
  });

  return (
    <div className="flex items-center gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2">
      <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[color:var(--v2-muted)]">
        Foco {weekLabel}
      </span>
      <input
        id={`athlete-week-focus-${weekStart}`}
        type="text"
        value={value}
        maxLength={200}
        onChange={(e) => {
          setValue(e.target.value);
          if (status !== 'idle') setStatus('idle');
        }}
        onBlur={() => save(value.trim(), baseline)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        placeholder="Sin foco para esta semana"
        className="v2-focus min-w-0 flex-1 border-0 bg-transparent text-[13px] font-semibold outline-none placeholder:font-normal placeholder:text-[color:var(--v2-faint)]"
      />
      <InlineSaveBadge status={status} />
    </div>
  );
}

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
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setError(body?.error?.message ?? 'No se pudo publicar.');
        return;
      }
      router.refresh();
    } catch {
      setError('No se pudo publicar.');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void publish()}
        disabled={publishing}
        className="v2-focus inline-flex h-[34px] items-center rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-[15px] text-[12.5px] font-semibold text-[color:var(--v2-accent-fg)] disabled:opacity-60"
      >
        {publishing ? 'Publicando…' : 'Publicar'}
      </button>
      {error ? <span className="text-[12px] text-[color:var(--v2-danger)]">{error}</span> : null}
    </div>
  );
}
