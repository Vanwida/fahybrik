'use client';

// SessionDetailDrawer — closes the athlete→coach loop. The athlete logs real
// actuals per exercise (segment_executions: reps, load, distance, pace, power,
// HR, calories); the coach used to see only the AGGREGATE (total time + session
// RPE). This drawer fetches the coach session-detail endpoint and renders, per
// exercise, the PRESCRIPTION (prescrito) next to what the athlete actually did
// (hecho) — so "prescribed 4×4 @120kg" sits beside "5 @140kg", or "4:30/km" beside
// "4:15/km".
//
// Honest by construction: actuals come keyed to the prescribed item via
// `item_uid`; an item with no matching actual shows the prescription with a muted
// "sin registro" (never a fabricated number); a session whose athlete logged only
// the aggregate shows a single note + the prescription. Read-only — editing lives
// in the day editor.
//
// `assignmentId` puede llegar de un `?sesion=` en la URL (PlanTab), no solo de un
// clic sobre un dato ya cargado — así que puede ser ajeno o no existir. Un 400/404
// dispara `onInvalid` (si el caller la da) en vez del aviso de error de siempre.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MIcon } from '@/components/ui/MIcon';
import { Link } from '@/i18n/navigation';
import { Pill } from '@/components/v2/Pill';
import { ADHERENCE_BAND_COLOR_VAR, adherenceBand } from '@/components/v2/constants';
import {
  HechoChips,
  ItemPrescritoHecho,
  SplitsTable,
  actualTokens,
} from '@/components/v2/sesion/ItemPrescritoHecho';
import type { RunComplianceSummary, RunComplianceVerdict } from '@fahybrid/shared/domain/adherence';
import type { CoachSessionDetail } from '@/lib/dashboard/coach/athlete-session-adapter';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';

const STATUS_META: Record<
  CoachSessionDetail['status'],
  { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }
> = {
  completed: { label: 'Completada', tone: 'ok' },
  partial: { label: 'Parcial', tone: 'warn' },
  scheduled: { label: 'Pendiente', tone: 'warn' },
  missed: { label: 'Perdida', tone: 'danger' },
  skipped: { label: 'Saltada', tone: 'neutral' },
};

// Session headline: % of evaluable run tramos that landed in band, coloured by the
// shared adherence thresholds. Null pct (no evaluable pace data) states so honestly.
function ComplianceSummaryTile({ summary }: { summary: RunComplianceSummary }) {
  const pct = summary.pct_dentro;
  const colorVar = pct != null ? ADHERENCE_BAND_COLOR_VAR[adherenceBand(pct)] : '--v2-muted';
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3.5 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="v2-micro">Cumplimiento por tramo</span>
        {pct != null ? (
          <span className="text-xs text-[color:var(--v2-muted)]">
            {summary.dentro} de {summary.evaluable} tramos en banda
            {summary.fuera_rapido > 0 ? ` · ${summary.fuera_rapido} más rápido` : ''}
            {summary.fuera_lento > 0 ? ` · ${summary.fuera_lento} más lento` : ''}
          </span>
        ) : (
          <span className="text-xs text-[color:var(--v2-muted)]">Sin datos de ritmo suficientes</span>
        )}
      </div>
      {pct != null ? (
        <span className="v2-num text-2xl font-bold leading-none" style={{ color: `var(${colorVar})` }}>
          {pct}%
        </span>
      ) : (
        <MIcon name="do_not_disturb_on" size={20} className="shrink-0 text-[color:var(--v2-faint)]" />
      )}
    </div>
  );
}

// What the coach reads when a session renders no blocks. Three different facts,
// three different sentences — the one that used to cover all of them ("no tiene
// plantilla asociada") is false for a cronómetro, which HAS a template and a real
// session behind it, and reads as breakage instead of as training.
const NO_BLOCKS_NOTE: Record<CoachSessionDetail['content_state'], string | null> = {
  blocks: null,
  clock:
    'El atleta usó la app como cronómetro y no anotó los movimientos. El formato, el tiempo y el esfuerzo son reales.',
  no_content: 'La plantilla de este entreno no tiene ejercicios.',
  no_template: 'Este entreno no tiene plantilla asociada.',
};

function NoBlocksNote({ state }: { state: CoachSessionDetail['content_state'] }) {
  const note = NO_BLOCKS_NOTE[state];
  if (!note) return null;
  return <p className="py-8 text-center text-xs text-[color:var(--v2-muted)]">{note}</p>;
}

export function SessionDetailDrawer({
  athleteId,
  assignmentId,
  onClose,
  onInvalid,
}: {
  athleteId: string;
  assignmentId: string;
  onClose: () => void;
  /** El `assignment_id` no existe, no es de este atleta, o llegó mal formado
   *  (la API responde 400/404). Distinto de un fallo real (500 / red caído):
   *  ese sigue mostrando el aviso de error de abajo, porque ahí el id SÍ era
   *  válido y el coach espera poder reintentar. Opcional — sin ella, ambos
   *  casos caen al mismo aviso de error de siempre. */
  onInvalid?: () => void;
}) {
  const [detail, setDetail] = useState<CoachSessionDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    fetch(`/api/coach/athletes/${athleteId}/sessions/${assignmentId}/detail`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 400 || res.status === 404) {
          if (onInvalid) onInvalid();
          else setState('error');
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { session: CoachSessionDetail };
        if (!alive) return;
        setDetail(body.session);
        setState('ready');
      })
      .catch(() => {
        if (alive) setState('error');
      });
    return () => {
      alive = false;
    };
  }, [athleteId, assignmentId, onInvalid]);

  // Peek: ancla en sitio para localizar el .v2-root; el contenido va al portal.
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(anchorRef.current?.closest<HTMLElement>('.v2-root') ?? document.body);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Index actuals by the prescribed item they map to.
  const byItem = new Map<string, SegmentActual[]>();
  const unmatched: SegmentActual[] = [];
  for (const a of detail?.segment_actuals ?? []) {
    if (a.item_uid) {
      const list = byItem.get(a.item_uid) ?? [];
      list.push(a);
      byItem.set(a.item_uid, list);
    } else {
      unmatched.push(a);
    }
  }
  const hasAnyActual = (detail?.segment_actuals.length ?? 0) > 0;
  const isCompleted = detail?.status === 'completed' || detail?.execution != null;

  // Per-tramo running-compliance verdicts, keyed to each logged lap (`uid#position`).
  const verdictByLap = new Map<string, RunComplianceVerdict>();
  for (const t of detail?.run_compliance?.tramos ?? []) {
    if (t.position != null) verdictByLap.set(`${t.item_uid}#${t.position}`, t.verdict);
  }
  const complianceSummary = detail?.run_compliance?.summary;
  const showCompliance = (complianceSummary?.total ?? 0) > 0;

  // A session with no renderable blocks still has a name (a clock's IS its shape,
  // "AMRAP · 12:00"), so fall through to the template name before giving up.
  const title = detail
    ? detail.display_title ?? detail.workout?.name ?? detail.template_name ?? 'Entreno'
    : 'Entreno';
  const statusMeta = detail ? STATUS_META[detail.status] : null;

  return (
    // PEEK, no modal: el panel vive a la derecha SIN velo y la semana de detrás
    // sigue viva: clicar otro día conmuta el detalle sin cerrar (la semana ES el
    // navegador del panel). Se portala al `.v2-root` más cercano porque un
    // `fixed` renderizado en sitio caía dentro del wrapper animado de la ficha
    // (containing block por transform) y salía atrapado. Escape cierra; no hay
    // scrim que clicar ni bloqueo de scroll: el fondo es interactivo a propósito.
    <span ref={anchorRef} hidden>
      {portalTarget
        ? createPortal(
            <aside
              role="dialog"
              aria-label={`Detalle del entreno: ${title}`}
              className="fixed inset-y-0 right-0 z-40 flex w-[min(640px,94vw)] flex-col border-l border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
            >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-[color:var(--v2-border)] px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="v2-display truncate text-xl">{title}</h2>
            {detail ? (
              <div className="flex flex-wrap items-center gap-2">
                {statusMeta ? (
                  <Pill tone={statusMeta.tone} variant="soft">
                    {statusMeta.label}
                  </Pill>
                ) : null}
                <span className="v2-num text-xs text-[color:var(--v2-muted)]">
                  {detail.iso_date}
                </span>
                {detail.execution?.duration_min != null ? (
                  <span className="v2-num text-xs text-[color:var(--v2-muted)]">
                    · {detail.execution.duration_min} min
                  </span>
                ) : null}
                {detail.execution?.rpe != null ? (
                  <span className="v2-num text-xs text-[color:var(--v2-muted)]">
                    · RPE {detail.execution.rpe}
                  </span>
                ) : null}
                {detail.execution?.score_label ? (
                  <span className="v2-num text-xs font-medium text-[color:var(--v2-fg)]">
                    · {detail.execution.score_label}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state === 'loading' ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[color:var(--v2-muted)]">
              <MIcon name="progress_activity" size={18} className="animate-spin" />
              <span className="text-sm">Cargando…</span>
            </div>
          ) : state === 'error' || !detail ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-[color:var(--v2-muted)]">
              <MIcon name="error_outline" size={22} className="text-[color:var(--v2-danger)]" />
              <span className="text-sm">No se pudo cargar el detalle del entreno.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* LA PUERTA A LA LECTURA EN PROFUNDIDAD. Solo cuando hay archivo:
                  una carrera archivada trae curva, troceado y un eje de tiempo,
                  y eso no cabe en 512 px (docs/carrera-en-el-panel.html, §02).
                  Sin traza no hay nada más que enseñar allí que aquí, así que la
                  entrada no aparece: un enlace que no lleva a nada es peor que
                  no tenerlo. */}
              {detail.execution?.trace.available ? (
                <Link
                  href={`/atletas/${athleteId}/sesion/${assignmentId}`}
                  className="v2-focus flex items-center justify-between gap-3 rounded-[var(--v2-r-m)] border border-[color:color-mix(in_srgb,var(--v2-accent)_40%,var(--v2-border))] bg-[color:color-mix(in_srgb,var(--v2-accent)_7%,var(--v2-surface-2))] px-3.5 py-3 transition-colors hover:border-[color:var(--v2-accent)]"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-[color:var(--v2-fg)]">Ver la carrera</span>
                    <span className="text-xs text-[color:var(--v2-muted)]">
                      Curva, tramo a tramo y lo que le pediste encima
                    </span>
                  </span>
                  <MIcon name="arrow_forward" size={18} className="shrink-0 text-[color:var(--v2-accent)]" />
                </Link>
              ) : null}

              {/* Running compliance — % of run tramos hit in band (#66) */}
              {showCompliance && complianceSummary ? (
                <ComplianceSummaryTile summary={complianceSummary} />
              ) : null}

              {/* Athlete notes */}
              {detail.execution?.athlete_notes ? (
                <div className="flex items-start gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
                  <MIcon name="sticky_note_2" size={17} className="mt-0.5 shrink-0 text-[color:var(--v2-muted)]" />
                  <p className="text-xs text-[color:var(--v2-fg)]">{detail.execution.athlete_notes}</p>
                </div>
              ) : null}

              {/* Honest note: executed but no per-exercise log */}
              {isCompleted && !hasAnyActual ? (
                <div className="flex items-start gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
                  <MIcon name="info" size={17} className="mt-0.5 shrink-0 text-[color:var(--v2-muted)]" />
                  <p className="text-xs text-[color:var(--v2-muted)]">
                    El atleta registró el agregado (tiempo / RPE), sin detalle por ejercicio.
                  </p>
                </div>
              ) : null}

              {/* Coach notes for the assignment */}
              {detail.coach_notes ? (
                <div className="flex flex-col gap-1 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
                  <span className="v2-micro">Nota del coach</span>
                  <p className="text-xs text-[color:var(--v2-fg)]">{detail.coach_notes}</p>
                </div>
              ) : null}

              {/* Blocks → items → prescrito vs hecho */}
              {detail.workout && detail.workout.blocks.length > 0 ? (
                detail.workout.blocks.map((block) => (
                  <section key={block.uid} className="flex flex-col gap-2">
                    {/* Una sesión de un solo bloque hereda el nombre de la
                        plantilla (assignment-detail.ts), que es justo el título
                        de esta ficha: repetirlo no informa de nada. */}
                    {block.title.trim() !== title.trim() ? (
                      <h3 className="v2-micro">{block.title}</h3>
                    ) : null}
                    <div className="flex flex-col gap-1.5">
                      {block.items.map((item) => (
                        <ItemPrescritoHecho
                          key={item.uid}
                          item={item}
                          actuals={byItem.get(item.uid) ?? []}
                          verdictByLap={verdictByLap}
                        />
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <NoBlocksNote state={detail.content_state} />
              )}

              {/* Logged segments not matched to a prescribed item */}
              {unmatched.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <h3 className="v2-micro">Tramos registrados sin asociar</h3>
                  <div className="flex flex-col gap-1.5">
                    {unmatched.map((a) => (
                      <div
                        key={a.position}
                        className="flex flex-col gap-1.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="v2-micro shrink-0 capitalize">{a.modality}</span>
                          <HechoChips tokens={actualTokens(a)} />
                        </div>
                        {a.erg_splits && a.erg_splits.length > 0 ? (
                          <SplitsTable
                            splits={a.erg_splits}
                            dragFactor={a.drag_factor}
                            calPerHour={a.avg_calories_per_hour}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>
            </aside>,
            portalTarget,
          )
        : null}
    </span>
  );
}
