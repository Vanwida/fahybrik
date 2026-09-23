// Hoy — la lógica pura de la pantalla: vistas, recuentos, optimista, teclado,
// reabrir y los textos de fecha.

import { describe, expect, it } from 'vitest';
import type { AthleteSignal } from '@fahybrid/shared/domain/coach/athlete-state';
import type { HoyRow, HoyView, SystemicGroup } from '@/lib/dashboard/hoy/hoy-types';
import {
  actionHref,
  groupInVista,
  intakeQueueHref,
  sortIntakes,
  kindsLabel,
  navOrder,
  needsYouLabel,
  nextAfterRemoval,
  otherSignalsLabel,
  parseVista,
  prunePending,
  rangeIds,
  reopenPayload,
  rowInVista,
  snoozedTargets,
  step,
  toTheN,
  visibleInbox,
  vistaCounts,
  type PendingRow,
} from '@/components/v2/hoy/hoy-model';
import { longDateLabel, nextExpectedLine, untilLabel } from '@/components/v2/hoy/hoy-format';

function signal(over: Partial<AthleteSignal>): AthleteSignal {
  return {
    kind: 'readiness_low',
    severity: 'critical',
    label: 'Readiness 31',
    evidence: '−24 vs su base 55 · 3 días seguidos · hoy',
    value: 31,
    baseline: 55,
    window_label: '28 d',
    observed_at: '2026-09-23T06:00:00.000Z',
    action: 'proponer_descarga',
    lens: 'fisiologia',
    first_seen_at: '2026-09-23T08:00:00.000Z',
    dedupe_key: 'readiness_low:1',
    ...over,
  };
}

function row(id: string, primary: Partial<AthleteSignal> = {}, others: Partial<AthleteSignal>[] = []): HoyRow {
  const o = others.map((x) => signal(x));
  return {
    athlete_id: id,
    name: `Atleta ${id}`,
    avatar_url: null,
    level_label: 'N3',
    primary: signal(primary),
    other_count: o.length,
    age_label: '2 h',
    snoozable: true,
    others: o,
  };
}

function group(kind: SystemicGroup['kind'], count: number, week_start?: string): SystemicGroup {
  const athlete_ids = Array.from({ length: count }, (_, i) => `${kind}-${i}`);
  return { kind, count, title: `${count}`, detail: 'x', athlete_ids, week_start };
}

const msg = { kind: 'message_unanswered', severity: 'warning', lens: 'mensajes', action: 'responder' } as const;
const missed = { kind: 'missed_sessions', severity: 'warning', lens: 'sesiones', action: 'mensaje' } as const;

function view(over: Partial<HoyView> = {}): HoyView {
  const critico = over.critico ?? [row('1'), row('2', msg)];
  const vigilar = over.vigilar ?? [row('3', missed, [msg])];
  const systemic = over.systemic ?? [group('week_hidden', 47, '2026-09-21'), group('no_program', 20), group('intake_pending', 6)];
  return {
    generated_at: '2026-09-23T10:00:00.000Z',
    counts: {
      needs_you: systemic.length + critico.length + vigilar.length,
      awaiting_reply: 0,
      critico: critico.length,
      vigilar: vigilar.length,
      resolved_today: 2,
      snoozed: 1,
    },
    week_visibility: { visible: 26, total: 100 },
    systemic,
    critico,
    vigilar,
    snoozed_rows: [],
    replies: [],
    ...over,
  };
}

describe('vistas', () => {
  it('?vista= desconocida o ausente = todo', () => {
    expect(parseVista(undefined)).toBe('todo');
    expect(parseVista('nada')).toBe('todo');
    expect(parseVista(['altas', 'plan'])).toBe('altas');
    expect(parseVista('responder')).toBe('responder');
  });

  it('una fila entra en una vista por CUALQUIERA de sus señales', () => {
    const r = row('3', missed, [msg]);
    expect(rowInVista(r, 'sesiones')).toBe(true);
    expect(rowInVista(r, 'responder')).toBe(true);
    expect(rowInVista(r, 'fisiologia')).toBe(false);
    expect(rowInVista(r, 'todo')).toBe(true);
  });

  it('grupos: Plan = semana oculta y sin programa; Altas = altas; el resto, solo en Todo', () => {
    expect(groupInVista(group('week_hidden', 1), 'plan')).toBe(true);
    expect(groupInVista(group('no_program', 1), 'plan')).toBe(true);
    expect(groupInVista(group('intake_pending', 1), 'altas')).toBe(true);
    expect(groupInVista(group('payments_overdue', 1), 'plan')).toBe(false);
    expect(groupInVista(group('payments_overdue', 1), 'todo')).toBe(true);
    expect(groupInVista(group('week_hidden', 1), 'responder')).toBe(false);
  });

  it('recuentos de chip en ATLETAS (la unidad de la cabecera): un grupo de 47 son 47', () => {
    const c = vistaCounts(visibleInbox(view(), new Map(), new Set()));
    expect(c).toEqual({ todo: 76, responder: 2, sesiones: 1, fisiologia: 1, plan: 67, altas: 6 });
  });

  it('un atleta en un grupo y con fila cuenta una vez', () => {
    const g = { ...group('week_hidden', 1, '2026-09-21'), athlete_ids: ['1'] };
    const inbox = visibleInbox(view({ systemic: [g] }), new Map(), new Set());
    expect(inbox.needs_you).toBe(3);
  });

  it('«Por responder» suma las esperas sin fila (el conjunto de Mensajes)', () => {
    const inbox = visibleInbox(
      view({ replies: [row('7', { ...msg, severity: 'info' })] }),
      new Map(),
      new Set(),
    );
    expect(vistaCounts(inbox).responder).toBe(3);
    // Una espera sin fila no «te necesita» todavía.
    expect(inbox.needs_you).toBe(76);
  });
});

describe('optimista', () => {
  const pend = (id: string, kind: 'done' | 'snooze', settled_at: number | null = null): [string, PendingRow] => [
    id,
    { kind, row: row(id), until: null, settled_at },
  ];

  it('lo tocado se va de la bandeja, la cabecera baja y el pie sube sin contar dos veces', () => {
    const v = view();
    const pending = new Map([pend('1', 'done'), pend('3', 'snooze'), pend('99', 'done')]);
    const inbox = visibleInbox(v, pending, new Set(['week_hidden:2026-09-21']));
    expect(inbox.critico.map((r) => r.athlete_id)).toEqual(['2']);
    expect(inbox.vigilar).toEqual([]);
    expect(inbox.systemic.map((g) => g.kind)).toEqual(['no_program', 'intake_pending']);
    expect(inbox.needs_you).toBe(27);
    // '99' ya no está en el servidor: el servidor ya lo cuenta.
    expect(inbox.resolved_today).toBe(3);
    expect(inbox.snoozed).toBe(2);
  });

  it('tras un refresco se olvida lo confirmado antes de generarse la vista; lo en vuelo se queda', () => {
    const gen = Date.parse('2026-09-23T10:00:00.000Z');
    const pending = new Map([pend('a', 'done', gen - 1000), pend('b', 'done', gen + 1000), pend('c', 'snooze', null)]);
    expect([...prunePending(pending, gen, gen + 2000).keys()]).toEqual(['b', 'c']);
    // Más de un minuto confirmado: fuera aunque el reloj del servidor vaya atrasado.
    expect([...prunePending(pending, gen, gen + 120_000).keys()]).toEqual(['c']);
  });
});

describe('teclado', () => {
  const crit = [row('1'), row('2')];
  const vig = Array.from({ length: 12 }, (_, i) => row(`v${i}`, missed));

  it('J/K recorre crítico y luego vigilar; lo plegado no, salvo desplegado', () => {
    const folded = navOrder(crit, vig, false);
    expect(folded).toHaveLength(12);
    expect(navOrder(crit, vig, true)).toHaveLength(14);
    expect(step(folded, null, 1)).toBe('1');
    expect(step(folded, '1', 1)).toBe('2');
    expect(step(folded, '1', -1)).toBe('1');
    expect(step(folded, 'v9', 1)).toBe('v9');
    expect(step([], null, 1)).toBeNull();
  });

  it('Shift: rango en cualquier dirección', () => {
    const order = ['a', 'b', 'c', 'd'];
    expect(rangeIds(order, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(rangeIds(order, 'd', 'b')).toEqual(['b', 'c', 'd']);
    expect(rangeIds(order, 'zz', 'c')).toEqual(['c']);
  });

  it('tras resolver, el foco pasa a la siguiente que queda (o a la anterior)', () => {
    const order = ['a', 'b', 'c'];
    expect(nextAfterRemoval(order, new Set(['b']), 'b')).toBe('c');
    expect(nextAfterRemoval(order, new Set(['b', 'c']), 'b')).toBe('a');
    expect(nextAfterRemoval(order, new Set(['a', 'b', 'c']), 'a')).toBeNull();
    expect(nextAfterRemoval(order, new Set(['c']), 'a')).toBe('a');
  });
});

describe('reabrir y textos', () => {
  it('reabrir quita el override de cada señal, sin duplicados', () => {
    const r = row('7', {}, [missed, missed]);
    const payload = reopenPayload(snoozedTargets(r));
    expect(payload.action).toBe('undo');
    expect(payload.restore).toEqual([
      { athlete_id: '7', signal_kind: 'readiness_low', previous: null },
      { athlete_id: '7', signal_kind: 'missed_sessions', previous: null },
    ]);
  });

  it('concordancia y etiquetas', () => {
    expect(needsYouLabel(0)).toBe('Nadie te necesita ahora');
    expect(needsYouLabel(1)).toBe('1 te necesita');
    expect(needsYouLabel(14)).toBe('14 te necesitan');
    expect(toTheN('Publicar', 47)).toBe('Publicar a los 47');
    expect(toTheN('Publicar', 1)).toBe('Publicar a 1');
    expect(otherSignalsLabel(0)).toBeNull();
    expect(otherSignalsLabel(1)).toBe('+1 señal');
    expect(otherSignalsLabel(3)).toBe('+3 señales');
    expect(kindsLabel(['readiness_low', 'rpe_high', 'readiness_low'])).toBe('Readiness baja · RPE alto');
  });

  it('fechas: la de hoy en la caja y lo siguiente que llega', () => {
    expect(longDateLabel(new Date('2026-09-23T10:00:00Z'))).toBe('miércoles 23 sept');
    // 23:30 UTC del martes ya es miércoles en Madrid.
    expect(longDateLabel(new Date('2026-09-22T23:30:00Z'))).toBe('miércoles 23 sept');
    expect(untilLabel(null)).toBe('hasta nueva señal');
    expect(untilLabel('2026-09-25T22:00:00.000Z')).toBe('hasta el vie 25 sept');
    expect(nextExpectedLine({ today: '2026-09-23', auto_publish_days: 2, snoozed_until: [] })).toBe(
      'La semana del lun 28 sept se publica sola el sáb 26 sept.',
    );
    expect(nextExpectedLine({ today: '2026-09-27', auto_publish_days: 2, snoozed_until: [null] })).toBe(
      'La semana del lun 28 sept ya se está publicando sola.',
    );
    expect(
      nextExpectedLine({ today: '2026-09-23', auto_publish_days: 2, snoozed_until: ['2026-09-25T22:00:00Z', '2026-09-25T22:00:00Z', null] }),
    ).toBe('2 pospuestos vuelven el vie 25 sept.');
  });

  it('altas en fila: la más antigua primero, el resto en ?fila=', () => {
    const people = [
      { athlete_id: '5', name: 'B', avatar_url: null, level_label: null, onboarded_at: '2026-09-22T10:00:00Z' },
      { athlete_id: '4', name: 'A', avatar_url: null, level_label: null, onboarded_at: '2026-09-20T10:00:00Z' },
    ];
    const sorted = sortIntakes(people).map((p) => p.athlete_id);
    expect(sorted).toEqual(['4', '5']);
    expect(intakeQueueHref(sorted)).toBe('/atletas/4/intake?fila=5');
    expect(intakeQueueHref(['4'])).toBe('/atletas/4/intake');
    expect(intakeQueueHref([])).toBeNull();
  });

  it('acciones que son navegación', () => {
    expect(actionHref('revisar_alta', '9', false)).toBe('/atletas/9/intake');
    expect(actionHref('recordar_pago', '9', true)).toBe('/negocio/cobros');
    expect(actionHref('recordar_pago', '9', false)).toBe('/atletas/9');
    expect(actionHref('responder', '9', true)).toBeNull();
  });
});
