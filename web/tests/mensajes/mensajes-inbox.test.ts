// La lógica pura de la bandeja de Mensajes: estado de un hilo, filtros, orden,
// color de la espera y lo que un mensaje en vivo le hace a su fila.

import { describe, expect, it } from 'vitest';
import {
  WAIT_DANGER_MULTIPLE,
  applyIncoming,
  filterCounts,
  filterThreads,
  threadState,
  waitTone,
} from '@/lib/dashboard/v2/mensajes-inbox';
import type { MensajesThread } from '@/lib/dashboard/v2/mensajes-types';

const NOW = new Date('2026-09-23T12:00:00Z');
const h = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

function thread(p: Partial<MensajesThread> & { athlete_id: string }): MensajesThread {
  return {
    thread_id: `t${p.athlete_id}`,
    athlete_name: `Atleta ${p.athlete_id}`,
    avatar_url: null,
    level_label: null,
    last_message: { preview: 'hola', at: h(1).toISOString(), from: 'athlete' },
    unread: 0,
    waiting: null,
    state: 'al_dia',
    snoozed_until: null,
    match: null,
    ...p,
  };
}

describe('threadState', () => {
  const waiting = { last_at: h(2) };

  it('sin espera: al día, aunque haya un «hecho» antiguo', () => {
    expect(threadState(null, { snoozed_until: null, dismissed_at: h(5), override_kind: 'done' }, NOW).state).toBe('al_dia');
  });

  it('el atleta escribió lo último y nadie hizo nada: por responder', () => {
    expect(threadState(waiting, null, NOW)).toEqual({ state: 'por_responder', snoozed_until: null });
  });

  it('marcado hecho DESPUÉS de su último mensaje: hecho', () => {
    expect(threadState(waiting, { snoozed_until: null, dismissed_at: h(1), override_kind: 'done' }, NOW).state).toBe('hecho');
  });

  it('vuelve a escribir tras el «hecho»: otra espera, por responder', () => {
    expect(threadState({ last_at: h(0.5) }, { snoozed_until: null, dismissed_at: h(1), override_kind: 'done' }, NOW).state).toBe(
      'por_responder',
    );
  });

  it('pospuesto hasta nueva señal: pospuesto sin fecha, hasta que vuelva a escribir', () => {
    expect(threadState(waiting, { snoozed_until: null, dismissed_at: h(1), override_kind: 'snooze' }, NOW)).toEqual({
      state: 'pospuesto',
      snoozed_until: null,
    });
    expect(threadState({ last_at: h(0.2) }, { snoozed_until: null, dismissed_at: h(1), override_kind: 'snooze' }, NOW).state).toBe(
      'por_responder',
    );
  });

  it('pospuesto con fecha: manda la fecha; vencida, vuelve', () => {
    const future = new Date(NOW.getTime() + 3_600_000);
    expect(threadState(waiting, { snoozed_until: future, dismissed_at: null, override_kind: 'snooze' }, NOW)).toEqual({
      state: 'pospuesto',
      snoozed_until: future.toISOString(),
    });
    expect(threadState(waiting, { snoozed_until: h(1), dismissed_at: null, override_kind: 'snooze' }, NOW).state).toBe('por_responder');
  });
});

describe('filtros y orden', () => {
  const threads = [
    thread({ athlete_id: '1', state: 'por_responder', waiting: { since: h(3).toISOString(), last_at: h(3).toISOString(), count: 1 } }),
    thread({ athlete_id: '2', state: 'por_responder', waiting: { since: h(30).toISOString(), last_at: h(2).toISOString(), count: 3 }, unread: 2 }),
    thread({ athlete_id: '3', state: 'hecho', waiting: { since: h(5).toISOString(), last_at: h(5).toISOString(), count: 1 } }),
    thread({ athlete_id: '4', state: 'al_dia', last_message: { preview: 'ok', at: h(0.1).toISOString(), from: 'coach' } }),
    thread({ athlete_id: '5', state: 'al_dia', last_message: null }),
  ];

  it('«Por responder»: la espera más larga primero', () => {
    expect(filterThreads(threads, 'por_responder').map((t) => t.athlete_id)).toEqual(['2', '1']);
  });

  it('«Todas»: lo más reciente primero y sin hilos vacíos', () => {
    expect(filterThreads(threads, 'todas').map((t) => t.athlete_id)).toEqual(['4', '1', '2', '3']);
  });

  it('«Sin leer» y «Hechas»', () => {
    expect(filterThreads(threads, 'sin_leer').map((t) => t.athlete_id)).toEqual(['2']);
    expect(filterThreads(threads, 'hechas').map((t) => t.athlete_id)).toEqual(['3']);
  });

  it('los recuentos cuadran con las listas', () => {
    expect(filterCounts(threads)).toEqual({ por_responder: 2, todas: 4, sin_leer: 1, hechas: 1 });
  });
});

describe('waitTone', () => {
  it('gris antes del umbral, ámbar desde el umbral, rojo desde el doble', () => {
    expect(waitTone(h(11).toISOString(), NOW, 12)).toBe('neutral');
    expect(waitTone(h(12).toISOString(), NOW, 12)).toBe('warn');
    expect(waitTone(h(12 * WAIT_DANGER_MULTIPLE).toISOString(), NOW, 12)).toBe('danger');
  });

  it('el umbral es del coach: con 4 h, 5 h ya es ámbar', () => {
    expect(waitTone(h(5).toISOString(), NOW, 4)).toBe('warn');
  });
});

describe('applyIncoming', () => {
  it('mensaje del atleta: abre (o alarga) la espera y suma sin leer si el hilo no está abierto', () => {
    const t = thread({ athlete_id: '1' });
    const next = applyIncoming(t, { thread_id: 't1', from: 'athlete', preview: '¿y mañana?', at: NOW.toISOString() }, { open: false, now: NOW });
    expect(next.state).toBe('por_responder');
    expect(next.unread).toBe(1);
    expect(next.waiting).toEqual({ since: NOW.toISOString(), last_at: NOW.toISOString(), count: 1 });
  });

  it('con el hilo abierto no suma sin leer', () => {
    const t = thread({ athlete_id: '1' });
    expect(applyIncoming(t, { thread_id: 't1', from: 'athlete', preview: 'x', at: NOW.toISOString() }, { open: true, now: NOW }).unread).toBe(0);
  });

  it('respuesta del coach: al día, fuera la espera', () => {
    const t = thread({ athlete_id: '1', state: 'hecho', waiting: { since: h(2).toISOString(), last_at: h(2).toISOString(), count: 1 } });
    const next = applyIncoming(t, { thread_id: 't1', from: 'coach', preview: 'claro', at: NOW.toISOString() }, { open: true, now: NOW });
    expect(next.state).toBe('al_dia');
    expect(next.waiting).toBeNull();
  });

  it('un «hecho» se rompe si vuelve a escribir; un posponer con fecha no', () => {
    const done = thread({ athlete_id: '1', state: 'hecho', waiting: { since: h(2).toISOString(), last_at: h(2).toISOString(), count: 1 } });
    expect(applyIncoming(done, { thread_id: 't1', from: 'athlete', preview: 'x', at: NOW.toISOString() }, { open: false, now: NOW }).state).toBe(
      'por_responder',
    );
    const until = new Date(NOW.getTime() + 86_400_000).toISOString();
    const snoozed = thread({ athlete_id: '1', state: 'pospuesto', snoozed_until: until, waiting: { since: h(2).toISOString(), last_at: h(2).toISOString(), count: 1 } });
    const next = applyIncoming(snoozed, { thread_id: 't1', from: 'athlete', preview: 'x', at: NOW.toISOString() }, { open: false, now: NOW });
    expect(next.state).toBe('pospuesto');
    expect(next.waiting?.count).toBe(2);
  });
});
