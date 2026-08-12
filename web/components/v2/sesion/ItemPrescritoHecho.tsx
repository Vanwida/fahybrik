'use client';

// PRESCRITO AL LADO DE HECHO — la pieza que cierra el círculo atleta → coach.
//
// El atleta registra lo real por ejercicio (`segment_executions`: reps, carga,
// distancia, ritmo, potencia, pulso, calorías) y aquí se pone al lado de lo que
// se pidió: «4×4 @120 kg» junto a «5 @140 kg», «4:30/km» junto a «4:15/km».
//
// POR QUÉ VIVE AQUÍ Y NO DENTRO DEL CAJÓN. Lo usan dos superficies: el cajón de
// la ficha del atleta (el vistazo) y la página de sesión (la lectura en
// profundidad). Duplicarlo sería garantizar que dentro de tres meses una de las
// dos enseñe un campo que la otra no.
//
// HONESTO POR CONSTRUCCIÓN: lo real se casa con la línea prescrita por
// `item_uid`; una línea sin registro enseña la prescripción y un «sin registro»
// apagado, nunca un número fabricado.

import { Fragment } from 'react';
import { Pill, type PillTone } from '@/components/v2/Pill';
import { formatDuration, prescriptionToText } from '@fahybrid/shared/domain/prescription';
import {
  RUN_COMPLIANCE_LABEL,
  RUN_COMPLIANCE_TIER,
  type RunComplianceVerdict,
} from '@fahybrid/shared/domain/adherence';
import type { AssignmentDetailItem, AssignmentDetailParamsJson } from '@/lib/athlete/assignment-detail';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';
import type { ErgSplitItem } from '@/lib/execution/erg-splits';

// ── pace m:ss (s → "4:15"); seconds always zero-padded. ─────────────────────
export function paceClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function round(n: number, dp = 0): string {
  const f = Math.pow(10, dp);
  return String(Math.round(n * f) / f);
}

// ── "prescrito" line: the rich structured prescription when present, else a
//    compact scalar fallback from the normalized params. ─────────────────────
export function prescritoLine(item: AssignmentDetailItem): string {
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
  return [head, target].filter(Boolean).join(' @ ') || 'Sin dosis anotada';
}

// ── "hecho" tokens: every present actual field, in a stable order. The pace unit
//    is implied by which pace field is non-null (run = /km, erg = /500m). ─────
export function actualTokens(a: SegmentActual): string[] {
  const t: string[] = [];
  // EMOM completion (mig 0134): the segment's headline "hecho" — rounds the athlete
  // hit the prescribed work in, over rounds prescribed. Both fields present ⇔ EMOM
  // segment (both null off it), so guard on the pair — never a denominator-less ratio.
  if (a.emom_rounds_completed != null && a.emom_rounds_prescribed != null) {
    t.push(`${a.emom_rounds_completed}/${a.emom_rounds_prescribed} rondas`);
  }
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

// Verdict tier → Pill tone. 'dentro' green, both out-of-band amber (a coaching
// signal, not a failure); 'sin_dato' renders no chip (atenuado — see VerdictPill).
const VERDICT_TONE: Record<'success' | 'warning' | 'neutral', PillTone> = {
  success: 'ok',
  warning: 'warn',
  neutral: 'neutral',
};

// The per-tramo compliance chip. Nothing for 'sin_dato' — a tramo with no objetivo
// or no captured signal shows no verdict rather than a fabricated one.
export function VerdictPill({ verdict }: { verdict: RunComplianceVerdict }) {
  if (verdict === 'sin_dato') return null;
  return (
    <Pill tone={VERDICT_TONE[RUN_COMPLIANCE_TIER[verdict]]} variant="soft">
      {RUN_COMPLIANCE_LABEL[verdict]}
    </Pill>
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
export function SplitsTable({
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
            <span key={m} className="v2-num text-label text-[color:var(--v2-muted)]">
              {m}
            </span>
          ))}
        </div>
      ) : null}
      <table className="w-full border-collapse text-label">
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

export function HechoChips({ tokens }: { tokens: string[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {tokens.map((tk, i) => (
        <span
          key={i}
          className="v2-num inline-flex items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-ok)] bg-[color:var(--v2-ok-soft)] px-2 py-0.5 text-label font-semibold text-[color:var(--v2-ok)]"
        >
          {tk}
        </span>
      ))}
    </span>
  );
}

/** Una línea prescrita con lo que el atleta hizo debajo. */
export function ItemPrescritoHecho({
  item,
  actuals,
  verdictByLap,
}: {
  item: AssignmentDetailItem;
  actuals: SegmentActual[];
  /** Veredicto por lap, con la clave `${item_uid}#${position}`. */
  verdictByLap: Map<string, RunComplianceVerdict>;
}) {
  return (
    <div
      /* Rejilla de dos columnas: el ancho de la columna de etiquetas lo fija la
         más larga, así que «Prescrito» —mayúsculas y espaciado— NUNCA puede
         montarse encima del dato y comerse una cifra. */
      className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2.5 gap-y-1.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2.5"
    >
      <span className="col-span-2 text-sm font-semibold text-[color:var(--v2-fg)]">{item.exercise_name}</span>
      <span className="v2-micro">Prescrito</span>
      <span className="v2-num text-xs text-[color:var(--v2-muted)]">
        {prescritoLine(item)}
        {item.resolved_intensity ? (
          <span className="text-[color:var(--v2-faint)]">
            {' · '}
            {item.resolved_intensity.range_label}
          </span>
        ) : null}
      </span>
      {actuals.length > 0 ? (
        actuals.map((a) => {
          const tokens = actualTokens(a);
          const verdict = verdictByLap.get(`${item.uid}#${a.position}`);
          return (
            <Fragment key={a.position}>
              <span className="v2-micro text-[color:var(--v2-ok)]">Hecho</span>
              <span className="flex flex-wrap items-center gap-2">
                {tokens.length > 0 ? (
                  <HechoChips tokens={tokens} />
                ) : (
                  <span className="v2-num text-xs text-[color:var(--v2-muted)]">registrado sin métricas</span>
                )}
                {verdict ? <VerdictPill verdict={verdict} /> : null}
              </span>
              {a.erg_splits && a.erg_splits.length > 0 ? (
                <div className="col-span-2">
                  <SplitsTable splits={a.erg_splits} dragFactor={a.drag_factor} calPerHour={a.avg_calories_per_hour} />
                </div>
              ) : null}
            </Fragment>
          );
        })
      ) : (
        <>
          <span className="v2-micro">Hecho</span>
          <span className="text-xs text-[color:var(--v2-faint)]">sin registro</span>
        </>
      )}
      {/* Lo que el coach escribió DE SU PUÑO para esta línea
          (template_segments.notes). Llegaba al móvil del atleta y se caía justo
          aquí, que es donde el coach revisa lo que mandó. */}
      {item.notes ? (
        <p className="col-span-2 border-t border-[color:var(--v2-border)] pt-1.5 text-xs leading-snug text-[color:var(--v2-muted)]">
          {item.notes}
        </p>
      ) : null}
    </div>
  );
}
