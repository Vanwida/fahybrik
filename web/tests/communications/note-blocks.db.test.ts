// LAS FORMAS DE UNA SECCIÓN, EL CAMINO Y EL ENLACE, contra base de datos REAL
// (migración 0163).
//
// Qué se está probando y por qué no vale un mock:
//
//   · Una sección con forma es una fila con `display` y, si es un reparto, una
//     tabla hija ordenada. Que vuelva ENTERA y EN ORDEN es un join, no una idea.
//   · El CAMINO no se guarda: se resuelve leyendo el plan real del atleta
//     (`athlete_month_assignments` + `program_month_templates`) y marcando las
//     semanas con simulacro. Un cliente falso devolvería lo que le pidas y no
//     probaría nada de eso — que es justo donde puede mentir.
//   · El ENLACE sólo viaja al atleta si él TAMBIÉN es destinatario del
//     enlazado. Es un join contra `coach_communication_recipients`, y es la
//     regla que impide enseñarle que existe algo que no es suyo.
//
// Se salta con aviso cuando no hay TEST_DATABASE_URL — nunca en verde falso.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import { createCommunication } from '@/lib/coach/communications';
import { publishCommunication } from '@/lib/coach/communications-publish';
import { listCommunicationsForAthlete } from '@/lib/coach/communications';
import { listAthleteCommunications } from '@/lib/athlete/communications';
import { resolvePlanPath } from '@/lib/plan/camino';
import {
  createCommunicationSchema,
  type CreateCommunicationInput,
} from '@fahybrid/shared/domain/coach-communications';

describeWithDb('las formas de una nota, el camino y el enlace (DB real)', () => {
  const sql = getTestSql();

  let fx: Fixture;
  /** Un segundo atleta del MISMO coach: el que NO recibe el enlazado. */
  let athleteB = 0;
  let athleteBUserId = 0;

  const input = (raw: unknown): CreateCommunicationInput => createCommunicationSchema.parse(raw);

  /** La nota del caso real: las tres formas que el briefing mezcla de verdad. */
  const notaConFormas = (titulo: string) =>
    input({
      kind: 'note',
      title: titulo,
      anchor_kind: 'plan',
      items: [
        { display: 'texto', label: 'Qué ha cambiado', content: 'Pasas a Singles Pro.' },
        {
          display: 'cifra',
          content: '1:15 a 1:18',
          label: 'La banda se cierra con los tests de la semana 1.',
        },
        {
          display: 'reparto',
          label: '6 sesiones sí, 6 a tope no',
          segments: [
            { value_num: 3, label: 'duras' },
            { value_num: 2, label: 'moderadas' },
            { value_num: 1, label: 'de absorción' },
          ],
        },
        { display: 'camino', label: 'La estructura' },
      ],
    });

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    const user = await sql<Array<{ id: string }>>`
      insert into users (email, role)
      values (${`nb-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`}, 'athlete')
      returning id::text
    `;
    athleteBUserId = Number(user[0]!.id);
    const ath = await sql<Array<{ id: string }>>`
      insert into athletes (user_id, coach_id, full_name)
      values (${athleteBUserId}, ${fx.coachId}, 'Atleta sin plan')
      returning id::text
    `;
    athleteB = Number(ath[0]!.id);
  }, 60000);

  afterAll(async () => {
    await sql`delete from coach_communications where coach_id = ${fx.coachId}`;
    await sql`delete from workout_assignments where athlete_id = ${athleteB}`;
    await sql`delete from athlete_month_assignments where athlete_id = ${athleteB}`;
    await sql`delete from notifications where user_id = ${athleteBUserId}`;
    await sql`delete from athletes where id = ${athleteB}`;
    await sql`delete from users where id = ${athleteBUserId}`;
    await fx.cleanup();
    await closeTestSql();
  }, 60000);

  // -------------------------------------------------------------------------
  // Las formas
  // -------------------------------------------------------------------------

  it('una nota guarda la forma de cada sección, y los trozos del reparto en orden', async () => {
    const creada = await createCommunication({
      coach_id: fx.coachId,
      input: notaConFormas('Tu plan, rehecho'),
      sql,
    });

    expect(creada.items.map((i) => i.display)).toEqual(['texto', 'cifra', 'reparto', 'camino']);

    const cifra = creada.items[1]!;
    // En una cifra el `label` es el PIE, no la cabecera: el número es el titular.
    expect(cifra.content).toBe('1:15 a 1:18');
    expect(cifra.label).toContain('tests de la semana 1');

    const reparto = creada.items[2]!;
    expect(reparto.segments.map((s) => s.position)).toEqual([1, 2, 3]);
    expect(reparto.segments.map((s) => s.label)).toEqual(['duras', 'moderadas', 'de absorción']);
    // `numeric` vuelve como número, no como la cadena que da el driver.
    expect(reparto.segments.map((s) => s.value_num)).toEqual([3, 2, 1]);
    // Un reparto no se teclea: es sus trozos.
    expect(reparto.content).toBe('');

    // Sin atleta delante no hay camino que resolver, y eso NO es un fallo.
    expect(creada.items[3]!.camino).toBeNull();
  }, 60000);

  it('una sección sin forma sigue siendo un párrafo: los clientes viejos no se rompen', () => {
    const parsed = createCommunicationSchema.safeParse({
      kind: 'note',
      title: 'Nota de siempre',
      items: [{ label: 'Qué ha cambiado', content: 'Lo de siempre.' }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success || parsed.data.kind !== 'note') throw new Error('forma inesperada');
    expect(parsed.data.items[0]!.display).toBe('texto');
  });

  it('un reparto con un solo trozo no es un reparto', () => {
    const parsed = createCommunicationSchema.safeParse({
      kind: 'note',
      title: 'Reparto a medias',
      items: [{ display: 'reparto', label: 'Las sesiones', segments: [{ value_num: 3, label: 'duras' }] }],
    });
    expect(parsed.success).toBe(false);
  });

  it('un trozo de peso cero no ocupa sitio en la barra: no se admite', () => {
    const parsed = createCommunicationSchema.safeParse({
      kind: 'note',
      title: 'Reparto con un cero',
      items: [
        {
          display: 'reparto',
          label: 'Las sesiones',
          segments: [
            { value_num: 0, label: 'duras' },
            { value_num: 2, label: 'suaves' },
          ],
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('el camino sólo se dibuja colgado del plan o de la semana', () => {
    const suelto = createCommunicationSchema.safeParse({
      kind: 'note',
      title: 'Estructura en una sesión',
      anchor_kind: 'session',
      items: [{ display: 'camino', label: 'La estructura' }],
    });
    expect(suelto.success).toBe(false);

    const enElPlan = createCommunicationSchema.safeParse({
      kind: 'note',
      title: 'Estructura del plan',
      anchor_kind: 'plan',
      items: [{ display: 'camino', label: 'La estructura' }],
    });
    expect(enElPlan.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // El camino, resuelto contra el plan REAL
  // -------------------------------------------------------------------------

  it('el atleta recibe el camino de SU plan, con sus tramos y dónde está hoy', async () => {
    await sembrarPlan(fx);

    const nota = await createCommunication({
      coach_id: fx.coachId,
      input: notaConFormas('El camino de verdad'),
      sql,
    });
    await publishCommunication({ coach_id: fx.coachId, id: nota.id, athlete_ids: [fx.athleteId], sql });

    const bandeja = await listAthleteCommunications({ athlete_id: fx.athleteId, sql });
    const suya = bandeja.find((c) => c.title === 'El camino de verdad');
    expect(suya).toBeTruthy();

    const camino = suya!.items.find((i) => i.display === 'camino')!.camino;
    expect(camino).toBeTruthy();
    expect(camino!.total_weeks).toBe(7);
    expect(camino!.segments.map((s) => s.title)).toEqual(['Acumulación', 'Específico']);
    // Los rótulos son acumulados sobre el plan entero, no sobre cada tramo.
    expect(camino!.segments.map((s) => s.weeks_label)).toEqual(['S1-S4', 'S5-S7']);
    expect(camino!.segments.map((s) => s.first_week)).toEqual([1, 5]);
    // El tono sale de la POSICIÓN (no hay columna de color desde la 0064).
    expect(camino!.segments.map((s) => s.tone)).toEqual([0, 1]);
    // Hoy cae en la segunda semana del primer tramo (ver `sembrarPlan`).
    expect(camino!.current_position).toBe(0);
    expect(camino!.segments[0]!.current_week).toBe(2);
    expect(camino!.segments[1]!.current_week).toBeNull();
    // El simulacro del segundo tramo es lo único que se marca: no hay descarga
    // que marcar porque el esquema no la sabe decir.
    expect(camino!.segments[0]!.milestone).toBe(false);
    expect(camino!.segments[1]!.milestone).toBe(true);
    // El detalle dice QUÉ pasa y CUÁNDO, con el nombre que le puso el coach a
    // esa sesión: sin él, un nodo con halo no explica por qué lo lleva. El
    // segundo hito lleva un nombre que no cabe, así que sale por su categoría —
    // nunca recortado a media palabra.
    expect(camino!.segments[1]!.detail).toMatch(
      /^Simulacro completo el \d+ de \w+ · Simulacro el \d+ de \w+$/,
    );

    // Las otras tres formas NO llevan camino: el embed es de la suya y de nadie más.
    const otras = suya!.items.filter((i) => i.display !== 'camino');
    expect(otras.every((i) => i.camino === null)).toBe(true);
  }, 60000);

  it('sin plan asignado el camino viaja en null, y el cliente no lo pinta', async () => {
    expect(await resolvePlanPath({ athlete_id: athleteB, sql })).toBeNull();

    const nota = await createCommunication({
      coach_id: fx.coachId,
      input: notaConFormas('Camino sin plan'),
      sql,
    });
    await publishCommunication({ coach_id: fx.coachId, id: nota.id, athlete_ids: [athleteB], sql });

    const bandeja = await listAthleteCommunications({ athlete_id: athleteB, sql });
    const suya = bandeja.find((c) => c.title === 'Camino sin plan')!;
    expect(suya.items.find((i) => i.display === 'camino')!.camino).toBeNull();
  }, 60000);

  it('la ficha del coach enseña el camino de ESE atleta, no uno genérico', async () => {
    const conPlan = await listCommunicationsForAthlete({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      sql,
    });
    const notaConPlan = conPlan.find((c) => c.title === 'El camino de verdad')!;
    expect(notaConPlan.items.find((i) => i.display === 'camino')!.camino!.segments).toHaveLength(2);

    const sinPlan = await listCommunicationsForAthlete({
      coach_id: fx.coachId,
      athlete_id: athleteB,
      sql,
    });
    const notaSinPlan = sinPlan.find((c) => c.title === 'Camino sin plan')!;
    expect(notaSinPlan.items.find((i) => i.display === 'camino')!.camino).toBeNull();
  }, 60000);

  // -------------------------------------------------------------------------
  // El enlace cruzado
  // -------------------------------------------------------------------------

  it('el enlace viaja al atleta sólo si el enlazado también es suyo, y con su estado', async () => {
    const pregunta = await createCommunication({
      coach_id: fx.coachId,
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
    // Sólo al atleta A: B no la recibe.
    await publishCommunication({
      coach_id: fx.coachId,
      id: pregunta.id,
      athlete_ids: [fx.athleteId],
      sql,
    });

    const nota = await createCommunication({
      coach_id: fx.coachId,
      input: input({
        kind: 'note',
        title: 'Briefing con pregunta abierta',
        anchor_kind: 'plan',
        linked_communication_id: pregunta.id,
        items: [{ display: 'texto', label: 'El porqué', content: 'Falta cerrar la wave.' }],
      }),
      sql,
    });
    // La misma nota a los DOS.
    await publishCommunication({
      coach_id: fx.coachId,
      id: nota.id,
      athlete_ids: [fx.athleteId, athleteB],
      sql,
    });

    const deA = await listAthleteCommunications({ athlete_id: fx.athleteId, sql });
    const notaA = deA.find((c) => c.title === 'Briefing con pregunta abierta')!;
    expect(notaA.linked).toBeTruthy();
    expect(notaA.linked!.kind).toBe('question');
    expect(notaA.linked!.blocks).toBe(true);
    // Sin responder todavía: el pie es una llamada, no un recibo.
    expect(notaA.linked!.state).toBe('published');

    const deB = await listAthleteCommunications({ athlete_id: athleteB, sql });
    const notaB = deB.find((c) => c.title === 'Briefing con pregunta abierta')!;
    // B no recibió la pregunta: enseñarle el enlace sería enseñarle que existe
    // algo que no puede abrir.
    expect(notaB.linked).toBeNull();

    // Al COACH le llega siempre: es suyo, y sin un atleta delante no hay estado.
    const ficha = await listCommunicationsForAthlete({
      coach_id: fx.coachId,
      athlete_id: athleteB,
      sql,
    });
    const notaCoach = ficha.find((c) => c.title === 'Briefing con pregunta abierta')!;
    expect(notaCoach.linked!.id).toBe(pregunta.id);
    expect(notaCoach.linked!.state).toBeNull();
  }, 60000);

  it('no se puede enlazar al comunicado de otro coach', async () => {
    const ajeno = await makeCoachAndAthlete(sql);
    try {
      const suyo = await createCommunication({
        coach_id: ajeno.coachId,
        input: input({ kind: 'focus', title: 'Dormir más de 6 horas', body: 'Llevas meses por debajo.' }),
        sql,
      });

      await expect(
        createCommunication({
          coach_id: fx.coachId,
          input: input({
            kind: 'note',
            title: 'Nota que apunta fuera',
            anchor_kind: 'plan',
            linked_communication_id: suyo.id,
            items: [{ display: 'texto', label: 'El porqué', content: 'No debería guardarse.' }],
          }),
          sql,
        }),
      ).rejects.toThrow(/no es tuyo/i);
    } finally {
      await sql`delete from coach_communications where coach_id = ${ajeno.coachId}`;
      await ajeno.cleanup();
    }
  }, 60000);
});

/**
 * Un plan mínimo pero REAL: dos microciclos seguidos del coach, siete semanas en
 * total, con hoy dentro de la segunda semana del primero y un simulacro dentro
 * del segundo. Es lo que hace que las cuentas del camino signifiquen algo.
 */
async function sembrarPlan(fx: Fixture): Promise<void> {
  const sql = fx.sql;
  const lunes = lunesDeHoy();
  // El plan arrancó la semana pasada: hoy es su semana 2.
  const inicio = sumaDias(lunes, -7);

  const acumulacion = await sql<Array<{ id: string }>>`
    insert into program_month_templates (coach_id, name) values (${fx.coachId}, 'Acumulación')
    returning id::text
  `;
  const especifico = await sql<Array<{ id: string }>>`
    insert into program_month_templates (coach_id, name) values (${fx.coachId}, 'Específico')
    returning id::text
  `;
  fx.monthTemplates.push({ monthId: Number(acumulacion[0]!.id), weekIds: [] });
  fx.monthTemplates.push({ monthId: Number(especifico[0]!.id), weekIds: [] });

  // `microcycle_ids` es de dónde sale el nº de semanas de un tramo. Las semanas
  // reales no hacen falta aquí: lo que se prueba es la aritmética del camino, y
  // el recibo ya lleva su cuenta.
  await sql`
    insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date, microcycle_ids)
    values (
      ${fx.athleteId}, ${Number(acumulacion[0]!.id)},
      ${iso(inicio)}::date, ${iso(sumaDias(inicio, 27))}::date, ${[1, 2, 3, 4]}::bigint[]
    )
  `;
  const inicioDos = sumaDias(inicio, 28);
  await sql`
    insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date, microcycle_ids)
    values (
      ${fx.athleteId}, ${Number(especifico[0]!.id)},
      ${iso(inicioDos)}::date, ${iso(sumaDias(inicioDos, 20))}::date, ${[5, 6, 7]}::bigint[]
    )
  `;

  // El simulacro que convierte el segundo tramo en un hito.
  const simulacro = await makeTemplate({ fx, name: 'Simulacro completo', format: 'hyrox_sim' });
  await sql`
    insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
    values (${fx.athleteId}, ${iso(sumaDias(inicioDos, 5))}::date, ${simulacro}, 1, 'scheduled'::assignment_status)
  `;

  // Un segundo hito con un nombre que NO cabe en la línea del nodo: prueba que
  // se cae a la categoría en vez de recortarle la frase al coach.
  const largo = await makeTemplate({
    fx,
    name: 'Simulacro completo con las ocho estaciones y transiciones cronometradas',
    format: 'hyrox_sim',
  });
  await sql`
    insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status)
    values (${fx.athleteId}, ${iso(sumaDias(inicioDos, 12))}::date, ${largo}, 1, 'scheduled'::assignment_status)
  `;
}

function lunesDeHoy(): Date {
  const hoy = new Date();
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  // getUTCDay: 0=domingo. El lunes de la semana civil (lun–dom).
  const desplazamiento = (d.getUTCDay() + 6) % 7;
  return sumaDias(d, -desplazamiento);
}

function sumaDias(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
