import { describe, expect, it } from 'vitest';
import { COMMUNICATION_KINDS } from '@fahybrid/shared/domain/coach-communications';
import { countPendingCommunications } from '@/lib/dashboard/v2/ficha-communications';

type Recipient = Parameters<typeof countPendingCommunications>[0][number];
const stamp = '2026-10-03T08:00:00Z';
const recipient = (changes: Partial<Recipient> = {}): Recipient => ({
  kind: 'note', status: 'published', seen_at: null, done_at: null, answered_at: null, ...changes,
});

describe('pendientes de comunicados de la ficha', () => {
  it('las tres notas vistas del caso de QA no generan una tarea pendiente', () => {
    const notes = Array.from({ length: 3 }, () => recipient({ seen_at: stamp }));
    expect(countPendingCommunications(notes)).toBe(0);
    expect(notes).toHaveLength(3);
    expect(notes.every((note) => note.seen_at === stamp)).toBe(true);
  });

  it.each(COMMUNICATION_KINDS)('%s sin abrir reclama atención', (kind) => {
    expect(countPendingCommunications([recipient({ kind })])).toBe(1);
  });

  it.each(['note', 'protocol', 'focus'] as const)('%s visto deja de reclamar', (kind) => {
    expect(countPendingCommunications([recipient({ kind, seen_at: stamp })])).toBe(0);
  });

  it.each(['question', 'task'] as const)('%s visto sigue sin resolver', (kind) => {
    expect(countPendingCommunications([recipient({ kind, seen_at: stamp })])).toBe(1);
  });

  it('responder la pregunta y completar la tarea resuelven su pendiente', () => {
    expect(countPendingCommunications([
      recipient({ kind: 'question', seen_at: stamp, answered_at: stamp }),
      recipient({ kind: 'task', seen_at: stamp, done_at: stamp }),
    ])).toBe(0);
  });

  it('los sellos de resolución no necesitan seen_at para resolver', () => {
    expect(countPendingCommunications([
      recipient({ kind: 'question', answered_at: stamp }),
      recipient({ kind: 'task', done_at: stamp }),
    ])).toBe(0);
  });

  it.each(['draft', 'archived'] as const)('%s no reclama aunque siga sin abrir o resolver', (status) => {
    expect(countPendingCommunications(COMMUNICATION_KINDS.map((kind) => recipient({ kind, status })))).toBe(0);
  });

  it('cuenta entregas pendientes, conservando las notas vistas en la entrada', () => {
    const recipients = [
      ...Array.from({ length: 3 }, () => recipient({ seen_at: stamp })),
      recipient({ kind: 'question', seen_at: stamp }),
      recipient({ kind: 'task', seen_at: stamp }),
      recipient(),
      recipient({ kind: 'question', answered_at: stamp }),
    ];
    const before = structuredClone(recipients);
    expect(countPendingCommunications(recipients)).toBe(3);
    expect(recipients).toEqual(before);
  });

  it('no acota el contador al límite del historial', () => {
    expect(countPendingCommunications(Array.from({ length: 75 }, () => recipient()))).toBe(75);
  });

  it('sin entregas no hay pendientes', () => {
    expect(countPendingCommunications([])).toBe(0);
  });
});
