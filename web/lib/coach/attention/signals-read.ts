import 'server-only';

// La lectura de las señales vivas de un coach — UNA consulta indexada sobre lo
// que el barrido ya persistió (`coach_attention_items`) con lo que el coach
// decidió encima (`coach_alert_overrides`). La comparten el estado del atleta
// (§4.1), Hoy (§4.3) y el roster (§4.4): tres superficies, una fuente.
//
// Cada señal sale ya en la forma del contrato (`AthleteSignal`), con su acción y
// su filtro, y separada en VIVAS (lo que el coach ve) y SILENCIADAS (pospuestas
// o hechas y sin motivo para volver — `resurface.ts`). Solo atletas activos: un
// pausado o de baja no pide nada (#13).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isPgMissingRelation } from '@/lib/dashboard/db/pg-errors';
import {
  SIGNAL_ACTION,
  SIGNAL_LENS,
  sortSignals,
  type AthleteSignal,
  type SignalAction,
} from '@fahybrid/shared/domain/coach/athlete-state';
import type { SignalKind, SignalSeverity } from '@fahybrid/shared/domain/coach/signals';
import { isSuppressed, type SuppressionOverride } from './resurface';

export interface SilencedSignal {
  signal: AthleteSignal;
  /** snooze = pospuesta (1 d, 3 d o hasta nueva señal) · done = hecha. */
  by: 'snooze' | 'done';
  until: string | null;
}

export interface AthleteSignalsRead {
  /** Vivas, peor primero (incluye las informativas). */
  live: AthleteSignal[];
  silenced: SilencedSignal[];
  /** La posposición con fecha más tardía de las silenciadas, o null. */
  snoozed_until: string | null;
}

interface Row {
  athlete_id: string;
  signal_kind: SignalKind;
  severity: SignalSeverity;
  value_numeric: number | null;
  baseline_numeric: number | null;
  label: string;
  detail: string;
  dedupe_key: string;
  observed_at: Date | null;
  window_label: string | null;
  first_seen_at: Date;
  snoozed_until: Date | null;
  dismissed_at: Date | null;
  resurface_on_new_signal: boolean | null;
  baseline_value_at_override: number | null;
  severity_at_override: SignalSeverity | null;
  override_dedupe_key: string | null;
  override_kind: 'snooze' | 'done' | null;
}

/** La acción de una señal: la de su tipo, con dos matices de instancia. */
export function signalAction(kind: SignalKind, severity: SignalSeverity, dedupe_key: string): SignalAction {
  // Cancelar la suscripción no se «recuerda»: se habla con el atleta.
  if (kind === 'billing_at_risk' && severity !== 'critical') return 'mensaje';
  // Una semana vacía con programa se mira; sin programa se asigna.
  if (kind === 'programming_status' && dedupe_key.endsWith(':empty_week')) return 'ver_semana';
  return SIGNAL_ACTION[kind];
}

function toSignal(r: Row): AthleteSignal {
  return {
    kind: r.signal_kind,
    severity: r.severity,
    label: r.label,
    evidence: r.detail,
    value: r.value_numeric,
    baseline: r.baseline_numeric,
    window_label: r.window_label,
    observed_at: r.observed_at ? r.observed_at.toISOString() : null,
    action: signalAction(r.signal_kind, r.severity, r.dedupe_key),
    lens: SIGNAL_LENS[r.signal_kind] ?? 'plan',
    first_seen_at: r.first_seen_at.toISOString(),
    dedupe_key: r.dedupe_key,
  };
}

function toOverride(r: Row): SuppressionOverride | null {
  if (r.snoozed_until == null && r.dismissed_at == null) return null;
  return {
    snoozed_until: r.snoozed_until,
    dismissed_at: r.dismissed_at,
    resurface_on_new_signal: r.resurface_on_new_signal ?? true,
    baseline_value_at_override: r.baseline_value_at_override,
    severity_at_override: r.severity_at_override,
    dedupe_key: r.override_dedupe_key,
  };
}

export async function loadAthleteSignals(params: {
  coach_id: bigint | number;
  athlete_ids?: ReadonlyArray<number | bigint | string>;
  now?: Date;
  client?: Sql;
}): Promise<Map<string, AthleteSignalsRead>> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const ids = params.athlete_ids ? [...new Set(params.athlete_ids.map((x) => Number(x)))] : null;

  let rows: Row[];
  try {
    rows = await client<Row[]>`
      select
        i.athlete_id::text            as athlete_id,
        i.signal_kind                 as signal_kind,
        i.severity                    as severity,
        i.value_numeric               as value_numeric,
        i.baseline_numeric            as baseline_numeric,
        i.label                       as label,
        i.detail                      as detail,
        i.dedupe_key                  as dedupe_key,
        i.observed_at                 as observed_at,
        i.window_label                as window_label,
        i.first_seen_at               as first_seen_at,
        o.snoozed_until               as snoozed_until,
        o.dismissed_at                as dismissed_at,
        o.resurface_on_new_signal     as resurface_on_new_signal,
        o.baseline_value_at_override  as baseline_value_at_override,
        o.severity_at_override        as severity_at_override,
        o.dedupe_key                  as override_dedupe_key,
        o.override_kind               as override_kind
      from coach_attention_items i
      join athletes a
        on a.id = i.athlete_id
       and a.coach_id = ${Number(params.coach_id)}
       and a.lifecycle_status = 'activo'
      left join coach_alert_overrides o
        on o.athlete_id = i.athlete_id and o.signal_kind = i.signal_kind
      where i.coach_id = ${Number(params.coach_id)}
        and (${ids}::bigint[] is null or i.athlete_id = any(${ids}::bigint[]))
    `;
  } catch (err) {
    if (isPgMissingRelation(err, 'coach_attention_items')) return new Map();
    throw err;
  }

  const out = new Map<string, AthleteSignalsRead>();
  for (const r of rows) {
    let entry = out.get(r.athlete_id);
    if (!entry) {
      entry = { live: [], silenced: [], snoozed_until: null };
      out.set(r.athlete_id, entry);
    }
    const signal = toSignal(r);
    const override = toOverride(r);
    if (!isSuppressed(
      {
        signal_kind: r.signal_kind,
        severity: r.severity,
        value_numeric: r.value_numeric,
        dedupe_key: r.dedupe_key,
      },
      override,
      now,
    )) {
      entry.live.push(signal);
      continue;
    }
    const timed = r.snoozed_until && r.snoozed_until.getTime() > now.getTime();
    const by: SilencedSignal['by'] =
      r.override_kind ?? (timed || r.dismissed_at == null ? 'snooze' : 'done');
    const until = timed ? r.snoozed_until!.toISOString() : null;
    entry.silenced.push({ signal, by, until });
    if (until && (entry.snoozed_until == null || until > entry.snoozed_until)) {
      entry.snoozed_until = until;
    }
  }
  for (const entry of out.values()) entry.live = sortSignals(entry.live);
  return out;
}
