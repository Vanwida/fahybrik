'use client';

// Lectura del día: el plan se entiende por agrupación, no por etiquetas.
// Dosis pegada al nombre. Nota en cursiva solo si el coach la escribió.
// Barra izquierda solo si dos o más ítems COMPARTEN ronda/descanso.

import { formatDuration, prescriptionToText } from '@fahybrid/shared/domain/prescription';
import type {
  AssignmentDetailBlock,
  AssignmentDetailItem,
  AssignmentDetailParamsJson,
} from '@/lib/athlete/assignment-detail';
import type { SegmentActual, SetActual } from '@/lib/dashboard/coach/session-actuals';
import type { ErgSplitItem } from '@/lib/execution/erg-splits';

export function paceClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function round(n: number, dp = 0): string {
  const f = Math.pow(10, dp);
  return String(Math.round(n * f) / f);
}

export function prescritoLine(item: AssignmentDetailItem): string {
  if (item.prescription_json) {
    const text = prescriptionToText(item.prescription_json);
    if (text) return text;
  }
  const p: AssignmentDetailParamsJson = item.params_json;
  const parts: string[] = [];
  if (p.sets != null && p.reps != null) parts.push(`${p.sets}×${p.reps}`);
  else if (p.reps != null) parts.push(`${p.reps}`);
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
  return [head, target].filter(Boolean).join(' @ ');
}

export function actualTokens(a: SegmentActual): string[] {
  const t: string[] = [];
  if (a.emom_rounds_completed != null && a.emom_rounds_prescribed != null) {
    t.push(`${a.emom_rounds_completed}/${a.emom_rounds_prescribed}`);
  }
  if (a.reps_completed != null) t.push(`${a.reps_completed}`);
  if (a.weight_used_kg != null) t.push(`${round(a.weight_used_kg, 1)} kg`);
  if (a.distance_meters != null) t.push(`${round(a.distance_meters)} m`);
  if (a.avg_pace_s_per_km != null) t.push(`${paceClock(a.avg_pace_s_per_km)}/km`);
  if (a.avg_pace_s_per_500m != null) t.push(`${paceClock(a.avg_pace_s_per_500m)}/500m`);
  if (a.avg_power_w != null) t.push(`${round(a.avg_power_w)} W`);
  if (a.stroke_rate_spm != null) t.push(`${round(a.stroke_rate_spm)} spm`);
  if (a.duration_seconds != null && a.distance_meters == null && a.reps_completed == null) {
    t.push(formatDuration(a.duration_seconds));
  }
  if (a.avg_hr != null) t.push(`${a.avg_hr} ppm`);
  if (a.calories != null) t.push(`${round(a.calories)} cal`);
  return t;
}

export function approachSetLabel(s: SetActual): string {
  const carga = s.load_actual_kg != null ? `${round(s.load_actual_kg, 1)} kg` : null;
  const reps = s.reps_actual != null ? String(s.reps_actual) : null;
  if (reps && carga) return `${reps} × ${carga}`;
  if (reps) return reps;
  if (carga) return carga;
  return '';
}

function cell(v: number | null | undefined, fmt: (n: number) => string): string {
  return v != null ? fmt(v) : '—';
}

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

const SHARE_FORMATS = new Set([
  'circuit',
  'superset',
  'emom',
  'amrap',
  'for_time',
  'rounds',
  'hyrox_sim',
  'chipper',
  'tabata',
  'death_by',
  'ladder',
  'simulation',
]);

const SHARE_SCHEMES = new Set([
  'superset',
  'circuit',
  'emom',
  'amrap',
  'for_time',
  'rounds',
  'hyrox_sim',
  'chipper',
  'tabata',
  'death_by',
  'ladder',
]);

const HIDDEN_SECTION_TITLES = new Set([
  'circuito',
  'intervalos',
  'amrap',
  'emom',
  'for time',
  'simulación',
  'simulación hyrox',
  'tempo',
]);

export type BlockArrangement = 'solo' | 'followed' | 'group';

export function hasSharedBlockConfig(config: Record<string, unknown>): boolean {
  return (
    config.rounds != null ||
    config.pacing != null ||
    config.rest_between_stations_seconds != null ||
    config.rest_between_rounds_seconds != null
  );
}

export function blockArrangement(block: {
  format: string;
  config_json: Record<string, unknown>;
  items: { prescription_json: { scheme?: string } | null }[];
}): BlockArrangement {
  if (block.items.length < 2) return 'solo';
  if (hasSharedBlockConfig(block.config_json)) return 'group';
  if (SHARE_FORMATS.has(block.format.trim().toLowerCase())) return 'group';
  const schemes = block.items.map((item) => item.prescription_json?.scheme);
  if (schemes.every((scheme) => scheme != null && SHARE_SCHEMES.has(scheme))) return 'group';
  return 'followed';
}

export function authoredSectionTitle(blockTitle: string, sessionTitle: string): string | null {
  const title = blockTitle.trim();
  if (!title) return null;
  if (title === sessionTitle.trim()) return null;
  if (/^bloque\s+\d+$/i.test(title)) return null;
  if (HIDDEN_SECTION_TITLES.has(title.toLowerCase())) return null;
  return title;
}

export function ItemPrescritoHecho({
  item,
  actuals,
}: {
  item: AssignmentDetailItem;
  actuals: SegmentActual[];
}) {
  const name = item.exercise_name.trim();
  const dose = prescritoLine(item);
  const note = item.notes?.trim() ?? '';
  const actualLine = actuals.flatMap(actualTokens).join(' · ');
  const approaches = actuals.flatMap((a) =>
    (a.sets ?? []).filter((s) => s.is_approach).map(approachSetLabel).filter(Boolean),
  );
  const splitTables = actuals.filter((a) => a.erg_splits && a.erg_splits.length > 0);

  if (!name && !dose && !note && !actualLine && approaches.length === 0 && splitTables.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {name || dose || actualLine ? (
        <p className="text-sm leading-snug text-[color:var(--v2-fg)]">
          {name ? <span className="font-semibold">{name}</span> : null}
          {name && dose ? ' ' : null}
          {dose ? <span>{dose}</span> : null}
          {actualLine ? (
            <span className="text-[color:var(--v2-muted)]">
              {name || dose ? '  ' : null}
              {actualLine}
            </span>
          ) : null}
        </p>
      ) : null}
      {note ? (
        <p className="text-sm italic leading-snug text-[color:var(--v2-muted)]">{note}</p>
      ) : null}
      {approaches.map((label, i) => (
        <span key={i} className="v2-num text-xs text-[color:var(--v2-muted)]">
          {label}
        </span>
      ))}
      {splitTables.map((a) => (
        <SplitsTable
          key={a.position}
          splits={a.erg_splits ?? []}
          dragFactor={a.drag_factor}
          calPerHour={a.avg_calories_per_hour}
        />
      ))}
    </div>
  );
}

export function SessionBlockSection({
  block,
  sessionTitle,
  actualsByItem,
}: {
  block: AssignmentDetailBlock;
  sessionTitle: string;
  actualsByItem: Map<string, SegmentActual[]>;
}) {
  const title = authoredSectionTitle(block.title, sessionTitle);
  const note = block.coach_note?.trim() ?? '';
  const arrangement = blockArrangement(block);
  if (block.items.length === 0 && !note) return null;

  const rows = block.items.map((item) => (
    <ItemPrescritoHecho key={item.uid} item={item} actuals={actualsByItem.get(item.uid) ?? []} />
  ));

  return (
    <section className="flex flex-col gap-2">
      {title ? <h3 className="v2-micro">{title}</h3> : null}
      {note ? <p className="text-sm italic leading-snug text-[color:var(--v2-muted)]">{note}</p> : null}
      {arrangement === 'group' ? (
        <div data-arrangement="group" className="flex gap-3">
          <div aria-hidden className="w-0.5 shrink-0 self-stretch bg-[color:var(--v2-fg)]" />
          <div className="flex min-w-0 flex-1 flex-col">
            {block.items.map((item, i) => (
              <div key={item.uid}>
                {i > 0 ? (
                  <div aria-hidden className="my-2 mr-8 border-t border-[color:var(--v2-border)]" />
                ) : null}
                <ItemPrescritoHecho item={item} actuals={actualsByItem.get(item.uid) ?? []} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div data-arrangement={arrangement} className="flex flex-col gap-2">
          {rows}
        </div>
      )}
    </section>
  );
}
