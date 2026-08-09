// El comunicado del coach contra base de datos REAL (docs/DECISIONS.md, 2026-08-09).
//
// Qué se está probando aquí y por qué no vale un mock: lo que hace que un
// comunicado signifique algo son sus reglas de forma (una pregunta con una sola
// opción no se puede contestar, una tarea sin fecha es un recado) y su reparto
// (publicar crea una fila de estado por atleta y un aviso por atleta, y solo a
// atletas del roster de ESE coach). Todo eso son CHECKs, joins y transacciones:
// un cliente falso no ejercita ninguno.
//
// Se salta con aviso cuando no hay TEST_DATABASE_URL — nunca en verde falso.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  createCommunication,
  deleteCommunication,
  getCommunication,
  listCommunications,
  publishCommunication,
  updateCommunication,
} from '@/lib/coach/communications';
import {
  createCommunicationSchema,
  type CreateCommunicationInput,
} from '@fahybrid/shared/domain/coach-communications';

describeWithDb('comunicados del coach (DB real)', () => {
  const sql = getTestSql();

  let coachId = 0;
  let athleteA = 0;
  let athleteB = 0;
  let athleteAUserId = 0;
  let athleteBUserId = 0;
  let otherCoachId = 0;
  let otherAthleteId = 0;
  const userIds: number[] = [];
  const athleteIds: number[] = [];
  const coachIds: number[] = [];

  const uniqueEmail = (tag: string) =>
    `com-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

  async function makeUser(role: 'coach' | 'athlete'): Promise<number> {
    const rows = await sql<{ id: string }[]>`
      insert into users (email, role) values (${uniqueEmail(role)}, ${role}::user_role)
      returning id::text as id
    `;
    const id = Number(rows[0]!.id);
    userIds.push(id);
    return id;
  }

  async function makeCoach(name: string): Promise<number> {
    const rows = await sql<{ id: string }[]>`
      insert into coaches (user_id, full_name) values (${await makeUser('coach')}, ${name})
      returning id::text as id
    `;
    const id = Number(rows[0]!.id);
    coachIds.push(id);
    return id;
  }

  async function makeAthlete(coach_id: number, name: string): Promise<[number, number]> {
    const user_id = await makeUser('athlete');
    const rows = await sql<{ id: string }[]>`
      insert into athletes (user_id, coach_id, full_name) values (${user_id}, ${coach_id}, ${name})
      returning id::text as id
    `;
    const id = Number(rows[0]!.id);
    athleteIds.push(id);
    return [id, user_id];
  }

  /** Un input ya validado: los tests escriben lo mismo que escribe la ruta. */
  const input = (raw: unknown): CreateCommunicationInput => createCommunicationSchema.parse(raw);

  const protocolInput = (title: string, extra: Record<string, unknown> = {}) =>
    input({
      kind: 'protocol',
      title,
      anchor_kind: 'test',
      anchor_ref: '900',
      items: [
        { label: "−40'", content: 'Movilidad de cadera y tobillo' },
        { label: "−20'", content: 'Dos series de 500 m progresivos' },
      ],
      final_note: 'Si algo va mal, me escribes antes de empezar.',
      ...extra,
    });

  beforeAll(async () => {
    coachId = await makeCoach('Club de prueba');
    [athleteA, athleteAUserId] = await makeAthlete(coachId, 'Atleta A');
    [athleteB, athleteBUserId] = await makeAthlete(coachId, 'Atleta B');
    otherCoachId = await makeCoach('Otro club');
    [otherAthleteId] = await makeAthlete(otherCoachId, 'Atleta ajeno');
  });

  afterAll(async () => {
    if (coachIds.length > 0) {
      // Los comunicados se llevan por delante items, destinatarios y marcas
      // (on delete cascade). Los avisos cuelgan de users, así que van antes.
      await sql`delete from coach_communications where coach_id = any(${coachIds}::bigint[])`;
    }
    if (userIds.length > 0) {
      await sql`delete from notifications where user_id = any(${userIds}::bigint[])`;
    }
    if (athleteIds.length > 0) {
      await sql`delete from athletes where id = any(${athleteIds}::bigint[])`;
    }
    if (coachIds.length > 0) {
      await sql`delete from coaches where id = any(${coachIds}::bigint[])`;
    }
    if (userIds.length > 0) {
      await sql`delete from users where id = any(${userIds}::bigint[])`;
    }
    await closeTestSql();
  });

  it('un protocolo nace con sus pasos, en orden y con su nota final', async () => {
    const created = await createCommunication({
      coach_id: coachId,
      input: protocolInput('Protocolo del test de 2 km'),
      sql,
    });

    expect(created.kind).toBe('protocol');
    expect(created.status).toBe('draft');
    expect(created.published_at).toBeNull();
    expect(created.items.map((i) => i.position)).toEqual([1, 2]);
    expect(created.items[0]!.label).toBe("−40'");
    expect(created.items[1]!.content).toBe('Dos series de 500 m progresivos');
    expect(created.final_note).toContain('me escribes');
    expect(created.anchor_kind).toBe('test');
    expect(created.anchor_ref).toBe('900');
    expect(created.tracking).toEqual({ recipients: 0, seen: 0, done: 0, answered: 0 });
  });

  it('una pregunta guarda sus opciones con la consecuencia de cada una', async () => {
    const created = await createCommunication({
      coach_id: coachId,
      input: input({
        kind: 'question',
        title: '¿Tu wave es el jueves o el sábado?',
        body: 'El taper está montado contando con el sábado.',
        blocks: true,
        anchor_kind: 'plan',
        items: [
          { content: 'Jueves 12', consequence: 'Todo se adelanta dos días.' },
          { content: 'Sábado 14', consequence: 'El plan se queda como está.' },
        ],
      }),
      sql,
    });

    expect(created.blocks).toBe(true);
    expect(created.items).toHaveLength(2);
    expect(created.items[0]!.consequence).toBe('Todo se adelanta dos días.');
    // Las opciones no llevan marca temporal: su texto ES la opción.
    expect(created.items[0]!.label).toBeNull();
  });

  it('una pregunta con una sola opción no es una pregunta', () => {
    const parsed = createCommunicationSchema.safeParse({
      kind: 'question',
      title: '¿Vienes el sábado?',
      body: 'Necesito saberlo para cerrar la semana.',
      items: [{ content: 'Sí' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('una tarea sin fecha límite no se guarda', () => {
    const parsed = createCommunicationSchema.safeParse({
      kind: 'task',
      title: 'Súbeme el vídeo del sentadilla',
    });
    expect(parsed.success).toBe(false);

    const withDate = createCommunicationSchema.safeParse({
      kind: 'task',
      title: 'Súbeme el vídeo del sentadilla',
      due_date: '2026-08-14',
    });
    expect(withDate.success).toBe(true);
  });

  it('un protocolo sin pasos tampoco: sin pasos es una nota mal escrita', () => {
    const parsed = createCommunicationSchema.safeParse({
      kind: 'protocol',
      title: 'Calentamiento del test',
      items: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('publicar a dos atletas crea dos destinatarios y dos avisos', async () => {
    const created = await createCommunication({
      coach_id: coachId,
      input: protocolInput('Protocolo de carrera'),
      sql,
    });

    const published = await publishCommunication({
      coach_id: coachId,
      id: created.id,
      athlete_ids: [athleteA, athleteB],
      sql,
    });

    expect(published.recipients).toBe(2);
    expect(published.new_recipients).toBe(2);
    expect(published.published_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const detail = await getCommunication({ coach_id: coachId, id: created.id, sql });
    expect(detail.status).toBe('published');
    expect(detail.tracking.recipients).toBe(2);
    expect(detail.tracking.seen).toBe(0);
    expect(detail.recipients.map((r) => r.state)).toEqual(['published', 'published']);

    const avisos = await sql<{ n: number }[]>`
      select count(*)::int as n from notifications
      where user_id = any(${[athleteAUserId, athleteBUserId]}::bigint[])
        and type = 'coach_communication'
        and payload_json->>'communication_id' = ${created.id}
    `;
    expect(avisos[0]!.n).toBe(2);
  });

  it('re-publicar añade destinatarios sin duplicar los que ya estaban', async () => {
    const created = await createCommunication({
      coach_id: coachId,
      input: protocolInput('Protocolo que sale en dos tandas'),
      sql,
    });
    await publishCommunication({ coach_id: coachId, id: created.id, athlete_ids: [athleteA], sql });
    const second = await publishCommunication({
      coach_id: coachId,
      id: created.id,
      athlete_ids: [athleteA, athleteB],
      sql,
    });

    expect(second.new_recipients).toBe(1);
    expect(second.recipients).toBe(2);
  });

  it('publicar a un atleta de otro coach se rechaza ENTERO', async () => {
    const created = await createCommunication({
      coach_id: coachId,
      input: protocolInput('Protocolo que no debe salir'),
      sql,
    });

    await expect(
      publishCommunication({
        coach_id: coachId,
        id: created.id,
        athlete_ids: [athleteA, otherAthleteId],
        sql,
      }),
    ).rejects.toMatchObject({ code: 'unknown_athlete', status: 400 });

    // Ni siquiera al atleta legítimo: publicar "a casi todos" en silencio es peor.
    const detail = await getCommunication({ coach_id: coachId, id: created.id, sql });
    expect(detail.status).toBe('draft');
    expect(detail.tracking.recipients).toBe(0);
  });

  it('el comunicado de otro coach no existe para mí', async () => {
    const mine = await createCommunication({
      coach_id: coachId,
      input: protocolInput('Mío'),
      sql,
    });
    await expect(
      getCommunication({ coach_id: otherCoachId, id: mine.id, sql }),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  it('lo publicado ya no se edita', async () => {
    const created = await createCommunication({
      coach_id: coachId,
      input: protocolInput('Protocolo publicado'),
      sql,
    });
    await publishCommunication({ coach_id: coachId, id: created.id, athlete_ids: [athleteA], sql });

    await expect(
      updateCommunication({
        coach_id: coachId,
        id: created.id,
        input: protocolInput('Protocolo publicado (retocado)'),
        sql,
      }),
    ).rejects.toMatchObject({ code: 'already_published', status: 409 });
  });

  it('editar un borrador reescribe sus pasos, no los acumula', async () => {
    const created = await createCommunication({
      coach_id: coachId,
      input: protocolInput('Borrador editable'),
      sql,
    });
    const edited = await updateCommunication({
      coach_id: coachId,
      id: created.id,
      input: protocolInput('Borrador editable', {
        items: [{ content: 'Un solo paso ahora' }],
      }),
      sql,
    });

    expect(edited.items).toHaveLength(1);
    expect(edited.items[0]!.content).toBe('Un solo paso ahora');
  });

  it('borrar un borrador lo borra; borrar lo publicado lo archiva', async () => {
    const draft = await createCommunication({
      coach_id: coachId,
      input: protocolInput('Borrador desechable'),
      sql,
    });
    expect(await deleteCommunication({ coach_id: coachId, id: draft.id, sql })).toMatchObject({
      outcome: 'deleted',
    });
    await expect(
      getCommunication({ coach_id: coachId, id: draft.id, sql }),
    ).rejects.toMatchObject({ code: 'not_found' });

    const live = await createCommunication({
      coach_id: coachId,
      input: protocolInput('Publicado y retirado'),
      sql,
    });
    await publishCommunication({ coach_id: coachId, id: live.id, athlete_ids: [athleteA], sql });
    expect(await deleteCommunication({ coach_id: coachId, id: live.id, sql })).toMatchObject({
      outcome: 'archived',
    });

    // Archivado conserva a quién salió: es el historial del coach.
    const detail = await getCommunication({ coach_id: coachId, id: live.id, sql });
    expect(detail.status).toBe('archived');
    expect(detail.tracking.recipients).toBe(1);
  });

  it('una plantilla se guarda en la biblioteca y no se publica', async () => {
    const template = await createCommunication({
      coach_id: coachId,
      input: protocolInput('Plantilla de calentamiento', { is_template: true }),
      sql,
    });

    const templates = await listCommunications({ coach_id: coachId, view: 'templates', sql });
    expect(templates.map((t) => t.id)).toContain(template.id);
    const drafts = await listCommunications({ coach_id: coachId, view: 'drafts', sql });
    expect(drafts.map((t) => t.id)).not.toContain(template.id);

    await expect(
      publishCommunication({
        coach_id: coachId,
        id: template.id,
        athlete_ids: [athleteA],
        sql,
      }),
    ).rejects.toMatchObject({ code: 'template_not_publishable', status: 409 });
  });

  it('la lista de publicados no mezcla borradores', async () => {
    const published = await listCommunications({ coach_id: coachId, view: 'published', sql });
    expect(published.length).toBeGreaterThan(0);
    expect(published.every((c) => c.status !== 'draft')).toBe(true);
    expect(published.every((c) => c.is_template === false)).toBe(true);
  });
});
