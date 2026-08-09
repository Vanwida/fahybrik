// La bandeja del atleta contra base de datos REAL (docs/DECISIONS.md, 2026-08-09).
//
// Lo que se prueba aquí es lo que hace que la bandeja SIRVA: que lo que le
// reclama algo esté arriba, que lo que no es suyo o ya no está vivo no aparezca,
// y que los actos (visto, respondido, paso marcado) dejen el estado que el coach
// va a leer. Es SQL con joins, filtros de caducidad y un `done_at` derivado de
// otra tabla: un mock no ejercita nada de eso.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  createCommunication,
  deleteCommunication,
  listCommunicationsForAthlete,
  publishCommunication,
} from '@/lib/coach/communications';
import {
  answerCommunication,
  listAthleteCommunications,
  markCommunicationDone,
  markCommunicationSeen,
  setCommunicationItemMark,
} from '@/lib/athlete/communications';
import {
  createCommunicationSchema,
  type CreateCommunicationInput,
} from '@fahybrid/shared/domain/coach-communications';

/** Montar y desmontar el escenario cuesta decenas de viajes a la rama de Neon. */
const HOOK_TIMEOUT_MS = 90_000;

describeWithDb('la bandeja del atleta (DB real)', () => {
  const sql = getTestSql();

  let coachId = 0;
  let athleteId = 0;
  let otherAthleteId = 0;
  const userIds: number[] = [];
  const athleteIds: number[] = [];

  // Los comunicados del escenario, por su papel en la bandeja.
  const ids: Record<string, string> = {};

  const uniqueEmail = (tag: string) =>
    `inbox-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

  const input = (raw: unknown): CreateCommunicationInput => createCommunicationSchema.parse(raw);

  async function publish(raw: unknown, to: number[] = [athleteId]): Promise<string> {
    const created = await createCommunication({ coach_id: coachId, input: input(raw), sql });
    await publishCommunication({ coach_id: coachId, id: created.id, athlete_ids: to, sql });
    return created.id;
  }

  beforeAll(async () => {
    const coachUser = await sql<{ id: string }[]>`
      insert into users (email, role) values (${uniqueEmail('coach')}, 'coach'::user_role)
      returning id::text as id
    `;
    userIds.push(Number(coachUser[0]!.id));
    const coach = await sql<{ id: string }[]>`
      insert into coaches (user_id, full_name) values (${Number(coachUser[0]!.id)}, 'Club de prueba')
      returning id::text as id
    `;
    coachId = Number(coach[0]!.id);

    for (const name of ['Atleta bandeja', 'Atleta vecino']) {
      const u = await sql<{ id: string }[]>`
        insert into users (email, role) values (${uniqueEmail('athlete')}, 'athlete'::user_role)
        returning id::text as id
      `;
      userIds.push(Number(u[0]!.id));
      const a = await sql<{ id: string }[]>`
        insert into athletes (user_id, coach_id, full_name)
        values (${Number(u[0]!.id)}, ${coachId}, ${name})
        returning id::text as id
      `;
      athleteIds.push(Number(a[0]!.id));
    }
    [athleteId, otherAthleteId] = athleteIds as [number, number];

    // El escenario: uno de cada tipo, más los tres que NO deben salir.
    ids.pregunta = await publish({
      kind: 'question',
      title: '¿Tu wave es el jueves o el sábado?',
      body: 'El taper está montado contando con el sábado.',
      blocks: true,
      anchor_kind: 'plan',
      items: [
        { content: 'Jueves 12', consequence: 'Todo se adelanta dos días.' },
        { content: 'Sábado 14', consequence: 'El plan se queda como está.' },
      ],
    });
    ids.tarea = await publish({
      kind: 'task',
      title: 'Súbeme el vídeo de la sentadilla',
      body: 'Sin verlo no puedo ajustarte la carga.',
      due_date: '2026-08-20',
    });
    ids.protocolo = await publish({
      kind: 'protocol',
      title: 'Protocolo del test de 2 km',
      anchor_kind: 'test',
      anchor_ref: '900',
      items: [
        { label: "−40'", content: 'Movilidad de cadera y tobillo' },
        { label: "−20'", content: 'Dos series de 500 m progresivos' },
        { label: "−5'", content: 'Tres aceleraciones de 20 m' },
      ],
      final_note: 'Si algo va mal, me escribes antes de empezar.',
    });
    ids.nota = await publish({
      kind: 'note',
      title: 'Por qué he rehecho tu plan',
      items: [
        { label: 'El cambio', content: 'Pasas a Singles Pro.' },
        { label: 'Qué implica', content: 'Más fuerza y menos volumen de carrera.' },
      ],
    });
    ids.foco = await publish({
      kind: 'focus',
      title: 'Come antes de entrenar',
      body: 'Todo lo que se te va en la segunda mitad viene de aquí.',
    });

    // Publicado y luego archivado: sale de la bandeja, no del historial del coach.
    ids.archivado = await publish({
      kind: 'focus',
      title: 'Foco retirado',
      body: 'Ya no aplica.',
    });
    await deleteCommunication({ coach_id: coachId, id: ids.archivado, sql });

    // Caducado: el coach le puso fecha de fin y ya pasó.
    ids.caducado = await publish({
      kind: 'note',
      title: 'Nota caducada',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      items: [{ label: 'Contexto', content: 'Esto era para la semana pasada.' }],
    });

    // Del vecino: mismo coach, otro atleta.
    ids.ajeno = await publish(
      {
        kind: 'task',
        title: 'Tarea del vecino',
        due_date: '2026-08-15',
      },
      [otherAthleteId],
    );

    // Borrador: no se ha publicado a nadie.
    const draft = await createCommunication({
      coach_id: coachId,
      input: input({ kind: 'focus', title: 'Borrador', body: 'Sin publicar.' }),
      sql,
    });
    ids.borrador = draft.id;
    // El escenario son nueve comunicados publicados contra una rama de Neon: el
    // presupuesto de 10 s de vitest para un hook es una suposición local.
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    await sql`delete from coach_communications where coach_id = ${coachId}::bigint`;
    if (userIds.length > 0) {
      await sql`delete from notifications where user_id = any(${userIds}::bigint[])`;
    }
    if (athleteIds.length > 0) {
      await sql`delete from athletes where id = any(${athleteIds}::bigint[])`;
    }
    await sql`delete from coaches where id = ${coachId}::bigint`;
    if (userIds.length > 0) {
      await sql`delete from users where id = any(${userIds}::bigint[])`;
    }
    await closeTestSql();
  }, HOOK_TIMEOUT_MS);

  it('solo enseña lo que está vivo y es MÍO', async () => {
    const inbox = await listAthleteCommunications({ athlete_id: athleteId, sql });
    const shown = inbox.map((c) => c.id);

    expect(shown).toContain(ids.pregunta);
    expect(shown).toContain(ids.foco);
    expect(shown).not.toContain(ids.borrador);
    expect(shown).not.toContain(ids.archivado);
    expect(shown).not.toContain(ids.caducado);
    expect(shown).not.toContain(ids.ajeno);
  });

  it('el comunicado llega con sus items y su ancla, listo para pintar', async () => {
    const inbox = await listAthleteCommunications({ athlete_id: athleteId, sql });
    const protocolo = inbox.find((c) => c.id === ids.protocolo)!;

    expect(protocolo.items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(protocolo.items[0]!.label).toBe("−40'");
    expect(protocolo.anchor_kind).toBe('test');
    expect(protocolo.anchor_ref).toBe('900');
    expect(protocolo.final_note).toContain('me escribes');
    expect(protocolo.coach_name).toBe('Club de prueba');
    expect(protocolo.state).toBe('published');
    expect(protocolo.claims_attention).toBe(true);
  });

  it('ordena por lo que reclama: bloquea > vence > sin abrir > el foco > lo cerrado', async () => {
    // Abrir la nota y el foco los saca de "sin abrir": lo que queda arriba es lo
    // que de verdad pide algo.
    await markCommunicationSeen({ athlete_id: athleteId, communication_id: ids.nota, sql });
    await markCommunicationSeen({ athlete_id: athleteId, communication_id: ids.foco, sql });

    const inbox = await listAthleteCommunications({ athlete_id: athleteId, sql });
    expect(inbox.map((c) => c.id)).toEqual([
      ids.pregunta,
      ids.tarea,
      ids.protocolo,
      ids.foco,
      ids.nota,
    ]);
  });

  it('ver algo NO lo cierra: sigue reclamando lo que pide un acto', async () => {
    const before = await listAthleteCommunications({ athlete_id: athleteId, sql });
    expect(before.find((c) => c.id === ids.nota)!.claims_attention).toBe(false);

    await markCommunicationSeen({ athlete_id: athleteId, communication_id: ids.tarea, sql });
    const after = await listAthleteCommunications({ athlete_id: athleteId, sql });
    const tarea = after.find((c) => c.id === ids.tarea)!;
    expect(tarea.state).toBe('seen');
    expect(tarea.claims_attention).toBe(true);
  });

  it('responder fija la opción elegida y deja la pregunta respondida', async () => {
    const inbox = await listAthleteCommunications({ athlete_id: athleteId, sql });
    const pregunta = inbox.find((c) => c.id === ids.pregunta)!;
    const elegida = pregunta.items[0]!;

    const state = await answerCommunication({
      athlete_id: athleteId,
      communication_id: ids.pregunta,
      item_id: elegida.id,
      sql,
    });

    expect(state.state).toBe('answered');
    expect(state.answered_item_id).toBe(elegida.id);
    expect(state.answered_at).not.toBeNull();
    // Responder implica haberla abierto.
    expect(state.seen_at).not.toBeNull();

    const after = await listAthleteCommunications({ athlete_id: athleteId, sql });
    const respondida = after.find((c) => c.id === ids.pregunta)!;
    expect(respondida.claims_attention).toBe(false);
    // Y ya no encabeza la bandeja: lo que bloqueaba ha dejado de bloquear.
    expect(after[0]!.id).not.toBe(ids.pregunta);
  });

  it('una opción de OTRO comunicado no vale como respuesta', async () => {
    const inbox = await listAthleteCommunications({ athlete_id: athleteId, sql });
    const pasoDelProtocolo = inbox.find((c) => c.id === ids.protocolo)!.items[0]!;

    await expect(
      answerCommunication({
        athlete_id: athleteId,
        communication_id: ids.pregunta,
        item_id: pasoDelProtocolo.id,
        sql,
      }),
    ).rejects.toMatchObject({ code: 'unknown_item', status: 400 });
  });

  it('los pasos marcados suman, y el protocolo se cierra al marcar el último', async () => {
    const inbox = await listAthleteCommunications({ athlete_id: athleteId, sql });
    const pasos = inbox.find((c) => c.id === ids.protocolo)!.items;

    const first = await setCommunicationItemMark({
      athlete_id: athleteId,
      communication_id: ids.protocolo,
      item_id: pasos[0]!.id,
      done: true,
      sql,
    });
    expect(first.marked_item_ids).toEqual([pasos[0]!.id]);
    // Con un paso de tres, el protocolo NO está hecho.
    expect(first.done_at).toBeNull();
    expect(first.state).toBe('seen');

    await setCommunicationItemMark({
      athlete_id: athleteId,
      communication_id: ids.protocolo,
      item_id: pasos[1]!.id,
      done: true,
      sql,
    });
    const last = await setCommunicationItemMark({
      athlete_id: athleteId,
      communication_id: ids.protocolo,
      item_id: pasos[2]!.id,
      done: true,
      sql,
    });

    expect(last.marked_item_ids).toHaveLength(3);
    expect(last.done_at).not.toBeNull();
    expect(last.state).toBe('done');
  });

  it('desmarcar un paso reabre el protocolo: no hay dos verdades', async () => {
    const inbox = await listAthleteCommunications({ athlete_id: athleteId, sql });
    const pasos = inbox.find((c) => c.id === ids.protocolo)!.items;

    const reopened = await setCommunicationItemMark({
      athlete_id: athleteId,
      communication_id: ids.protocolo,
      item_id: pasos[1]!.id,
      done: false,
      sql,
    });
    expect(reopened.done_at).toBeNull();
    expect(reopened.marked_item_ids).toHaveLength(2);

    // Y «hecho» explícito marca los que falten, dejando las dos cuentas iguales.
    const done = await markCommunicationDone({
      athlete_id: athleteId,
      communication_id: ids.protocolo,
      sql,
    });
    expect(done.done_at).not.toBeNull();
    expect(done.marked_item_ids).toHaveLength(3);
  });

  it('una tarea se cierra con «hecho»; una nota y una pregunta, no', async () => {
    const tarea = await markCommunicationDone({
      athlete_id: athleteId,
      communication_id: ids.tarea,
      sql,
    });
    expect(tarea.state).toBe('done');

    await expect(
      markCommunicationDone({ athlete_id: athleteId, communication_id: ids.nota, sql }),
    ).rejects.toMatchObject({ code: 'not_actionable', status: 409 });

    await expect(
      markCommunicationDone({ athlete_id: athleteId, communication_id: ids.pregunta, sql }),
    ).rejects.toMatchObject({ code: 'not_actionable', status: 409 });
  });

  it('solo un protocolo se marca paso a paso', async () => {
    const inbox = await listAthleteCommunications({ athlete_id: athleteId, sql });
    const opcion = inbox.find((c) => c.id === ids.pregunta)!.items[0]!;

    await expect(
      setCommunicationItemMark({
        athlete_id: athleteId,
        communication_id: ids.pregunta,
        item_id: opcion.id,
        done: true,
        sql,
      }),
    ).rejects.toMatchObject({ code: 'not_a_protocol', status: 409 });
  });

  it('el comunicado de otro atleta no existe para mí', async () => {
    await expect(
      markCommunicationSeen({ athlete_id: athleteId, communication_id: ids.ajeno, sql }),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });

    await expect(
      markCommunicationDone({ athlete_id: athleteId, communication_id: ids.ajeno, sql }),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });

    // Y el borrador tampoco: no se ha publicado a nadie.
    await expect(
      markCommunicationSeen({ athlete_id: athleteId, communication_id: ids.borrador, sql }),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });
  });

  it('el vecino ve lo suyo y solo lo suyo', async () => {
    const inbox = await listAthleteCommunications({ athlete_id: otherAthleteId, sql });
    expect(inbox.map((c) => c.id)).toEqual([ids.ajeno]);
  });

  // La ficha del atleta en el dashboard: el coach mira A ESTE atleta, no la
  // feature (docs/DECISIONS.md 2026-08-09). Se apoya en el estado que han dejado
  // los tests de arriba: la pregunta respondida, el protocolo hecho, la tarea
  // cerrada, la nota vista y el foco visto.
  it('la ficha del atleta enseña lo que le mandó y qué hizo con ello, paso a paso', async () => {
    const ficha = await listCommunicationsForAthlete({
      coach_id: coachId,
      athlete_id: athleteId,
      sql,
    });
    const porId = new Map(ficha.map((c) => [c.id, c]));

    // Lo suyo, incluido lo archivado (la ficha es historial), nunca lo del vecino
    // ni un borrador que no salió.
    expect(porId.has(ids.ajeno)).toBe(false);
    expect(porId.has(ids.borrador)).toBe(false);
    expect(porId.has(ids.archivado)).toBe(true);
    expect(porId.get(ids.archivado)!.status).toBe('archived');
    // Lo caducado sí sigue: dejó de estar en su bandeja, no de haberse mandado.
    expect(porId.has(ids.caducado)).toBe(true);

    const pregunta = porId.get(ids.pregunta)!;
    expect(pregunta.athlete_state.state).toBe('answered');
    expect(pregunta.athlete_state.answered_item_id).toBe(pregunta.items[0]!.id);
    expect(pregunta.athlete_state.claims_attention).toBe(false);

    // El protocolo: por qué paso va, con los ids reales de sus pasos.
    const protocolo = porId.get(ids.protocolo)!;
    expect(protocolo.athlete_state.marked_item_ids.slice().sort()).toEqual(
      protocolo.items.map((i) => i.id).slice().sort(),
    );
    expect(protocolo.athlete_state.done_at).not.toBeNull();

    const tarea = porId.get(ids.tarea)!;
    expect(tarea.athlete_state.state).toBe('done');

    // Un archivado no reclama nada aunque su tipo pida acción: el coach lo retiró.
    expect(porId.get(ids.archivado)!.athlete_state.claims_attention).toBe(false);
  });

  it('la ficha trae también el agregado del comunicado, no solo el estado de uno', async () => {
    const ficha = await listCommunicationsForAthlete({
      coach_id: coachId,
      athlete_id: athleteId,
      sql,
    });
    const protocolo = ficha.find((c) => c.id === ids.protocolo)!;
    expect(protocolo.tracking.recipients).toBe(1);
    expect(protocolo.tracking.done).toBe(1);
    expect(protocolo.athlete_state.athlete_id).toBe(String(athleteId));
  });

  it('un atleta que no es del coach no devuelve lista vacía: no existe', async () => {
    const otherCoachUser = await sql<{ id: string }[]>`
      insert into users (email, role) values (${uniqueEmail('coach2')}, 'coach'::user_role)
      returning id::text as id
    `;
    userIds.push(Number(otherCoachUser[0]!.id));
    const otherCoach = await sql<{ id: string }[]>`
      insert into coaches (user_id, full_name) values (${Number(otherCoachUser[0]!.id)}, 'Otro club')
      returning id::text as id
    `;

    await expect(
      listCommunicationsForAthlete({
        coach_id: Number(otherCoach[0]!.id),
        athlete_id: athleteId,
        sql,
      }),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });

    await sql`delete from coaches where id = ${Number(otherCoach[0]!.id)}::bigint`;
  });
});
