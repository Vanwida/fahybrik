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
import { Pill, type PillTone } from '@/components/v2/Pill';
import { ADHERENCE_BAND_COLOR_VAR, adherenceBand } from '@/components/v2/constants';
import { prescriptionToText, formatDuration } from '@fahybrid/shared/domain/prescription';
import {
  RUN_COMPLIANCE_LABEL,
  RUN_COMPLIANCE_TIER,
  type RunComplianceSummary,
  type RunComplianceVerdict,
} from '@fahybrid/shared/domain/adherence';
import type {
  AssignmentDetailItem,
  AssignmentDetailParamsJson,
} from '@/lib/athlete/assignment-detail';
import type { CoachSessionDetail } from '@/lib/dashboard/coach/athlete-session-adapter';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';
import type { ErgSplitItem } from '@/lib/execution/erg-splits';

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

// Verdict tier → Pill tone. 'dentro' green, both out-of-band amber (a coaching
// signal, not a failure); 'sin_dato' renders no chip (atenuado — see VerdictPill).
const VERDICT_TONE: Record<'success' | 'warning' | 'neutral', PillTone> = {
  success: 'ok',
  warning: 'warn',
  neutral: 'neutral',
};

// The per-tramo compliance chip. Nothing for 'sin_dato' — a tramo with no objetivo
// or no captured signal shows no verdict rather than a fabricated one.
function VerdictPill({ verdict }: { verdict: RunComplianceVerdict }) {
  if (verdict === 'sin_dato') return null;
  return (
    <Pill tone={VERDICT_TONE[RUN_COMPLIANCE_TIER[verdict]]} variant="soft">
      {RUN_COMPLIANCE_LABEL[verdict]}
    </Pill>
  );
}

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

// A per-split cell: format when the metric landed, an em dash otherwise (the two
// PM5 frames don't always both arrive — never a fabricated 0).
function cell(v: number | null | undefined, fmt: (n: number) => string): string {
  return v != null ? fmt(v) : '—';
}

// Per-interval PM5 breakdown (row/ski/bike). Rendered only when the segment carried
// erg splits (see erg-splits.ts) — the ErgData interval table, one row per interval.
// The segment-level drag factor / cal·h⁻¹ head the table.
function SplitsTable({
  splits,
  dragFactor,
  calPerHour,
}: {
  splits: ErgSplitItem[];
  dragFactor: number | null;
  calPerHour: number | null;
}) {
  const hasRest = splits.some((s) => s.rest_time_seconds != null);
  const meta = [
    dragFactor != null ? `Drag ${round(dragFactor)}` : null,
    calPerHour != null ? `${round(calPerHour)} cal/h` : null,
  ].filter(Boolean);
  return (
    <div className="mt-0.5 overflow-x-auto rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)]">
      {meta.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--v2-border)] px-2.5 py-1.5">
          {meta.map((m) => (
            <span key={m} className="v2-num text-[11px] text-[color:var(--v2-muted)]">
              {m}
            </span>
          ))}
        </div>
      ) : null}
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="text-[color:var(--v2-faint)]">
            <th className="px-2.5 py-1 text-left font-medium">#</th>
            <th className="px-2 py-1 text-right font-medium">Tiempo</th>
            <th className="px-2 py-1 text-right font-medium">m</th>
            <th className="px-2 py-1 text-right font-medium">/500m</th>
            <th className="px-2 py-1 text-right font-medium">spm</th>
            <th className="px-2 py-1 text-right font-medium">W</th>
            {hasRest ? <th className="px-2.5 py-1 text-right font-medium">Desc.</th> : null}
          </tr>
        </thead>
        <tbody className="v2-num text-[color:var(--v2-fg)]">
          {splits.map((s) => (
            <tr key={s.index} className="border-t border-[color:var(--v2-border)]">
              <td className="px-2.5 py-1 text-left text-[color:var(--v2-muted)]">{s.index + 1}</td>
              <td className="px-2 py-1 text-right">{cell(s.time_seconds, paceClock)}</td>
              <td className="px-2 py-1 text-right">{cell(s.distance_meters, (n) => round(n))}</td>
              <td className="px-2 py-1 text-right">{cell(s.avg_pace_s_per_500m, paceClock)}</td>
              <td className="px-2 py-1 text-right">{cell(s.stroke_rate_spm, (n) => round(n))}</td>
              <td className="px-2 py-1 text-right">{cell(s.avg_power_w, (n) => round(n))}</td>
              {hasRest ? (
                <td className="px-2.5 py-1 text-right text-[color:var(--v2-muted)]">
                  {cell(s.rest_time_seconds, paceClock)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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

  // Per-tramo running-compliance verdicts, keyed to each logged lap (`uid#position`).
  const verdictByLap = new Map<string, RunComplianceVerdict>();
  for (const t of detail?.run_compliance?.tramos ?? []) {
    if (t.position != null) verdictByLap.set(`${t.item_uid}#${t.position}`, t.verdict);
  }
  const complianceSummary = detail?.run_compliance?.summary;
  const showCompliance = (complianceSummary?.total ?? 0) > 0;

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
                                {item.resolved_intensity ? (
                                  <span className="text-[color:var(--v2-faint)]">
                                    {' · '}
                                    {item.resolved_intensity.range_label}
                                  </span>
                                ) : null}
                              </span>
                            </div>
                            {actuals.length > 0 ? (
                              actuals.map((a) => {
                                const tokens = actualTokens(a);
                                const verdict = verdictByLap.get(`${item.uid}#${a.position}`);
                                return (
                                  <div key={a.position} className="flex flex-col gap-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
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
                                      {verdict ? <VerdictPill verdict={verdict} /> : null}
                                    </div>
                                    {a.erg_splits && a.erg_splits.length > 0 ? (
                                      <SplitsTable
                                        splits={a.erg_splits}
                                        dragFactor={a.drag_factor}
                                        calPerHour={a.avg_calories_per_hour}
                                      />
                                    ) : null}
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
      </div>
    </div>
  );
}
