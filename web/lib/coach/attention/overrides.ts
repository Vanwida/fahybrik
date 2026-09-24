import 'server-only';

// Posponer / hecho / deshacer sobre las señales de un atleta — la escritura de
// `coach_alert_overrides` que usan `/api/coach/inbox/snooze` y `/bulk`.
//
// El modelo de Hoy (plan §1, §4.3): la fila es el ATLETA. Posponer o marcar
// hecho una fila actúa sobre TODAS sus señales accionables de ese momento (si
// solo se silenciara la principal, la siguiente ocuparía su sitio y la fila no
// se iría nunca). Con `signal_kind` se actúa sobre una sola (p. ej. «hecho» en
// un hilo de Mensajes).
//
//   posponer 1 d / 3 d  → `snoozed_until` = inicio del día N en el huso de caja
//                         (el coach vuelve a verlo por la mañana, no a la hora
//                         exacta a la que pulsó). Vuelve antes si se agrava de
//                         nivel (vigilar → crítico).
//   hasta nueva señal   → `dismissed_at` + resurface: vuelve si se agrava o si
//                         es OTRA instancia (otra propuesta, otro episodio…).
//   hecho               → igual que «hasta nueva señal», contado como resuelto.
//   deshacer            → deja cada fila exactamente como estaba (lo devuelve la
//                         propia acción en `undo.restore`).
//
// Se captura el nivel, el valor y el dedupe de la señal al silenciarla (mig
// 0212): sin eso «vuelve si se agrava» no tenía contra qué comparar.

import { z } from 'zod';
import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { BOX_TIMEZONE, addDays, zonedWallClockToUtc } from '@fahybrid/shared/domain/dates';
import { startOfDayInTz } from '@fahybrid/shared/domain/coach/coach-timezone';
import { loadCoachTimezone } from '@/lib/coach/coach-timezone';
import {
  SIGNAL_KINDS,
  SIGNAL_SEVERITIES,
  type SignalKind,
  type SignalSeverity,
} from '@fahybrid/shared/domain/coach/signals';
import { isGroupOwnedSignal } from '@fahybrid/shared/domain/coach/athlete-state';
import { invalidateAttention } from './invalidate';

export const SNOOZE_UNTIL = ['1d', '3d', 'signal'] as const;
export type SnoozeUntil = (typeof SNOOZE_UNTIL)[number];

const athleteId = z.string().regex(/^\d+$/, 'athlete_id must be a numeric id');
const signalKind = z.enum(SIGNAL_KINDS);

/** Lo que había antes en una fila de override (null = no había fila). */
export const overrideSnapshotSchema = z.object({
  athlete_id: athleteId,
  signal_kind: signalKind,
  previous: z
    .object({
      snoozed_until: z.string().datetime().nullable(),
      dismissed_at: z.string().datetime().nullable(),
      resurface_on_new_signal: z.boolean(),
      baseline_value_at_override: z.number().nullable(),
      severity_at_override: z.enum(SIGNAL_SEVERITIES).nullable(),
      dedupe_key: z.string().max(500).nullable(),
      override_kind: z.enum(['snooze', 'done']).nullable(),
      coach_note: z.string().max(2000).nullable(),
    })
    .nullable(),
});
export type OverrideSnapshot = z.infer<typeof overrideSnapshotSchema>;

export const overrideTargetSchema = z.object({
  athlete_id: athleteId,
  /**
   * Sin tipo = la fila entera: todas sus señales accionables MENOS las que cubre
   * un grupo de Hoy (alta, pago vencido, sin programa), que se resuelven desde
   * su grupo.
   */
  signal_kind: signalKind.optional(),
});
export type OverrideTarget = z.infer<typeof overrideTargetSchema>;

export interface ApplyOverridesResult {
  applied: number;
  /** Hasta cuándo queda pospuesto (1 d / 3 d), o null (hasta nueva señal / hecho). */
  until_at: string | null;
  /** Lo que hay que mandar para deshacer exactamente esta acción. */
  undo: { action: 'undo'; restore: OverrideSnapshot[] };
}

export class OverrideForbiddenError extends Error {
  constructor() {
    super('Uno o más atletas no pertenecen al coach');
  }
}

/** Inicio del día N contando desde hoy, en el huso del coach (a su medianoche, no a la de Madrid). */
export function snoozeUntilDate(until: '1d' | '3d', now: Date, tz: string = BOX_TIMEZONE): Date {
  const days = until === '1d' ? 1 : 3;
  return zonedWallClockToUtc(addDays(startOfDayInTz(now, tz), days), tz);
}

async function assertOwned(tx: TransactionClient, coach_id: number, ids: number[]): Promise<void> {
  const owned = await tx<Array<{ id: string }>>`
    select id::text from athletes where coach_id = ${coach_id} and id = any(${ids}::bigint[])
  `;
  const set = new Set(owned.map((r) => r.id));
  if (ids.some((id) => !set.has(String(id)))) throw new OverrideForbiddenError();
}

interface ItemRow {
  athlete_id: string;
  signal_kind: SignalKind;
  severity: SignalSeverity;
  value_numeric: number | null;
  dedupe_key: string;
}

interface OverrideRow {
  athlete_id: string;
  signal_kind: SignalKind;
  snoozed_until: Date | null;
  dismissed_at: Date | null;
  resurface_on_new_signal: boolean;
  baseline_value_at_override: number | null;
  severity_at_override: SignalSeverity | null;
  dedupe_key: string | null;
  override_kind: 'snooze' | 'done' | null;
  coach_note: string | null;
}

function key(athlete_id: string, kind: string): string {
  return `${athlete_id}|${kind}`;
}

/**
 * Pospone o marca hechas las señales de los objetivos, en UNA transacción, y
 * devuelve con qué deshacerlo. Lanza `OverrideForbiddenError` si algún atleta no
 * es del coach (no escribe nada).
 */
export async function applyOverrides(params: {
  coach_id: bigint | number;
  targets: OverrideTarget[];
  action: 'snooze' | 'done';
  /** Para `snooze`: 1 d, 3 d o hasta nueva señal. */
  until?: SnoozeUntil;
  /** Compatibilidad: posponer hasta un instante exacto (cliente viejo). */
  snooze_until?: string;
  coach_note?: string | null;
  now?: Date;
  client?: Sql;
}): Promise<ApplyOverridesResult> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const coach_id = Number(params.coach_id);
  const ids = [...new Set(params.targets.map((t) => Number(t.athlete_id)))];

  const timed =
    params.action === 'snooze' && (params.until === '1d' || params.until === '3d')
      ? snoozeUntilDate(params.until, now, await loadCoachTimezone(coach_id, client))
      : params.action === 'snooze' && !params.until && params.snooze_until
        ? new Date(params.snooze_until)
        : null;

  const result = await client.begin(async (tx) => {
    await assertOwned(tx, coach_id, ids);

    const items = await tx<ItemRow[]>`
      select athlete_id::text as athlete_id, signal_kind, severity, value_numeric, dedupe_key
      from coach_attention_items
      where coach_id = ${coach_id} and athlete_id = any(${ids}::bigint[])
    `;
    const itemBy = new Map(items.map((i) => [key(i.athlete_id, i.signal_kind), i]));

    // Qué pares (atleta, tipo) se tocan.
    const pairs: Array<{ athlete_id: string; signal_kind: SignalKind; item: ItemRow | null }> = [];
    const seen = new Set<string>();
    for (const t of params.targets) {
      const kinds = t.signal_kind
        ? [t.signal_kind]
        : items
            .filter(
              (i) =>
                i.athlete_id === t.athlete_id &&
                (i.severity === 'critical' || i.severity === 'warning') &&
                !isGroupOwnedSignal({
                  kind: i.signal_kind,
                  severity: i.severity,
                  dedupe_key: i.dedupe_key,
                }),
            )
            .map((i) => i.signal_kind);
      for (const k of kinds) {
        const kk = key(t.athlete_id, k);
        if (seen.has(kk)) continue;
        seen.add(kk);
        pairs.push({ athlete_id: t.athlete_id, signal_kind: k, item: itemBy.get(kk) ?? null });
      }
    }
    if (pairs.length === 0) return { applied: 0, restore: [] as OverrideSnapshot[] };

    const prev = await tx<OverrideRow[]>`
      select athlete_id::text as athlete_id, signal_kind, snoozed_until, dismissed_at,
             resurface_on_new_signal, baseline_value_at_override, severity_at_override,
             dedupe_key, override_kind, coach_note
      from coach_alert_overrides
      where athlete_id = any(${ids}::bigint[])
    `;
    const prevBy = new Map(prev.map((p) => [key(p.athlete_id, p.signal_kind), p]));

    const restore: OverrideSnapshot[] = pairs.map(({ athlete_id, signal_kind }) => {
      const p = prevBy.get(key(athlete_id, signal_kind));
      return {
        athlete_id,
        signal_kind,
        previous: p
          ? {
              snoozed_until: p.snoozed_until ? p.snoozed_until.toISOString() : null,
              dismissed_at: p.dismissed_at ? p.dismissed_at.toISOString() : null,
              resurface_on_new_signal: p.resurface_on_new_signal,
              baseline_value_at_override: p.baseline_value_at_override,
              severity_at_override: p.severity_at_override,
              dedupe_key: p.dedupe_key,
              override_kind: p.override_kind,
              coach_note: p.coach_note,
            }
          : null,
      };
    });

    const kind = params.action === 'done' ? 'done' : 'snooze';
    const snoozedUntil = timed ? timed.toISOString() : null;
    const dismissedAt = timed ? null : now.toISOString();
    for (const { athlete_id, signal_kind, item } of pairs) {
      await tx`
        insert into coach_alert_overrides (
          coach_id, athlete_id, signal_kind,
          snoozed_until, dismissed_at, resurface_on_new_signal,
          baseline_value_at_override, severity_at_override, dedupe_key, override_kind,
          coach_note, created_at
        )
        values (
          ${coach_id}, ${Number(athlete_id)}, ${signal_kind},
          ${snoozedUntil}::timestamptz, ${dismissedAt}::timestamptz, true,
          ${item?.value_numeric ?? null}, ${item?.severity ?? null}, ${item?.dedupe_key ?? null},
          ${kind}, ${params.coach_note ?? null}, ${now.toISOString()}::timestamptz
        )
        on conflict (athlete_id, signal_kind) do update set
          snoozed_until = excluded.snoozed_until,
          dismissed_at = excluded.dismissed_at,
          resurface_on_new_signal = true,
          baseline_value_at_override = excluded.baseline_value_at_override,
          severity_at_override = excluded.severity_at_override,
          dedupe_key = excluded.dedupe_key,
          override_kind = excluded.override_kind,
          coach_note = coalesce(excluded.coach_note, coach_alert_overrides.coach_note)
      `;
    }
    return { applied: pairs.length, restore };
  });

  invalidateAttention(coach_id);
  return {
    applied: result.applied,
    until_at: timed ? timed.toISOString() : null,
    undo: { action: 'undo', restore: result.restore },
  };
}

/** Deshace: cada fila vuelve a lo que era (o desaparece si no existía). */
export async function restoreOverrides(params: {
  coach_id: bigint | number;
  restore: OverrideSnapshot[];
  client?: Sql;
}): Promise<{ restored: number }> {
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const ids = [...new Set(params.restore.map((r) => Number(r.athlete_id)))];
  if (ids.length === 0) return { restored: 0 };

  const restored = await client.begin(async (tx) => {
    await assertOwned(tx, coach_id, ids);
    for (const r of params.restore) {
      if (r.previous == null) {
        await tx`
          delete from coach_alert_overrides
          where coach_id = ${coach_id}
            and athlete_id = ${Number(r.athlete_id)}
            and signal_kind = ${r.signal_kind}
        `;
        continue;
      }
      const p = r.previous;
      await tx`
        insert into coach_alert_overrides (
          coach_id, athlete_id, signal_kind,
          snoozed_until, dismissed_at, resurface_on_new_signal,
          baseline_value_at_override, severity_at_override, dedupe_key, override_kind,
          coach_note, created_at
        )
        values (
          ${coach_id}, ${Number(r.athlete_id)}, ${r.signal_kind},
          ${p.snoozed_until}::timestamptz, ${p.dismissed_at}::timestamptz, ${p.resurface_on_new_signal},
          ${p.baseline_value_at_override}, ${p.severity_at_override}, ${p.dedupe_key},
          ${p.override_kind}, ${p.coach_note}, now()
        )
        on conflict (athlete_id, signal_kind) do update set
          snoozed_until = excluded.snoozed_until,
          dismissed_at = excluded.dismissed_at,
          resurface_on_new_signal = excluded.resurface_on_new_signal,
          baseline_value_at_override = excluded.baseline_value_at_override,
          severity_at_override = excluded.severity_at_override,
          dedupe_key = excluded.dedupe_key,
          override_kind = excluded.override_kind,
          coach_note = excluded.coach_note
      `;
    }
    return params.restore.length;
  });

  invalidateAttention(coach_id);
  return { restored };
}
