// Publicar y avisar, dictado por un cliente MCP de verdad contra la DB.
//
// LO QUE SE PRUEBA AQUÍ NO ES QUE LA TOOL RESPONDA: es que el atleta lo recibe.
// Por eso cada test cierra el círculo por el LADO DEL ATLETA, con la misma función
// que sirve a su móvil:
//   · la semana, con `buildAthleteWeekPlan` — que lleva dentro el portón real
//     (`not exists (weekly_plans … status='draft')`). Antes de publicar su semana
//     está vacía; después trae la sesión. Ese es el único «lo ve» que cuenta.
//   · el comunicado, con `listAthleteCommunications` — su bandeja, con sus pasos y
//     sus opciones tal y como los va a marcar.
//   · el mensaje, con `listMessages` del hilo, que es lo que abre en su app.
//   · la nota, con `get_athlete` — y AL MISMO TIEMPO comprobando que NO aparece en
//     su bandeja ni en su hilo, porque «interna» es la mitad del contrato.
//
// Y las tres cosas que no se pueden dar por buenas nunca:
//   · publicar dos veces la misma semana no es un error, pero tampoco es un cambio:
//     tiene que decirlo;
//   · una publicación a un atleta ajeno se cae ENTERA — ni un destinatario, ni un
//     comunicado a medias en la lista del coach;
//   · el club B no publica, no escribe y no apunta nada del atleta del club A, ni
//     se entera de que existe.

import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  addDays,
  isoDateString,
  mondayOfWeek,
  startOfDayInBox,
} from '@fahybrid/shared/domain/dates';
import { buildAthleteWeekPlan } from '@/lib/athlete/week-plan';
import { listAthleteCommunications } from '@/lib/athlete/communications';
import { listMessages } from '@/lib/chat/service';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import { call, connectAs, errorText, payload, seedCoachLogin } from '../utils/mcp-client';

type Json = Record<string, unknown>;

/** El lunes de ESTA semana en la zona del box — la que el atleta abre hoy. */
const THIS_MONDAY = isoDateString(mondayOfWeek(startOfDayInBox(new Date())));
const WEDNESDAY = isoDateString(addDays(new Date(`${THIS_MONDAY}T00:00:00Z`), 2));
/** La que viene, pedida por un día de MITAD de semana a propósito. */
const NEXT_MONDAY = isoDateString(addDays(new Date(`${THIS_MONDAY}T00:00:00Z`), 7));
const NEXT_THURSDAY = isoDateString(addDays(new Date(`${THIS_MONDAY}T00:00:00Z`), 10));
const THIRD_MONDAY = isoDateString(addDays(new Date(`${THIS_MONDAY}T00:00:00Z`), 14));
/** Muy adelante y sin nada puesto: la semana vacía. */
const EMPTY_MONDAY = isoDateString(addDays(new Date(`${THIS_MONDAY}T00:00:00Z`), 70));

describeWithDb('MCP · publicar y avisar (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const userIds: number[] = [];
  const threadIds: string[] = [];

  let clubA: Fixture;
  let clubB: Fixture;
  let coachAClerkId = '';
  let coachBClerkId = '';
  /** Un SEGUNDO atleta del club A: publicar a varios es el caso real. */
  let athleteB = 0;
  let athleteBUserId = 0;

  beforeAll(async () => {
    await sql`select 1 as ok`;
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);

    coachAClerkId = await seedCoachLogin({ sql, coachId: clubA.coachId, tag: 'pub-a', userIds });
    coachBClerkId = await seedCoachLogin({ sql, coachId: clubB.coachId, tag: 'pub-b', userIds });

    const users = await sql<Array<{ id: string }>>`
      insert into users (email, role, full_name)
      values (${`mcp-pub-athb-${Date.now()}@test.local`}, 'athlete', 'Ana Segunda')
      returning id::text as id
    `;
    athleteBUserId = Number(users[0]!.id);
    const athletes = await sql<Array<{ id: string }>>`
      insert into athletes (user_id, coach_id, full_name)
      values (${athleteBUserId}, ${clubA.coachId}, 'Ana Segunda')
      returning id::text as id
    `;
    athleteB = Number(athletes[0]!.id);

    // Una sesión REAL esta semana: es lo que el atleta tiene que ver aparecer
    // cuando su coach publica, y lo que hace que el conteo no sea cero.
    const templateId = await makeTemplate({ fx: clubA, name: 'Fuerza tren inferior' });
    await makeAssignment({ fx: clubA, templateId, scheduledForIso: WEDNESDAY });

    // Esta semana y las dos siguientes nacen en BORRADOR MANUAL: es el estado del
    // que se parte para publicar (y el que el portón del atleta esconde).
    for (const week of [THIS_MONDAY, NEXT_MONDAY, THIRD_MONDAY]) {
      await sql`
        insert into weekly_plans (athlete_id, week_start, status, delivery_mode)
        values (${clubA.athleteId}, ${week}::date, 'draft', 'manual')
      `;
    }
  });

  afterAll(async () => {
    const coachIds = [clubA?.coachId, clubB?.coachId].filter((n): n is number => !!n);
    if (coachIds.length > 0) {
      // Se lleva por delante items, destinatarios y marcas (on delete cascade).
      await sql`delete from coach_communications where coach_id = any(${coachIds}::bigint[])`;
    }
    if (threadIds.length > 0) {
      await sql`delete from chat_messages where thread_id = any(${threadIds}::bigint[])`;
      await sql`delete from chat_threads where id = any(${threadIds}::bigint[])`;
    }
    const athleteIds = [clubA?.athleteId, clubB?.athleteId, athleteB].filter(
      (n): n is number => !!n,
    );
    if (athleteIds.length > 0) {
      await sql`delete from athlete_coach_notes where athlete_id = any(${athleteIds}::bigint[])`;
      await sql`delete from weekly_plans where athlete_id = any(${athleteIds}::bigint[])`;
    }
    const notifiedUsers = [...userIds, clubA?.athleteUserId, clubB?.athleteUserId, athleteBUserId]
      .filter((n): n is number => !!n);
    if (notifiedUsers.length > 0) {
      await sql`delete from notifications where user_id = any(${notifiedUsers}::bigint[])`;
    }
    if (athleteB) await sql`delete from athletes where id = ${athleteB}`;
    if (userIds.length > 0) {
      await sql`delete from audit_log where actor_user_id = any(${userIds}::bigint[])`;
      await sql`delete from coach_members where user_id = any(${userIds}::bigint[])`;
      await sql`delete from user_roles where user_id = any(${userIds}::bigint[])`;
      await sql`delete from users where id = any(${userIds}::bigint[])`;
    }
    if (athleteBUserId) await sql`delete from users where id = ${athleteBUserId}`;
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test('las cuatro tools se anuncian como escrituras, con su forma en el esquema', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const { tools } = await client.listTools();
      const byName = new Map(tools.map((t) => [t.name, t]));
      for (const name of ['publish_week', 'publish_communication', 'send_message', 'add_note']) {
        const tool = byName.get(name);
        expect(tool, `falta ${name}`).toBeTruthy();
        expect(tool!.annotations?.readOnlyHint, name).toBe(false);
      }

      // La unión discriminada del comunicado viaja GENERADA a JSON Schema: es lo
      // que se rompería en silencio si el zod 3 del dominio dejara de ser
      // convertible, y con ello el cliente rellenaría el tipo a ciegas.
      const schema = JSON.stringify(byName.get('publish_communication')!.inputSchema);
      for (const kind of ['protocol', 'question', 'task', 'note', 'focus']) {
        expect(schema, kind).toContain(`"${kind}"`);
      }
      expect(schema).toContain('athlete_ids');
      expect(schema).toContain('due_date');
    } finally {
      await close();
    }
  });

  test('publish_week: la semana en borrador pasa a publicada y el atleta la ve', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      // Punto de partida: el atleta NO ve nada esta semana, aunque la sesión existe.
      const before = await buildAthleteWeekPlan(clubA.athleteId, 0);
      expect(before.week_start).toBe(THIS_MONDAY);
      expect(before.days.flatMap((d) => d.sessions)).toHaveLength(0);

      const body = payload(
        await call(client, 'publish_week', {
          athlete_id: clubA.athleteId,
          week_start: THIS_MONDAY,
        }),
      );

      const weeks = body.weeks as Json[];
      expect(weeks).toHaveLength(1);
      expect(weeks[0]).toMatchObject({
        week_start: THIS_MONDAY,
        was: 'draft',
        already_published: false,
        sessions: 1,
        athlete_sees_it: true,
      });
      expect(body.athlete_name).toBe('Test Athlete');
      expect(body._resumen as string).toContain('ya la ve');
      expect(body.avisos).toEqual([]);

      // La fila real: publicada y firmada por el club que publicó.
      const rows = await sql<Array<{ status: string; approved_by: string | null }>>`
        select status::text as status, approved_by::text as approved_by
        from weekly_plans
        where athlete_id = ${clubA.athleteId} and week_start = ${THIS_MONDAY}::date
      `;
      expect(rows[0]).toMatchObject({ status: 'published', approved_by: String(clubA.coachId) });

      // Y el círculo: la MISMA función que sirve al móvil ya no la esconde.
      const after = await buildAthleteWeekPlan(clubA.athleteId, 0);
      const sessions = after.days.flatMap((d) => d.sessions);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.title).toBe('Fuerza tren inferior');

      // Y le ha entrado el aviso de plan publicado.
      const notes = await sql<Array<{ n: number }>>`
        select count(*)::int as n from notifications
        where user_id = ${clubA.athleteUserId} and type = 'plan_published'
      `;
      expect(notes[0]!.n).toBe(1);
      expect(body.aviso_enviado).toBe(true);
    } finally {
      await close();
    }
  });

  test('publish_week: publicar otra vez lo dice y NO es un error', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const res = await call(client, 'publish_week', {
        athlete_id: clubA.athleteId,
        week_start: THIS_MONDAY,
      });
      expect(res.isError).not.toBe(true);
      const body = payload(res);

      const week = (body.weeks as Json[])[0]!;
      expect(week).toMatchObject({ was: 'published', already_published: true });
      expect((body.avisos as string[]).join(' ')).toContain('ya estaba publicada');
      expect(body._resumen as string).toContain('no ha cambiado nada');
    } finally {
      await close();
    }
  });

  test('publish_week: un bloque de dos semanas, anclado a sus lunes y con UN solo aviso', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const before = await countNotifications(sql, clubA.athleteUserId, 'plan_published');

      const body = payload(
        await call(client, 'publish_week', {
          athlete_id: clubA.athleteId,
          // El jueves de la semana que viene: se ancla a su lunes, y se dice.
          week_starts: [NEXT_THURSDAY, THIRD_MONDAY],
        }),
      );

      expect((body.weeks as Json[]).map((w) => w.week_start)).toEqual([NEXT_MONDAY, THIRD_MONDAY]);
      const avisos = (body.avisos as string[]).join(' ');
      expect(avisos).toContain('no es lunes');
      expect(avisos).toContain('no tienen');

      const rows = await sql<Array<{ week_start: string; status: string }>>`
        select to_char(week_start, 'YYYY-MM-DD') as week_start, status::text as status
        from weekly_plans
        where athlete_id = ${clubA.athleteId}
          and week_start = any(${[NEXT_MONDAY, THIRD_MONDAY]}::date[])
        order by week_start
      `;
      expect(rows.map((r) => r.status)).toEqual(['published', 'published']);
      // Y no hay fila del jueves: la clave del ciclo es el lunes, siempre.
      const stray = await sql<Array<{ n: number }>>`
        select count(*)::int as n from weekly_plans
        where athlete_id = ${clubA.athleteId} and week_start = ${NEXT_THURSDAY}::date
      `;
      expect(stray[0]!.n).toBe(0);

      // Dos semanas, UN aviso: el bloque es un solo acto del coach.
      expect(await countNotifications(sql, clubA.athleteUserId, 'plan_published')).toBe(before + 1);
    } finally {
      await close();
    }
  });

  test('publish_week: una semana sin nada puesto se publica, y se avisa de que está vacía', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'publish_week', {
          athlete_id: clubA.athleteId,
          week_start: EMPTY_MONDAY,
        }),
      );
      expect((body.weeks as Json[])[0]).toMatchObject({ was: 'sin_marcar', sessions: 0 });
      expect((body.avisos as string[]).join(' ')).toContain('no tiene');
    } finally {
      await close();
    }
  });

  test('publish_week cruzado: el club B no publica la semana del atleta de A', async () => {
    const { client, close } = await connectAs(coachBClerkId);
    try {
      await sql`
        insert into weekly_plans (athlete_id, week_start, status, delivery_mode)
        values (${clubA.athleteId}, ${NEXT_MONDAY}::date, 'draft', 'manual')
        on conflict (athlete_id, week_start)
        do update set status = 'draft', delivery_mode = 'manual'
      `;

      const res = await call(client, 'publish_week', {
        athlete_id: clubA.athleteId,
        week_start: NEXT_MONDAY,
      });
      expect(errorText(res)).toContain('No hay ningún atleta tuyo con ese identificador');
      expect(res.structuredContent).toBeUndefined();

      // Y la semana del atleta de A sigue escondida.
      const rows = await sql<Array<{ status: string }>>`
        select status::text as status from weekly_plans
        where athlete_id = ${clubA.athleteId} and week_start = ${NEXT_MONDAY}::date
      `;
      expect(rows[0]!.status).toBe('draft');
    } finally {
      await close();
    }
  });

  test('publish_communication: un protocolo con pasos marcables llega a su bandeja', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'publish_communication', {
          athlete_ids: [clubA.athleteId],
          communication: {
            kind: 'protocol',
            title: 'Día de carrera — Valencia',
            anchor_kind: 'race',
            body: 'Lo de siempre, pero sin improvisar nada nuevo.',
            items: [
              { label: "−3 h", content: 'Desayuno de siempre, nada nuevo', checkable: true },
              { label: "−40'", content: 'Movilidad de cadera y tobillo', checkable: true },
              { content: 'Si algo va mal, me escribes antes de empezar', checkable: false },
            ],
            final_note: 'Confía en lo que has entrenado.',
          },
        }),
      );

      const pub = body.communication as Json;
      expect(pub.kind).toBe('protocol');
      expect(pub.kind_label).toBe('PROTOCOLO');
      expect(pub.demands_action).toBe(true);
      expect(pub.athlete_sees).toBe('un protocolo con 2 pasos que marcar');
      expect(pub.anchor).toMatchObject({ kind: 'race', label: 'Día de carrera' });
      expect(pub).toMatchObject({ recipients_total: 1, new_recipients: 1 });
      expect((pub.athletes as Json[]).map((a) => a.full_name)).toEqual(['Test Athlete']);
      expect(body._resumen as string).toContain('PROTOCOLO «Día de carrera — Valencia»');
      expect(body._resumen as string).toContain('Test Athlete');

      // Su bandeja: lo que abre en el móvil, con sus pasos y qué se marca.
      const inbox = await listAthleteCommunications({ athlete_id: clubA.athleteId, sql });
      const protocolo = inbox.find((c) => c.id === pub.communication_id);
      expect(protocolo, 'el protocolo no ha llegado a su bandeja').toBeTruthy();
      expect(protocolo!.kind).toBe('protocol');
      expect(protocolo!.title).toBe('Día de carrera — Valencia');
      expect(protocolo!.final_note).toBe('Confía en lo que has entrenado.');
      expect(protocolo!.items.map((i) => i.checkable)).toEqual([true, true, false]);
      expect(protocolo!.state).toBe('published');
      expect(protocolo!.claims_attention).toBe(true);

      // Y el push encolado: la fila del aviso, con su tipo.
      expect(await countNotifications(sql, clubA.athleteUserId, 'coach_communication')).toBe(1);
    } finally {
      await close();
    }
  });

  test('publish_communication: una pregunta con dos opciones, a DOS atletas', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'publish_communication', {
          athlete_ids: [clubA.athleteId, athleteB],
          communication: {
            kind: 'question',
            title: '¿Movemos el largo al domingo?',
            anchor_kind: 'week',
            body: 'El sábado tienes la comida familiar, y el largo pide cabeza.',
            blocks: true,
            items: [
              { content: 'Sí, al domingo por la mañana', consequence: 'El lunes pasa a descanso' },
              { content: 'No, lo hago el sábado temprano', consequence: 'Se queda todo como está' },
            ],
          },
        }),
      );

      const pub = body.communication as Json;
      expect(pub.kind_label).toBe('PREGUNTA');
      expect(pub.athlete_sees).toBe(
        'una pregunta con 2 opciones para elegir, y le tapa la app hasta que conteste',
      );
      expect(pub.anchor).toMatchObject({ kind: 'week', label: 'Esta semana' });
      expect(pub.recipients_total).toBe(2);
      expect(body._resumen as string).toContain('Test Athlete y Ana Segunda');

      // Les llega a los DOS, con sus dos opciones y su consecuencia.
      for (const athleteId of [clubA.athleteId, athleteB]) {
        const inbox = await listAthleteCommunications({ athlete_id: athleteId, sql });
        const question = inbox.find((c) => c.id === pub.communication_id);
        expect(question, `no ha llegado al atleta ${athleteId}`).toBeTruthy();
        expect(question!.blocks).toBe(true);
        expect(question!.items.map((i) => i.consequence)).toEqual([
          'El lunes pasa a descanso',
          'Se queda todo como está',
        ]);
      }
    } finally {
      await close();
    }
  });

  test('publish_communication: un atleta ajeno tira la publicación ENTERA', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const commsBefore = await countCommunications(sql, clubA.coachId);
      const inboxBefore = (await listAthleteCommunications({ athlete_id: clubA.athleteId, sql }))
        .length;

      const text = errorText(
        await call(client, 'publish_communication', {
          athlete_ids: [clubA.athleteId, clubB.athleteId],
          communication: {
            kind: 'focus',
            title: 'Esto no debería salir',
            body: 'Si esto llega a alguien, el todo-o-nada no existe.',
          },
        }),
      );

      expect(text).toContain('no son tuyos');
      expect(text).toContain(String(clubB.athleteId));
      expect(text).toContain('todo o nada');
      expect(text).toContain('list_athletes');
      // Ni un dato del club ajeno.
      expect(text).not.toContain('Test Coach');

      // Y no queda NADA: ni el comunicado creado, ni un destinatario, ni un push.
      expect(await countCommunications(sql, clubA.coachId)).toBe(commsBefore);
      expect(
        (await listAthleteCommunications({ athlete_id: clubA.athleteId, sql })).length,
      ).toBe(inboxBefore);
      expect(
        (await listAthleteCommunications({ athlete_id: clubB.athleteId, sql })).length,
      ).toBe(0);
    } finally {
      await close();
    }
  });

  test('publish_communication: una plantilla es un molde y no se publica', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const before = await countCommunications(sql, clubA.coachId);
      const text = errorText(
        await call(client, 'publish_communication', {
          athlete_ids: [clubA.athleteId],
          communication: {
            kind: 'focus',
            title: 'Molde de foco',
            body: 'Esto es una plantilla, no un comunicado.',
            is_template: true,
          },
        }),
      );
      expect(text).toContain('molde');
      expect(text).toContain('is_template');
      expect(await countCommunications(sql, clubA.coachId)).toBe(before);
    } finally {
      await close();
    }
  });

  test('send_message: aparece en el hilo que el atleta abre, y le avisa', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const body = payload(
        await call(client, 'send_message', {
          athlete_id: clubA.athleteId,
          body: 'El jueves hacemos la revisión en el box, a las 18:30.',
        }),
      );

      const threadId = String(body.thread_id);
      threadIds.push(threadId);
      expect(body.athlete_name).toBe('Test Athlete');
      expect(body._resumen as string).toContain('Enviado a Test Athlete');
      expect(body._resumen as string).toContain('El jueves hacemos la revisión');

      // El hilo, leído por donde lo lee su app.
      const { messages } = await listMessages({ sql, thread_id: threadId, cursor: null });
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        id: String(body.message_id),
        sender_role: 'coach',
        body: 'El jueves hacemos la revisión en el box, a las 18:30.',
      });

      // Y le queda pendiente de leer, con su aviso.
      const thread = await sql<Array<{ unread_for_athlete: number }>>`
        select unread_for_athlete from chat_threads where id = ${threadId}::bigint
      `;
      expect(thread[0]!.unread_for_athlete).toBe(1);
      expect(await countNotifications(sql, clubA.athleteUserId, 'chat_message')).toBe(1);
    } finally {
      await close();
    }
  });

  test('add_note: queda en la ficha del coach y el atleta NO la ve por ningún lado', async () => {
    const { client, close } = await connectAs(coachAClerkId);
    try {
      const inboxBefore = (await listAthleteCommunications({ athlete_id: clubA.athleteId, sql }))
        .length;

      const body = payload(
        await call(client, 'add_note', {
          athlete_id: clubA.athleteId,
          body: 'Le molesta el aductor al patinar. Ojo con los lunges laterales.',
        }),
      );
      expect(body.visible_para_el_atleta).toBe(false);
      expect(body._resumen as string).toContain('el atleta no la ve');
      expect(body.body).toBe('Le molesta el aductor al patinar. Ojo con los lunges laterales.');

      // Está en su ficha, que es la lectura que el coach pedirá después.
      const ficha = payload(await call(client, 'get_athlete', { athlete_id: clubA.athleteId }));
      const notes = (ficha.athlete as Json).notes as Array<{ id: string; body: string }>;
      expect(notes.map((n) => n.id)).toContain(String(body.note_id));

      // Y NO está donde el atleta mira: ni en su bandeja, ni en su hilo.
      expect(
        (await listAthleteCommunications({ athlete_id: clubA.athleteId, sql })).length,
      ).toBe(inboxBefore);
      const chatHits = await sql<Array<{ n: number }>>`
        select count(*)::int as n
        from chat_messages m
        join chat_threads t on t.id = m.thread_id
        where t.athlete_id = ${clubA.athleteId} and m.body like '%aductor%'
      `;
      expect(chatHits[0]!.n).toBe(0);
    } finally {
      await close();
    }
  });

  test('cruzado: el club B no comunica, no escribe y no apunta nada del atleta de A', async () => {
    const { client, close } = await connectAs(coachBClerkId);
    try {
      const attempts: Array<[string, Json]> = [
        ['send_message', { athlete_id: clubA.athleteId, body: 'Hola, soy de otro club.' }],
        ['add_note', { athlete_id: clubA.athleteId, body: 'Nota en una ficha que no es mía.' }],
      ];

      for (const [name, args] of attempts) {
        const res = await call(client, name, args);
        expect(errorText(res), name).toContain('No hay ningún atleta tuyo con ese identificador');
        expect(errorText(res), name).not.toContain('Test Athlete');
        expect(res.structuredContent, name).toBeUndefined();
      }

      // Ni un mensaje del club B en el hilo del atleta de A, ni una nota suya.
      const hits = await sql<Array<{ messages: number; notes: number }>>`
        select
          (
            select count(*)::int from chat_threads t
            where t.athlete_id = ${clubA.athleteId} and t.coach_id = ${clubB.coachId}
          ) as messages,
          (
            select count(*)::int from athlete_coach_notes n
            where n.athlete_id = ${clubA.athleteId} and n.coach_id = ${clubB.coachId}
          ) as notes
      `;
      expect(hits[0]).toMatchObject({ messages: 0, notes: 0 });
    } finally {
      await close();
    }
  });
});

/** Cuántos avisos de un tipo tiene ese usuario — la sonda del push encolado. */
async function countNotifications(
  sql: import('@/lib/db').Sql,
  userId: number,
  type: string,
): Promise<number> {
  const rows = await sql<Array<{ n: number }>>`
    select count(*)::int as n from notifications
    where user_id = ${userId} and type = ${type}::notification_type
  `;
  return rows[0]!.n;
}

/** Cuántos comunicados tiene ese coach — la sonda de «no queda nada creado». */
async function countCommunications(
  sql: import('@/lib/db').Sql,
  coachId: number,
): Promise<number> {
  const rows = await sql<Array<{ n: number }>>`
    select count(*)::int as n from coach_communications where coach_id = ${coachId}
  `;
  return rows[0]!.n;
}
