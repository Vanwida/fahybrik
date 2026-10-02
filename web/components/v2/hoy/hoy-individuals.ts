import { ageLabel, compareSignals, type AthleteSignal } from '@fahybrid/shared/domain/coach/athlete-state';
import type { HoyCause, HoyRow, SystemicGroup } from '@/lib/dashboard/hoy/hoy-types';

function signalKey(signal: AthleteSignal): string {
  return `${signal.kind}:${signal.dedupe_key}`;
}

/** Una causa se cierra por su tipo, nunca por las otras tareas del atleta. */
export function causeRow(row: HoyRow, signal: AthleteSignal): HoyRow {
  return { ...row, primary: signal, scope_kind: signal.kind, others: [], other_count: 0,
    causes: undefined, priority_signal: undefined, snoozable: true };
}

function mergeRow(base: HoyRow, added: HoyCause[], now: Date): HoyRow {
  const unique = new Map<string, HoyCause>();
  for (const cause of base.causes ?? [base.primary, ...base.others].map((signal) => ({ signal }))) {
    unique.set(signalKey(cause.signal), cause);
  }
  for (const cause of added) unique.set(signalKey(cause.signal), cause);
  const causes = [...unique.values()].sort((a, b) => compareSignals(a.signal, b.signal));
  const primary = causes[0]!.signal;
  return { ...base, primary, others: causes.slice(1).map((c) => c.signal), other_count: causes.length - 1,
    age_label: ageLabel(primary.first_seen_at ?? now.toISOString(), now), causes,
    scope_kind: primary.kind, snoozable: !causes[0]!.group };
}

/** Reúne solo las causas individuales; las colectivas conservan su mecanismo. */
export function individualizeGroups(
  groups: SystemicGroup[], critico: HoyRow[], vigilar: HoyRow[], replies: HoyRow[], now: Date,
): { systemic: SystemicGroup[]; critico: HoyRow[]; vigilar: HoyRow[] } {
  const action = new Map(critico.map((r) => [r.athlete_id, r]));
  const watch = new Map(vigilar.map((r) => [r.athlete_id, r]));
  const systemic: SystemicGroup[] = [];
  for (const group of groups) {
    const id = group.athlete_ids[0];
    const source = group.rows?.find((r) => r.athlete_id === id)
      ?? (group.kind === 'awaiting_reply' ? replies.find((r) => r.athlete_id === id) : undefined);
    // Si una respuesta antigua aún no trae la identidad, conservamos su tarea.
    if (group.count !== 1 || group.athlete_ids.length !== 1 || !source) { systemic.push(group); continue; }
    const causeGroup = { ...group, rows: undefined };
    const cause: HoyCause = { signal: source.primary,
      ...(group.kind === 'awaiting_reply' ? {} : { group: causeGroup }) };
    const base = action.get(id!) ?? watch.get(id!) ?? source;
    const merged = mergeRow(base, [cause], now);
    const target = action.has(id!) || source.status_key === 'accion'
      || (source.status_key === undefined && merged.primary.severity === 'critical') ? action : watch;
    target.set(id!, merged);
    if (target === action) watch.delete(id!);
  }
  const worst = (a: HoyRow, b: HoyRow) => compareSignals(a.primary, b.primary) || a.name.localeCompare(b.name, 'es');
  return { systemic, critico: [...action.values()].sort(worst), vigilar: [...watch.values()].sort(worst) };
}

/** El filtro Por responder enseña cada hilo una vez y conserva su otra prioridad. */
export function repliesWithContext(replies: HoyRow[], rows: HoyRow[], now: Date): HoyRow[] {
  const byId = new Map(rows.map((r) => [r.athlete_id, r]));
  return replies.map((reply) => {
    const base = byId.get(reply.athlete_id);
    return base ? mergeRow(base, [{ signal: reply.primary }], now) : reply;
  });
}
