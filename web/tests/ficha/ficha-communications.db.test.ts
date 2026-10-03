import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { CommunicationKind, CommunicationStatus } from '@fahybrid/shared/domain/coach-communications';
import { loadPendingCommunicationCount } from '@/lib/dashboard/v2/ficha-communications';
import { loadFichaShell } from '@/lib/dashboard/v2/atleta-detalle';
import { loadFichaTimeline, TIMELINE_MAX } from '@/lib/dashboard/v2/ficha-timeline';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('contador de comunicados de la ficha (DB real)', () => {
  const sql = getTestSql();
  let own: Fixture;
  let other: Fixture;
  const stamp = '2026-10-03T08:00:00Z';
  const count = (coach_id = own.coachId, athlete_id = own.athleteId) => (
    loadPendingCommunicationCount({ coach_id, athlete_id, client: sql })
  );

  async function deliver(kind: CommunicationKind, params: {
    coach_id?: number;
    athlete_id?: number;
    status?: CommunicationStatus;
    seen?: boolean;
    done?: boolean;
    answered?: boolean;
  } = {}) {
    const status = params.status ?? 'published';
    const [communication] = await sql<{ id: string }[]>`
      insert into coach_communications (coach_id, kind, title, body, due_date, status, published_at)
      values (${params.coach_id ?? own.coachId}, ${kind}, 'Comunicado del test', 'Contenido',
        ${kind === 'task' ? '2026-10-01' : null}::date, ${status},
        ${status === 'draft' ? null : stamp}::timestamptz)
      returning id::text
    `;
    const items = await sql<{ id: string }[]>`
      insert into coach_communication_items (communication_id, position, content, consequence)
      select ${communication!.id}::bigint, n, 'Contenido', ${kind === 'question' ? 'Se ajusta el plan' : null}
      from generate_series(1, ${kind === 'question' ? 2 : 1}) n
      returning id::text
    `;
    await sql`
      insert into coach_communication_recipients
        (communication_id, athlete_id, seen_at, done_at, answered_at, answered_item_id)
      values (${communication!.id}::bigint, ${params.athlete_id ?? own.athleteId},
        ${params.seen ? stamp : null}::timestamptz, ${params.done ? stamp : null}::timestamptz,
        ${params.answered ? stamp : null}::timestamptz, ${params.answered ? items[0]!.id : null}::bigint)
    `;
    return communication!.id;
  }

  beforeAll(async () => {
    own = await makeCoachAndAthlete(sql);
    other = await makeCoachAndAthlete(sql);
  }, 90_000);

  beforeEach(async () => {
    await sql`delete from coach_communications where coach_id in (${own.coachId}, ${other.coachId})`;
  });

  afterAll(async () => {
    const coaches = [own?.coachId, other?.coachId].filter((id): id is number => id != null);
    if (coaches.length) await sql`delete from coach_communications where coach_id = any(${coaches}::bigint[])`;
    if (own) await own.cleanup();
    if (other) await other.cleanup();
    await closeTestSql();
  }, 90_000);

  it('las tres notas vistas permanecen en Historial y no en pendientes de la ficha', async () => {
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push(await deliver('note', { seen: true }));
    expect(await count()).toBe(0);
    const shell = await loadFichaShell({ coach_id: own.coachId, athlete_id: own.athleteId, club_name: 'Test', client: sql });
    expect(shell?.pending_comunicados).toBe(0);
    const history = await loadFichaTimeline({ coach_id: own.coachId, athlete_id: own.athleteId, client: sql });
    const communications = history.filter((entry) => entry.kind === 'comunicado');
    expect(communications).toHaveLength(3);
    expect(communications.every((entry) => entry.detail === 'visto')).toBe(true);
    expect(communications.map((entry) => entry.communication_id).sort()).toEqual(ids.sort());
  });

  it('nota, protocolo y foco sin abrir cuentan; al verlos dejan de reclamar', async () => {
    for (const kind of ['note', 'protocol', 'focus'] as const) await deliver(kind);
    expect(await count()).toBe(3);
    await sql`update coach_communication_recipients set seen_at = ${stamp}::timestamptz where athlete_id = ${own.athleteId}`;
    expect(await count()).toBe(0);
  });

  it('pregunta y tarea vistas siguen pendientes hasta responder y hacer', async () => {
    await deliver('question', { seen: true });
    await deliver('task', { seen: true });
    expect(await count()).toBe(2);
    await sql`update coach_communication_recipients r
      set answered_at = ${stamp}::timestamptz,
        answered_item_id = (select id from coach_communication_items where communication_id = r.communication_id order by position limit 1)
      from coach_communications c
      where c.id = r.communication_id and c.coach_id = ${own.coachId} and c.kind = 'question'`;
    await sql`update coach_communication_recipients r set done_at = ${stamp}::timestamptz
      from coach_communications c
      where c.id = r.communication_id and c.coach_id = ${own.coachId} and c.kind = 'task'`;
    expect(await count()).toBe(0);
  });

  it('retirados, borradores y resueltos no suman; retirar conserva el historial', async () => {
    const archived = await deliver('note', { status: 'archived' });
    await deliver('note', { status: 'draft' });
    await deliver('question', { answered: true });
    await deliver('task', { done: true });
    expect(await count()).toBe(0);
    const history = await loadFichaTimeline({ coach_id: own.coachId, athlete_id: own.athleteId, client: sql });
    expect(history.filter((entry) => entry.kind === 'comunicado')).toHaveLength(3);
    expect(history.find((entry) => entry.communication_id === archived)?.detail).toBe('Retirado · sin abrir');
  });

  it('el contador conserva todas las entregas aunque Historial tenga su límite de lectura', async () => {
    const total = TIMELINE_MAX + 1;
    const rows = await sql<{ id: string }[]>`
      insert into coach_communications (coach_id, kind, title, body, status, published_at)
      select ${own.coachId}, 'note', 'Nota del test', 'Contenido', 'published', ${stamp}::timestamptz
      from generate_series(1, ${total})
      returning id::text
    `;
    const ids = rows.map((row) => row.id);
    await sql`
      insert into coach_communication_items (communication_id, position, content)
      select id, 1, 'Contenido' from coach_communications where id = any(${ids}::bigint[])
    `;
    await sql`
      insert into coach_communication_recipients (communication_id, athlete_id)
      select id, ${own.athleteId} from coach_communications where id = any(${ids}::bigint[])
    `;
    expect(await count()).toBe(total);
    const history = await loadFichaTimeline({ coach_id: own.coachId, athlete_id: own.athleteId, client: sql });
    expect(history.filter((entry) => entry.kind === 'comunicado').length).toBeLessThan(total);
  });

  it('solo suma entregas del coach actual al atleta propio, nunca otro coach o destinatario', async () => {
    await deliver('note');
    await deliver('note', { coach_id: other.coachId, athlete_id: other.athleteId });
    // Entrega de un dueño anterior: la asociación persiste tras cambiar de roster.
    await deliver('note', { coach_id: other.coachId });
    expect(await count()).toBe(1);
    expect(await count(other.coachId, other.athleteId)).toBe(1);
    expect(await count(other.coachId, own.athleteId)).toBe(0);
    expect(await count(own.coachId, other.athleteId)).toBe(0);
  });
});
