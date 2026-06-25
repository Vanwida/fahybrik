'use client';

// "Revisar & publicar" — superficie CENTRAL del rediseño coach→atleta. El coach
// revisa EXACTAMENTE lo que verá el atleta la próxima semana, en BORRADOR, con
// los porqués + un diff con NOMBRES de sesión (nunca IDs) vs. la semana actual,
// y PUBLICA: nada llega al atleta hasta publicar (publish gate, Fase 2a).
//
// Layout aprobado (revisar-mock): top bar con pill BORRADOR · lista training-log
// "Lo que verá el atleta" (semana PROPUESTA = asignaciones actuales con los
// slot_changes de la propuesta aplicados) · panel "¿Por qué?" (.card-elevated)
// con coach_summary/rationale + Ajustes + diff con nombres · action bar pegajosa
// con "Editar plan" (outline) + "Publicar a Alex" (negro-sobre-naranja).
//
// Datos: la PROPUESTA pendiente (week_adjustment_proposal) llega del server; la
// semana objetivo se carga del endpoint de plan existente anclada a week_start;
// los nombres de plantilla los resuelve el server (loadProposalTemplateNames,
// que reusa loadTemplateNames del inbox). Si NO hay propuesta pendiente, la
// pantalla muestra la semana siguiente como borrador publicable simple.
//
// Publicar = (1) aprobar la propuesta (aplica slot_changes a workout_assignments
// vía el endpoint approve existente) + (2) publishWeek vía el endpoint 2a
// (weekly_plans.status='published' + notifica). Ambos idempotentes.

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { PendingAdjustment } from '@/lib/dashboard/coach/week-adjustments';
import type {
  AthletePlanPayload,
  PlanSession,
  PlanWeekRow,
} from '@/lib/dashboard/coach/athlete-plan';
import { formatLabel } from '@/lib/studio/section-types';
import type { TemplateFormat } from '@/lib/templates/schema';
import {
  addDays,
  isoDateString,
  mondayOfWeek as mondayOfWeekDate,
  parseIsoDate,
} from '@fahybrid/shared/domain/atr/dates';
import { firstName } from '@/components/dashboard/assign-flow/helpers';
import type { CreatedDraftInfo } from '@/components/dashboard/assign-flow/AssignFlow';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

interface AthleteReviewPublishProps {
  athleteId: string;
  athleteName: string;
  /** Propuesta pendiente de Pablo IA, o null → semana siguiente como borrador simple. */
  proposal: PendingAdjustment | null;
  /**
   * Bloque recién creado en borrador (AssignFlow). Cuando hay createdDraft y NO
   * hay propuesta, la revisión ancla en la PRIMERA semana real del bloque (no en
   * "el próximo lunes") y "Publicar" publica TODAS sus semanas de golpe.
   */
  createdDraft: CreatedDraftInfo | null;
  /** Nombres de plantilla resueltos (id → name) para el diff y los cambios. */
  templateNames: Record<string, string>;
  /** Fase/bloque ATR de la semana ("Acumulación · Semana 3 de 5") — subtítulo
      del header, misma derivación que el Hub/roster. null si no hay bloque. */
  phaseLine: string | null;
  /** Cierra la superficie de revisión (lo controla la shell). */
  onClose: () => void;
  /** "Editar plan": cierra la revisión y lleva el calendario a la semana
      revisada (vista Semana anclada) para editar en sitio — sin redirigir. */
  onEditInCalendar: (weekStartIso: string) => void;
}

const DAYS_PER_WEEK = 7;

// Etiqueta humana por recomendación (alineada con el inbox del coach, §1).
const RECOMMENDATION_LABEL: Record<string, string> = {
  keep: 'Validación semanal',
  soften: 'Ajuste de volumen',
  swap: 'Cambio de sesión',
  rest_day: 'Día de descanso',
};

// ── Modelo de fila renderizada (semana PROPUESTA) ───────────────────────────
type ProposedRow = {
  iso_date: string;
  label: string;
  /** Kicker/formato (mudo). null en descanso. */
  kicker: string | null;
  /** Título COMPLETO de la sesión — nunca se trunca. */
  title: string;
  /** Duración estimada (min). null = descanso o sin dato. */
  durationMin: number | null;
  /** true → fila compacta de descanso. */
  rest: boolean;
  /** true → día cambiado por la propuesta (chip "Cambiado"). */
  changed: boolean;
};

type DiffRow = { day_label: string; from: string; to: string };

function dayNumber(iso: string): string {
  return String(Number(iso.slice(8, 10)));
}

function sessionFormatLabel(format: string | null): string | null {
  if (!format) return null;
  return formatLabel(format as TemplateFormat);
}

/** Suma `days` a una fecha ISO (YYYY-MM-DD) — reusa el helper de dominio. */
function addDaysIso(iso: string, days: number): string {
  return isoDateString(addDays(parseIsoDate(iso), days));
}

/** Lunes de la semana que contiene `iso` — reusa el helper de dominio ATR. */
function mondayOfWeek(iso: string): string {
  return isoDateString(mondayOfWeekDate(parseIsoDate(iso)));
}

function weekRangeLabel(weekStart: string, weekEnd: string): string {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(`${weekEnd}T12:00:00`);
  const sameMonth = start.getMonth() === end.getMonth();
  const month = (d: Date) => d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
  return sameMonth
    ? `${start.getDate()}–${end.getDate()} ${month(end)}`
    : `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)}`;
}

function templateName(
  templateNames: Record<string, string>,
  id: number | bigint | null,
  fallback: string,
): string {
  if (id == null) return fallback;
  return templateNames[String(id)] ?? `Sesión #${id}`;
}

/**
 * El coach NUNCA debe ver IDs numéricos en texto libre. La rationale generada
 * por la IA a veces incrusta referencias "template 376" / "(template 376)" /
 * "plantilla #376". Las sustituimos por el NOMBRE resuelto; si la referencia va
 * entre paréntesis y no se puede resolver, eliminamos el paréntesis entero para
 * no dejar el ID a la vista.
 */
function sanitizeRationale(
  text: string,
  templateNames: Record<string, string>,
): string {
  // 1) Paréntesis "(template 376)" / "(plantilla #376)" → "(Nombre)" o se elimina.
  let out = text.replace(
    /\s*\((?:template|plantilla)\s*#?\s*(\d+)\)/gi,
    (_match, id: string) => {
      const name = templateNames[id];
      return name ? ` (${name})` : '';
    },
  );
  // 2) Referencias sueltas "template 376" / "plantilla #376" → nombre o "la sesión".
  out = out.replace(
    /\b(?:template|plantilla)\s*#?\s*(\d+)\b/gi,
    (_match, id: string) => templateNames[id] ?? 'la sesión',
  );
  // Normaliza dobles espacios que pudiera dejar la limpieza.
  return out.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Construye las filas de la semana PROPUESTA: parte de las asignaciones reales
 * de la semana objetivo y aplica los slot_changes de la propuesta por fecha.
 *   - to_template_id === null  → el día pasa a Descanso (changed).
 *   - to_template_id presente  → el título pasa al nombre resuelto (changed).
 */
function buildProposedRows(
  week: PlanWeekRow,
  proposal: PendingAdjustment | null,
  templateNames: Record<string, string>,
): ProposedRow[] {
  // Cambios indexados por fecha (un día puede tener varios slots; nos quedamos
  // con el primer cambio relevante por fecha para la fila resumen del día).
  const changeByDate = new Map<string, PendingAdjustment['proposal']['slot_changes'][number]>();
  if (proposal) {
    for (const c of proposal.proposal.slot_changes) {
      if (!changeByDate.has(c.date)) changeByDate.set(c.date, c);
    }
  }

  return week.days.map((day) => {
    const change = changeByDate.get(day.iso_date) ?? null;
    const first: PlanSession | undefined = day.sessions[0];

    // Día convertido a descanso por la propuesta.
    if (change && change.to_template_id == null) {
      return {
        iso_date: day.iso_date,
        label: day.label,
        kicker: null,
        title: 'Descanso',
        durationMin: null,
        rest: true,
        changed: true,
      };
    }

    // Día con sesión cambiada por la propuesta (nuevo template).
    if (change && change.to_template_id != null) {
      return {
        iso_date: day.iso_date,
        label: day.label,
        kicker: first ? sessionFormatLabel(first.format) : null,
        title: templateName(templateNames, change.to_template_id, 'Sesión'),
        durationMin: first?.duration_min ?? null,
        rest: false,
        changed: true,
      };
    }

    // Día sin cambios.
    if (!first) {
      return {
        iso_date: day.iso_date,
        label: day.label,
        kicker: null,
        title: 'Descanso',
        durationMin: null,
        rest: true,
        changed: false,
      };
    }
    return {
      iso_date: day.iso_date,
      label: day.label,
      kicker: sessionFormatLabel(first.format),
      title: first.title,
      durationMin: first.duration_min,
      rest: false,
      changed: false,
    };
  });
}

/** Diff legible (con NOMBRES) a partir de los slot_changes de la propuesta. */
function buildDiff(
  proposal: PendingAdjustment | null,
  templateNames: Record<string, string>,
): DiffRow[] {
  if (!proposal) return [];
  return proposal.proposal.slot_changes.map((c) => ({
    day_label: weekdayLabel(c.date),
    from: templateName(templateNames, c.from_template_id, 'Sin sesión'),
    to: templateName(templateNames, c.to_template_id, 'Descanso'),
  }));
}

const WEEKDAY_LABELS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0 = domingo
  return WEEKDAY_LABELS[(dow + 6) % 7] ?? iso;
}

type PublishState = 'idle' | 'publishing' | 'published' | 'error';

export function AthleteReviewPublish({
  athleteId,
  athleteName,
  proposal,
  createdDraft,
  templateNames,
  phaseLine,
  onClose,
  onEditInCalendar,
}: AthleteReviewPublishProps) {
  const router = useRouter();
  const [, startNav] = useTransition();
  // La carga de la semana se hace dentro de una transición (mismo patrón que
  // reloadPlan en AthleteCalendarSection) — así el setState no es síncrono
  // dentro del efecto y `isLoading` refleja la transición pendiente.
  const [isLoading, startLoad] = useTransition();

  // ¿Estamos revisando un BLOQUE recién creado en borrador? (Solo si no hay
  // propuesta semanal pendiente — esa tiene prioridad y su path no cambia.)
  const reviewingBlock = !proposal && createdDraft != null;

  // Semana objetivo (la propuesta semanal SIEMPRE tiene prioridad, como en el
  // publish): propuesta → su semana; bloque en borrador → PRIMERA semana real
  // del bloque; ninguno → la próxima semana (lunes).
  const targetWeekStart = proposal
    ? mondayOfWeek(proposal.week_start)
    : reviewingBlock
      ? createdDraft.week_start
      : mondayOfWeek(addDaysIso(new Date().toISOString().slice(0, 10), DAYS_PER_WEEK));

  // Nº de semanas que abarca el bloque (para el copy "se publicarán N semanas").
  const blockWeekCount = reviewingBlock ? createdDraft.week_starts.length : 1;

  const [week, setWeek] = useState<PlanWeekRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishState, setPublishState] = useState<PublishState>('idle');
  const [publishError, setPublishError] = useState<string | null>(null);

  // Carga la semana objetivo dentro de una transición (deferida, no síncrona).
  const loadWeek = useCallback(() => {
    startLoad(async () => {
      try {
        const url = new URL(
          `/api/coach/athletes/${athleteId}/plan`,
          window.location.origin,
        );
        url.searchParams.set('view', 'week');
        url.searchParams.set('anchor', targetWeekStart);
        const res = await fetch(url.toString(), { credentials: 'include' });
        if (!res.ok) {
          setLoadError('No se pudo cargar la semana — reintenta.');
          setLoaded(true);
          return;
        }
        const json = (await res.json()) as { plan: AthletePlanPayload };
        // El endpoint devuelve la semana anclada como primera (y única) fila.
        const target =
          json.plan.weeks.find((w) => w.week_start === targetWeekStart) ??
          json.plan.weeks[0] ??
          null;
        setLoadError(null);
        setWeek(target);
        setLoaded(true);
      } catch {
        setLoadError('Error de red al cargar la semana — reintenta.');
        setLoaded(true);
      }
    });
  }, [athleteId, targetWeekStart]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  const loading = isLoading || !loaded;

  const rows = week ? buildProposedRows(week, proposal, templateNames) : [];
  const diff = buildDiff(proposal, templateNames);
  const rangeLabel = week
    ? weekRangeLabel(week.week_start, week.week_end)
    : weekRangeLabel(targetWeekStart, addDaysIso(targetWeekStart, DAYS_PER_WEEK - 1));
  // Subtítulo del header = FASE/BLOQUE ATR (no la recomendación) — coherente con
  // la semana que muestra y con el Hub/roster. La recomendación/verdict vive solo
  // en el panel "¿Por qué?".
  const subtitle =
    phaseLine ??
    (reviewingBlock
      ? `Bloque · ${blockWeekCount} ${blockWeekCount === 1 ? 'semana' : 'semanas'}`
      : proposal
        ? 'Próxima semana'
        : 'Semana siguiente');
  const recLabel = proposal
    ? (RECOMMENDATION_LABEL[proposal.proposal.recommendation] ??
      proposal.proposal.recommendation)
    : null;
  // Texto del porqué, saneado: nunca deja IDs numéricos de plantilla a la vista.
  const summary = proposal
    ? sanitizeRationale(proposal.coach_summary ?? proposal.proposal.rationale, templateNames)
    : null;
  const changedCount = rows.filter((r) => r.changed).length;

  // ── Publicar: aprobar propuesta (aplica slot_changes) + publishWeek ──────────
  const publish = () => {
    if (publishState === 'publishing' || publishState === 'published') return;
    setPublishState('publishing');
    setPublishError(null);

    startNav(async () => {
      try {
        // 1) Aprobar la propuesta → aplica slot_changes a workout_assignments.
        if (proposal) {
          const approveRes = await fetch(
            `/api/coach/athletes/${athleteId}/week-adjustment/${proposal.id}/approve`,
            { method: 'POST', credentials: 'include' },
          );
          if (!approveRes.ok) {
            setPublishError('No se pudo aplicar la propuesta — reintenta.');
            setPublishState('error');
            return;
          }
        }

        // 2) Publicar → el atleta deja de tener la(s) semana(s) oculta(s) +
        //    notifica. Bloque en borrador → publica TODAS sus semanas de golpe
        //    (week_starts → publishBlock); resto → la semana objetivo.
        const publishBody = reviewingBlock
          ? { week_starts: createdDraft.week_starts }
          : { week_start: targetWeekStart };
        const publishRes = await fetch(
          `/api/coach/athletes/${athleteId}/weekly-plan/publish`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(publishBody),
          },
        );
        if (!publishRes.ok) {
          setPublishError('Cambios aplicados, pero no se pudo publicar — reintenta.');
          setPublishState('error');
          return;
        }

        setPublishState('published');
        // Refresca el server tree para que la propuesta deje de estar pendiente
        // (la zona "Tus decisiones" y el calendario reflejen el estado nuevo).
        router.refresh();
      } catch {
        setPublishError('Error de red al publicar — reintenta.');
        setPublishState('error');
      }
    });
  };

  // ── Estado de éxito ──────────────────────────────────────────────────────────
  if (publishState === 'published') {
    return (
      <div className="card-elevated flex flex-col items-center gap-3 p-[var(--s-xl)] text-center">
        <span className="flex size-11 items-center justify-center rounded-[var(--r-pill)] bg-[color:color-mix(in_srgb,var(--status-success)_16%,var(--surface-card))]">
          <MIcon name="check_circle" size={24} className="text-[color:var(--status-success)]" aria-hidden />
        </span>
        <div>
          <p className="font-heading-sm text-[color:var(--fg)]">
            Publicado a {firstName(athleteName)}
          </p>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            {reviewingBlock
              ? `${firstName(athleteName)} ya puede ver el bloque (${blockWeekCount} ${blockWeekCount === 1 ? 'semana' : 'semanas'}) en la app.`
              : `${firstName(athleteName)} ya puede ver su semana en la app.`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring mt-1 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-2 text-sm font-semibold text-[color:var(--fg)] transition-colors hover:bg-[color:var(--surface-container-low)]"
        >
          Cerrar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* ── TOP BAR ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-headline-md [overflow-wrap:anywhere] text-[color:var(--fg)]">
            Semana {rangeLabel}
          </h2>
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            {subtitle}
            {changedCount > 0 ? (
              <>
                {' · '}
                <span className="metric-num">{changedCount}</span>{' '}
                {changedCount === 1 ? 'día con cambios' : 'días con cambios'}
              </>
            ) : null}
          </p>
        </div>

        {/* Pill BORRADOR — superficie elevada/muda, NO alarma. */}
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] px-3 py-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-[color:var(--text-muted)]" />
          <span className="micro-label text-[color:var(--text-muted)]">Borrador</span>
        </span>

        <button
          type="button"
          onClick={onClose}
          className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-[var(--r-s)] px-2 py-1.5 text-xs font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)]"
        >
          <MIcon name="close" size={14} aria-hidden />
          Cerrar
        </button>
      </div>

      {/* ── BODY: main (lo que verá el atleta) + panel ¿Por qué? ── */}
      <div className="mt-[var(--s-l)] flex flex-col gap-[var(--gutter)] lg:flex-row lg:items-start">
        {/* MAIN */}
        <section className="min-w-0 flex-1">
          <div className="mb-[var(--s-m)]">
            <h3 className="micro-label">Lo que verá el atleta</h3>
          </div>

          {loading ? (
            <div
              className="rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-6 text-sm text-[color:var(--text-muted)]"
              role="status"
            >
              Cargando la semana…
            </div>
          ) : loadError ? (
            <p
              role="alert"
              className="rounded-[var(--r-m)] border border-[color:color-mix(in_srgb,var(--danger)_40%,var(--border-subtle))] bg-[color:var(--surface-card)] px-3 py-2 text-xs text-[color:var(--danger)]"
            >
              {loadError}{' '}
              <button type="button" onClick={loadWeek} className="focus-ring font-semibold underline">
                reintentar
              </button>
            </p>
          ) : rows.length === 0 ? (
            <div className="rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-6 text-sm text-[color:var(--text-muted)]">
              No hay sesiones asignadas en esta semana todavía.
            </div>
          ) : (
            <div
              className="overflow-hidden rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]"
              role="list"
              aria-label={`Plan propuesto · semana ${rangeLabel}`}
            >
              {rows.map((row, i) => (
                <DayRow key={row.iso_date} row={row} withDivider={i > 0} />
              ))}
            </div>
          )}
        </section>

        {/* SIDE PANEL — ¿Por qué? */}
        <aside className="w-full shrink-0 lg:w-[340px]">
          <div className="card-elevated p-[var(--s-l)]">
            <div className="flex flex-wrap items-center gap-2">
              <MIcon name="neurology" size={18} className="shrink-0 text-[color:var(--accent)]" aria-hidden />
              <h3 className="font-heading-sm text-[color:var(--fg)]">¿Por qué?</h3>
              {/* Recomendación/verdict de la IA — vive AQUÍ, no en el subtítulo. */}
              {recLabel ? (
                <span className="ml-auto inline-flex shrink-0 items-center rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] px-2 py-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
                    {recLabel}
                  </span>
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--text-muted)]">
              {proposal
                ? 'Propuesto por Pablo IA · desde su plan'
                : reviewingBlock
                  ? `Bloque en borrador · ${blockWeekCount} ${blockWeekCount === 1 ? 'semana' : 'semanas'} listas para publicar`
                  : 'Borrador de la semana siguiente · listo para publicar'}
            </p>

            {summary ? (
              <p className="mt-[var(--s-m)] text-[13px] leading-relaxed text-[color:var(--fg)]">
                {summary}
              </p>
            ) : null}

            {/* Ajustes — la lista de slot_changes con nombres resueltos. */}
            {diff.length > 0 ? (
              <div className="mt-[var(--s-l)]">
                <h4 className="micro-label">Ajustes</h4>
                <ul className="mt-2 flex flex-col gap-2">
                  {diff.map((d, i) => (
                    <li key={`${d.day_label}-${i}`} className="flex items-start gap-2">
                      <span
                        aria-hidden
                        className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[color:var(--accent)]"
                      />
                      <span className="text-[13px] leading-snug text-[color:var(--fg)]">
                        <span className="micro-label text-[color:var(--text-muted)]">{d.day_label}</span>
                        {' · '}
                        {d.to}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Diff vs. semana actual — con NOMBRES, nunca IDs. */}
            {diff.length > 0 ? (
              <div className="mt-[var(--s-l)] border-t border-[color:var(--border-subtle)] pt-[var(--s-l)]">
                <h4 className="micro-label">Cambios vs. semana actual</h4>
                <ul className="mt-2 flex flex-col gap-2.5">
                  {diff.map((d, i) => (
                    <li key={`diff-${d.day_label}-${i}`} className="flex flex-col gap-1">
                      <span className="micro-label text-[color:var(--text-muted)]">{d.day_label}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[13px] leading-snug">
                        <span className="text-[color:var(--text-muted)] line-through decoration-[color:var(--text-muted)]/60">
                          {d.from}
                        </span>
                        <MIcon
                          name="arrow_forward"
                          size={14}
                          className="shrink-0 text-[color:var(--text-muted)]"
                          aria-hidden
                        />
                        <span className="font-medium text-[color:var(--fg)]">{d.to}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-[var(--s-l)] border-t border-[color:var(--border-subtle)] pt-[var(--s-l)] text-[13px] leading-snug text-[color:var(--text-muted)]">
                Sin cambios respecto a la semana actual — publícala tal cual.
              </p>
            )}
          </div>
        </aside>
      </div>

      {/* ── ACTION BAR (pegajosa) ── */}
      <div className="sticky bottom-0 z-10 mt-[var(--s-l)] -mx-4 border-t border-[color:var(--border-subtle)] bg-[color:var(--bg)]/90 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-[13px] text-[color:var(--text-muted)]">
              {reviewingBlock
                ? `Se publicarán ${blockWeekCount} ${blockWeekCount === 1 ? 'semana' : 'semanas'} a ${firstName(athleteName)} al confirmar.`
                : `Se publica en la app de ${firstName(athleteName)} al confirmar.`}
            </p>
            {publishError ? (
              <p role="alert" className="mt-0.5 text-[13px] font-medium text-[color:var(--danger)]">
                {publishError}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onEditInCalendar(targetWeekStart)}
              className="focus-ring rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-5 py-2.5 text-sm font-semibold text-[color:var(--fg)] transition-colors hover:bg-[color:var(--surface-container-low)]"
            >
              Editar plan
            </button>
            <button
              type="button"
              onClick={publish}
              disabled={loading || publishState === 'publishing' || rows.length === 0}
              className="focus-ring inline-flex items-center gap-2 rounded-[var(--r-m)] bg-[color:var(--accent)] px-5 py-2.5 text-sm font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)] disabled:opacity-50"
            >
              {publishState === 'publishing' ? (
                <>
                  <MIcon name="progress_activity" size={16} className="animate-spin" aria-hidden />
                  Publicando…
                </>
              ) : (
                `Publicar a ${firstName(athleteName)}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Una fila = un DÍA de la semana PROPUESTA. Replica el row canónico (mock /
// AthleteWeekCalendar): barra de estado a altura completa + día/fecha fijos a la
// izquierda + meta line "KICKER · DURACIÓN" inline + título COMPLETO sin elipsis.
// La derecha NO lleva dato. Barra: día cambiado por la propuesta → acento;
// día sin cambios → mudo (es un borrador, todo 'scheduled').
function DayRow({ row, withDivider }: { row: ProposedRow; withDivider: boolean }) {
  const barColor = row.changed ? 'var(--accent)' : 'var(--text-muted)';

  return (
    <div
      role="listitem"
      className={cn(
        'group/day flex items-stretch',
        withDivider && 'border-t border-[color:var(--border-subtle)]',
      )}
    >
      {/* Columna fija: día + fecha. */}
      <div className="flex w-[5.5rem] shrink-0 flex-col justify-center gap-0.5 px-3 py-3">
        <span className="micro-label leading-none text-[color:var(--text-muted)]">
          {row.label.toUpperCase()} {dayNumber(row.iso_date)}
        </span>
      </div>

      {/* Cuerpo del día. */}
      <div
        className={cn(
          'relative flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2',
          row.rest ? 'min-h-[56px]' : 'min-h-[64px]',
        )}
      >
        {/* Barra de estado a altura completa. */}
        <span
          aria-hidden
          className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r-[2px]"
          style={{ backgroundColor: barColor }}
        />

        {row.rest ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <MIcon name="bedtime" size={16} className="shrink-0 text-[color:var(--text-muted)]" aria-hidden />
            <span className="font-body-md text-[13px] font-semibold text-[color:var(--fg)]">
              {row.title}
            </span>
            {row.changed ? <ChangedChip /> : null}
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <span className="micro-label">
                {row.kicker ?? 'Sesión'}
                {row.durationMin != null ? (
                  <span className="text-[color:var(--text-muted)]">
                    {' · '}
                    <span className="metric-num">{row.durationMin}’</span>
                  </span>
                ) : null}
              </span>
              {row.changed ? <ChangedChip /> : null}
            </span>
            <span className="font-body-md [overflow-wrap:anywhere] text-[13px] font-semibold leading-snug text-[color:var(--fg)]">
              {row.title}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

// Chip "Cambiado" — superficie elevada muda con punto de acento, NO alarma.
function ChangedChip() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-[var(--r-pill)] border border-[color:color-mix(in_srgb,var(--accent)_40%,var(--border-subtle))] bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--surface-card))] px-2 py-0.5">
      <span aria-hidden className="size-1 rounded-full bg-[color:var(--accent)]" />
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[color:var(--accent)]">
        Cambiado
      </span>
    </span>
  );
}
