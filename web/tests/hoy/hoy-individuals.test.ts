import { describe, expect, it } from 'vitest';
import { SIGNAL_ACTION, SIGNAL_LENS, type AthleteSignal } from '@fahybrid/shared/domain/coach/athlete-state';
import { composeHoy, type HoyComposeInput } from '@/lib/dashboard/hoy/hoy-compose';
import type { AthletePlanFacts } from '@/lib/dashboard/athletes/plan-facts';
import type { AthleteSignalsRead } from '@/lib/coach/attention/signals-read';
import { causeRow } from '@/components/v2/hoy/hoy-individuals';
import { overrideTargets, pendingKey, rowForVista, visibleInbox, vistaCounts, type PendingRow } from '@/components/v2/hoy/hoy-model';

const now = new Date('2026-10-02T10:00:00Z');
const calendar = { today: '2026-10-02', week_start: '2026-09-28', week_end: '2026-10-04', next_week_start: '2026-10-05' };
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
const reply = (days: number) => ({ count: 1, since: ago(days), last_at: ago(days), unread: 0 });
function facts(id: string, patch: Partial<AthletePlanFacts> = {}): AthletePlanFacts {
  return { athlete_id: id, name: `Atleta ${id}`, avatar_url: null, email: null, timezone: 'Europe/Madrid',
    level: null, lifecycle: 'activo', pause_reason: null, intake_pending: false, not_onboarded: false,
    onboarded_at: ago(90).toISOString(), plan: 'con_programa', last_program_end: null, current_program: null,
    next_program_start: null, week_chip: { kind: 'visible', label: 'Visible' }, week_held: false,
    next_week_hidden: false, next_week_held: false, next_week_sessions: 0, next_week_due: false,
    programming: { athlete_id: id, status: 'ok', label: 'Plan OK', detail: null, cta: null, cta_label: null }, ...patch };
}
function signal(kind: AthleteSignal['kind'], patch: Partial<AthleteSignal> = {}): AthleteSignal {
  return { kind, severity: 'warning', label: kind === 'review_1on1_due' ? 'Revisión 1:1 pendiente' : kind,
    evidence: 'evidencia completa', value: null, baseline: null, window_label: null, observed_at: null,
    action: SIGNAL_ACTION[kind], lens: SIGNAL_LENS[kind], first_seen_at: ago(85).toISOString(),
    dedupe_key: `${kind}:episodio`, ...patch };
}
const live = (...signals: AthleteSignal[]): AthleteSignalsRead => ({ live: signals, silenced: [], snoozed_until: null });
function compose(patch: Partial<HoyComposeInput> = {}) {
  return composeHoy({ now, calendar, facts: [facts('1')], signals: new Map(), resolved_today: 0, negocio: null, ...patch });
}
const visible = (view: ReturnType<typeof compose>, pending = new Map<string, PendingRow>()) => visibleInbox(view, pending, new Set(), now);
const rowsOf = (inbox: ReturnType<typeof visible>) => [...inbox.critico, ...inbox.vigilar];
const review = signal('review_1on1_due');
const twoTasks = () => compose({ signals: new Map([['1', live(review)]]), awaiting: new Map([['1', reply(41)]]) });

describe('Hoy — una persona, todas sus causas; grupos solo para varios', () => {
  it('una respuesta única tiene nombre y acción propia, fuera de Afecta a varios', () => {
    const inbox = visible(compose({ awaiting: new Map([['1', reply(41)]]) }));
    expect(inbox.systemic).toEqual([]);
    expect(rowsOf(inbox)).toHaveLength(1);
    expect(rowsOf(inbox)[0]).toMatchObject({ athlete_id: '1', name: 'Atleta 1', primary: {
      kind: 'message_unanswered', action: 'responder', evidence: 'espera 41 d · 1 mensaje' } });
    expect(vistaCounts(inbox)).toMatchObject({ todo: 1, responder: 1 });
  });

  it('la espera de 41d y la revisión de 85d son dos causas con dos acciones en una fila', () => {
    const inbox = visible(twoTasks());
    expect(inbox.systemic).toEqual([]);
    const rows = rowsOf(inbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.causes?.map((c) => [c.signal.kind, c.signal.action])).toEqual([
      ['review_1on1_due', 'abrir_ficha'], ['message_unanswered', 'responder'],
    ]);
    expect(rows[0]!.age_label).toBe('85 d');
    expect(rows[0]!.causes?.[1]!.signal.evidence).toContain('41 d');
    expect(inbox.needs_you).toBe(1);
  });

  it('dos respuestas mantienen el grupo, el orden de espera y la acción colectiva', () => {
    const inbox = visible(compose({ facts: [facts('1'), facts('2')], awaiting: new Map([['1', reply(2)], ['2', reply(41)]]) }));
    expect(inbox.systemic).toHaveLength(1);
    expect(inbox.systemic[0]).toMatchObject({ kind: 'awaiting_reply', count: 2, athlete_ids: ['2', '1'] });
    expect(rowsOf(inbox)).toEqual([]);
    expect(inbox.replies.map((r) => r.athlete_id)).toEqual(['2', '1']);
    expect(vistaCounts(inbox)).toMatchObject({ todo: 2, responder: 2 });
  });

  it('dos respuestas y una revisión conservan grupo+revisión, sin repetir el mensaje en Todo', () => {
    const inbox = visible(compose({ facts: [facts('1'), facts('2')], signals: new Map([['1', live(review)]]),
      awaiting: new Map([['1', reply(41)], ['2', reply(2)]]) }));
    expect(inbox.systemic[0]!.count).toBe(2);
    expect(rowsOf(inbox)).toHaveLength(1);
    expect(rowsOf(inbox)[0]!.primary.kind).toBe('review_1on1_due');
    expect(rowsOf(inbox)[0]!.others).toEqual([]);
    const focused = rowForVista(inbox.replies[0]!, 'responder', now)!;
    expect(focused.primary.kind).toBe('message_unanswered');
    expect(focused.priority_signal?.kind).toBe('review_1on1_due');
    expect(vistaCounts(inbox).responder).toBe(2);
  });

  it('el mensaje del motor y el hilo son la misma causa, la revisión no lo es', () => {
    const inbox = visible(compose({ awaiting: new Map([['1', reply(41)]]), signals: new Map([['1', live(
      review, signal('message_unanswered', { label: 'Por responder', first_seen_at: ago(41).toISOString() }),
    )]]) }));
    const row = rowsOf(inbox)[0]!;
    expect(row.causes?.map((c) => c.signal.kind)).toEqual(['message_unanswered', 'review_1on1_due']);
    expect(vistaCounts(inbox).responder).toBe(1);
  });

  it('dedupe solo instancias idénticas, conserva dos revisiones distintas', () => {
    const otherReview = { ...review, dedupe_key: 'review_1on1_due:otro' };
    const inbox = visible(compose({ awaiting: new Map([['1', reply(41)]]), signals: new Map([['1', live(review, review, otherReview)]]) }));
    expect(rowsOf(inbox)[0]!.causes?.filter((c) => c.signal.kind === 'review_1on1_due')).toHaveLength(2);
  });

  it.each(['done', 'snooze'] as const)('%s sobre la respuesta mantiene la revisión y el contador de Plan', (kind) => {
    const view = twoTasks();
    const inbox = visible(view);
    const focused = rowForVista(inbox.replies[0]!, 'responder', now)!;
    const target = causeRow(focused, focused.primary);
    expect(overrideTargets([target])).toEqual([{ athlete_id: '1', signal_kind: 'message_unanswered' }]);
    const after = visible(view, new Map([[pendingKey(target), { kind, row: target, until: null, settled_at: null }]]));
    expect(rowsOf(after)[0]!.primary.kind).toBe('review_1on1_due');
    expect(rowsOf(after)[0]!.others).toEqual([]);
    expect(after.needs_you).toBe(1);
    expect(vistaCounts(after)).toMatchObject({ responder: 0, plan: 1 });
  });

  it('cerrar la revisión conserva la respuesta sin duplicarla', () => {
    const view = twoTasks();
    const row = rowsOf(visible(view))[0]!;
    const target = causeRow(row, review);
    expect(overrideTargets([target])).toEqual([{ athlete_id: '1', signal_kind: 'review_1on1_due' }]);
    const after = visible(view, new Map([[pendingKey(target), { kind: 'done', row: target, until: null, settled_at: null }]]));
    expect(rowsOf(after)).toHaveLength(1);
    expect(rowsOf(after)[0]!.primary.kind).toBe('message_unanswered');
    expect(vistaCounts(after)).toMatchObject({ todo: 1, responder: 1, plan: 0 });
  });

  it('cuando un grupo queda con uno tras posponer, se convierte en una fila personal', () => {
    const view = compose({ facts: [facts('1'), facts('2')], awaiting: new Map([['1', reply(41)], ['2', reply(2)]]) });
    const target = view.replies[0]!;
    const after = visible(view, new Map([[pendingKey(target), { kind: 'snooze', row: target, until: null, settled_at: null }]]));
    expect(after.systemic).toEqual([]);
    expect(rowsOf(after)).toHaveLength(1);
    expect(rowsOf(after)[0]!.athlete_id).toBe('2');
    expect(rowsOf(after)[0]!.primary.evidence).toContain('2 d');
    expect(vistaCounts(after)).toMatchObject({ todo: 1, responder: 1 });
  });

  it('los filtros enfocan causa+acción y conservan la evidencia de la otra prioridad', () => {
    const row = rowsOf(visible(twoTasks()))[0]!;
    const messages = rowForVista(row, 'responder', now)!;
    expect(messages.causes?.map((c) => c.signal.kind)).toEqual(['message_unanswered']);
    expect(messages.age_label).toBe('41 d');
    expect(messages.priority_signal).toBe(review);
    const plan = rowForVista(row, 'plan', now)!;
    expect(plan.causes?.map((c) => c.signal.kind)).toEqual(['review_1on1_due']);
    expect(plan.primary.action).toBe('abrir_ficha');
    expect(rowForVista(row, 'sesiones', now)).toBeNull();
  });

  it('una semana oculta individual conserva el lunes exacto y la publicación con confirmación', () => {
    const inbox = visible(compose({ facts: [facts('1', { next_week_hidden: true, next_week_due: true, next_week_sessions: 4 })] }));
    expect(inbox.systemic).toEqual([]);
    const row = rowsOf(inbox)[0]!;
    expect(row.snoozable).toBe(false);
    expect(row.causes?.[0]).toMatchObject({ signal: { action: 'publicar_semana' },
      group: { kind: 'week_hidden', week_start: '2026-10-05', athlete_ids: ['1'] } });
    expect(vistaCounts(inbox).plan).toBe(1);
  });

  it('alta y revisión individuales conservan ambas tareas, el filtro de Altas y su enlace', () => {
    const inbox = visible(compose({ facts: [facts('1', { intake_pending: true })], signals: new Map([['1', live(review)]]) }));
    expect(inbox.systemic).toEqual([]);
    expect(rowsOf(inbox)).toHaveLength(1);
    expect(rowsOf(inbox)[0]!.causes?.map((c) => c.signal.kind)).toEqual(['intake_pending', 'review_1on1_due']);
    expect(rowsOf(inbox)[0]!.causes?.[0]!.group?.athlete_ids).toEqual(['1']);
    expect(vistaCounts(inbox)).toMatchObject({ altas: 1, plan: 1, todo: 1 });
  });

  it('un pago vencido individual pasa a Acción sin conservar +1 en el grupo', () => {
    const inbox = visible(compose({ signals: new Map([['1', live(signal('billing_at_risk', { severity: 'critical' }))]]) }));
    expect(inbox.systemic).toEqual([]);
    expect(inbox.critico).toHaveLength(1);
    expect(inbox.accion_in_groups).toBe(0);
    expect(inbox.critico[0]!.causes?.[0]!.group?.kind).toBe('payments_overdue');
  });

  it('sin programa único conserva asignar; con dos mantiene la acción colectiva', () => {
    const withoutPlan = (id: string) => facts(id, { plan: 'sin_programa' });
    const one = visible(compose({ facts: [withoutPlan('1')] }));
    expect(one.systemic).toEqual([]);
    expect(rowsOf(one)[0]!.causes?.[0]).toMatchObject({ signal: { action: 'asignar_programa' }, group: { kind: 'no_program' } });
    expect(vistaCounts(one).plan).toBe(1);
    const two = visible(compose({ facts: [withoutPlan('1'), withoutPlan('2')] }));
    expect(two.systemic[0]).toMatchObject({ kind: 'no_program', count: 2 });
    expect(rowsOf(two)).toEqual([]);
  });

  it('una espera en pausa sigue visible; las señales ajenas al conjunto del coach no se incorporan', () => {
    const inbox = visible(compose({ facts: [facts('1', { lifecycle: 'pausado' })],
      signals: new Map([['ajeno', live(review)]]), awaiting: new Map([['1', reply(41)], ['ajeno', reply(85)]]) }));
    expect(rowsOf(inbox).map((r) => r.athlete_id)).toEqual(['1']);
    expect(inbox.replies.map((r) => r.athlete_id)).toEqual(['1']);
    expect(inbox.needs_you).toBe(1);
  });

  it('una revisión pospuesta no se reconstruye al individualizar la respuesta', () => {
    const view = compose({ awaiting: new Map([['1', reply(41)]]), signals: new Map([['1', {
      live: [], silenced: [{ signal: review, by: 'snooze', until: ago(-1).toISOString() }], snoozed_until: ago(-1).toISOString(),
    }]]) });
    const inbox = visible(view);
    expect(rowsOf(inbox)[0]!.causes?.map((c) => c.signal.kind)).toEqual(['message_unanswered']);
    expect(view.snoozed_rows[0]!.primary.kind).toBe('review_1on1_due');
    expect(inbox.snoozed).toBe(1);
  });

  it('sin programa+mensaje permite posponer la respuesta al cambiar de filtro', () => {
    const view = compose({ facts: [facts('1', { plan: 'sin_programa' })], awaiting: new Map([['1', reply(41)]]) });
    const row = rowsOf(visible(view))[0]!;
    expect(row.primary.kind).toBe('programming_status');
    expect(row.snoozable).toBe(false);
    const focused = rowForVista(row, 'responder', now)!;
    expect(focused.snoozable).toBe(true);
    expect(focused.causes?.map((c) => c.signal.kind)).toEqual(['message_unanswered']);
    const after = visible(view, new Map([[pendingKey(focused), { kind: 'snooze', row: focused, until: null, settled_at: null }]]));
    expect(rowsOf(after)[0]!.causes?.map((c) => c.signal.kind)).toEqual(['programming_status']);
    expect(vistaCounts(after)).toMatchObject({ responder: 0, plan: 1 });
  });

  it('una fila ya compuesta conserva metadatos y cambia el scope al cerrar su causa', () => {
    const source = twoTasks();
    const first = visible(source);
    const message = rowForVista(rowsOf(first)[0]!, 'responder', now)!;
    const composite = { ...source, vigilar: first.vigilar, critico: first.critico };
    const after = visible(composite, new Map([[pendingKey(message), { kind: 'done', row: message, until: null, settled_at: null }]]));
    const remaining = rowsOf(after)[0]!;
    expect(remaining.causes?.map((c) => c.signal.kind)).toEqual(['review_1on1_due']);
    expect(remaining.scope_kind).toBe('review_1on1_due');
    expect(remaining.primary.kind).toBe('review_1on1_due');
    expect(remaining.priority_signal).toBeUndefined();
    expect(remaining.snoozable).toBe(true);
  });

  it('la espera más antigua se actualiza cuando quedan al menos dos afectados', () => {
    const view = compose({ facts: [facts('1'), facts('2'), facts('3')],
      awaiting: new Map([['1', reply(41)], ['2', reply(2)], ['3', reply(1)]]) });
    const oldest = view.replies[0]!;
    const after = visible(view, new Map([[pendingKey(oldest), { kind: 'done', row: oldest, until: null, settled_at: null }]]));
    expect(after.systemic[0]).toMatchObject({ count: 2, athlete_ids: ['2', '3'], detail: 'la más antigua espera 2 d' });
  });

  it('el alta crítica conserva el estado Nuevo al convertirse en individual', () => {
    const view = compose({ facts: [facts('1', { intake_pending: true })],
      signals: new Map([['1', live(signal('intake_pending', { severity: 'critical' }))]]) });
    const inbox = visible(view);
    expect(inbox.critico).toEqual([]);
    expect(inbox.vigilar[0]!.status_key).toBe('nuevo');
    expect(inbox.accion_in_groups).toBe(0);
    expect(vistaCounts(inbox).altas).toBe(1);
  });
});
