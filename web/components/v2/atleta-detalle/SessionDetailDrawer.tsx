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

import { useEffect, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { prescriptionToText, formatDuration } from '@fahybrid/shared/domain/prescription';
import type {
  AssignmentDetailItem,
  AssignmentDetailParamsJson,
} from '@/lib/athlete/assignment-detail';
import type { CoachSessionDetail } from '@/lib/dashboard/coach/athlete-session-adapter';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';

// ── pace m:ss (s → "4:15"); seconds always zero-padded. ─────────────────────
function paceClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function round(n: number, dp = 0): string {
  const f = Math.pow(10, dp);
  return String(Math.round(n * f) / f);
}

// ── "prescrito" line: the rich structured prescription when present, else a
//    compact scalar fallback from the normalized params. ─────────────────────
function prescritoLine(item: AssignmentDetailItem): string {
  if (item.prescription_json) {
    const text = prescriptionToText(item.prescription_json);
    if (text) return text;
  }
  const p: AssignmentDetailParamsJson = item.params_json;
  const parts: string[] = [];
  if (p.sets != null && p.reps != null) parts.push(`${p.sets}×${p.reps}`);
  else if (p.reps != null) parts.push(`${p.reps} reps`);
  else if (p.sets != null) parts.push(`${p.sets} series`);
  if (p.distance_meters != null) parts.push(`${round(p.distance_meters)}m`);
  if (p.duration_seconds != null) parts.push(formatDuration(p.duration_seconds));
  const tgt: string[] = [];
  if (p.load_kg != null) tgt.push(`${round(p.load_kg, 1)} kg`);
  else if (p.load_pct != null) tgt.push(`${round(p.load_pct)}% RM`);
  if (p.pace_sec_per_km != null) tgt.push(`${paceClock(p.pace_sec_per_km)}/km`);
  if (p.hr_zone != null) tgt.push(`Z${p.hr_zone}`);
  if (p.rpe != null) tgt.push(`RPE ${p.rpe}`);
  const head = parts.join(' · ');
  const target = tgt.join(' · ');
  return [head, target].filter(Boolean).join(' @ ') || '—';
}

// ── "hecho" tokens: every present actual field, in a stable order. The pace unit
//    is implied by which pace field is non-null (run = /km, erg = /500m). ─────
function actualTokens(a: SegmentActual): string[] {
  const t: string[] = [];
  if (a.reps_completed != null) t.push(`${a.reps_completed} reps`);
  if (a.weight_used_kg != null) t.push(`${round(a.weight_used_kg, 1)} kg`);
  if (a.distance_meters != null) t.push(`${round(a.distance_meters)} m`);
  if (a.avg_pace_s_per_km != null) t.push(`${paceClock(a.avg_pace_s_per_km)}/km`);
  if (a.avg_pace_s_per_500m != null) t.push(`${paceClock(a.avg_pace_s_per_500m)}/500m`);
  if (a.avg_power_w != null) t.push(`${round(a.avg_power_w)} W`);
  if (a.stroke_rate_spm != null) t.push(`${round(a.stroke_rate_spm)} spm`);
  // Duration is the primary work measure only when there's no distance/reps to
  // describe the segment — otherwise it's noise next to "1000 m".
  if (a.duration_seconds != null && a.distance_meters == null && a.reps_completed == null) {
    t.push(formatDuration(a.duration_seconds));
  }
  if (a.avg_hr != null) t.push(`${a.avg_hr} ppm`);
  if (a.calories != null) t.push(`${round(a.calories)} cal`);
  return t;
}

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

function HechoChips({ tokens }: { tokens: string[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {tokens.map((tk, i) => (
        <span
          key={i}
          className="v2-num inline-flex items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-ok)] bg-[color:var(--v2-ok-soft,rgba(60,170,110,.10))] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--v2-ok)]"
        >
          {tk}
        </span>
      ))}
    </span>
  );
}

export function SessionDetailDrawer({
  athleteId,
  assignmentId,
  onClose,
}: {
  athleteId: string;
  assignmentId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<CoachSessionDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    fetch(`/api/coach/athletes/${athleteId}/sessions/${assignmentId}/detail`, {
      credentials: 'include',
    })
      .then(async (res) => {
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
  }, [athleteId, assignmentId]);

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

  const title = detail
    ? detail.display_title ?? detail.workout?.name ?? 'Entreno'
    : 'Entreno';
  const statusMeta = detail ? STATUS_META[detail.status] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={`Detalle del entreno: ${title}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col border-l border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
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
                    <h3 className="v2-micro">{block.title}</h3>
                    <div className="flex flex-col gap-1.5">
                      {block.items.map((item) => {
                        const actuals = byItem.get(item.uid) ?? [];
                        return (
                          <div
                            key={item.uid}
                            className="flex flex-col gap-1.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2.5"
                          >
                            <span className="text-sm font-semibold text-[color:var(--v2-fg)]">
                              {item.exercise_name}
                            </span>
                            <div className="flex items-baseline gap-2">
                              <span className="v2-micro shrink-0 w-[58px]">Prescrito</span>
                              <span className="v2-num text-xs text-[color:var(--v2-muted)]">
                                {prescritoLine(item)}
                              </span>
                            </div>
                            {actuals.length > 0 ? (
                              actuals.map((a) => {
                                const tokens = actualTokens(a);
                                return (
                                  <div key={a.position} className="flex items-baseline gap-2">
                                    <span className="v2-micro shrink-0 w-[58px] text-[color:var(--v2-ok)]">
                                      Hecho
                                    </span>
                                    {tokens.length > 0 ? (
                                      <HechoChips tokens={tokens} />
                                    ) : (
                                      <span className="v2-num text-xs text-[color:var(--v2-muted)]">
                                        registrado sin métricas
                                      </span>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              <div className="flex items-baseline gap-2">
                                <span className="v2-micro shrink-0 w-[58px]">Hecho</span>
                                <span className="text-xs text-[color:var(--v2-faint)]">sin registro</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))
              ) : (
                <p className="py-8 text-center text-xs text-[color:var(--v2-muted)]">
                  Este entreno no tiene plantilla asociada.
                </p>
              )}

              {/* Logged segments not matched to a prescribed item */}
              {unmatched.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <h3 className="v2-micro">Tramos registrados sin asociar</h3>
                  <div className="flex flex-col gap-1.5">
                    {unmatched.map((a) => (
                      <div
                        key={a.position}
                        className="flex items-center gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2"
                      >
                        <span className="v2-micro shrink-0 capitalize">{a.modality}</span>
                        <HechoChips tokens={actualTokens(a)} />
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
