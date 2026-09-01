// LA GRÁFICA FIRMADA Y LA NOTA DE VOZ, contra base de datos REAL (migración 0169).
//
// Qué se está probando aquí y por qué no vale un cliente falso:
//
//   · Una sección con forma de gráfica NO guarda barras: guarda un periodo, y el
//     servidor lo resuelve cruzando `segment_zone_seconds` con la ventana del
//     atleta que está mirando. Eso es una agregación con `date_trunc` y una zona
//     horaria; un cliente falso devolvería lo que se le pida y no probaría nada
//     de lo único que puede fallar.
//   · LA VENTANA ESTÁ CONGELADA. Es la propiedad que sostiene toda la pieza: el
//     atleta que abre la nota en octubre tiene que leer la misma historia que el
//     coach firmó en agosto. Se prueba con dato REAL fuera de la ventana, que es
//     la única forma de que un borde mal puesto se vea.
//   · Los rangos y los trozos de un reparto comparten tabla desde la 0169. Que no
//     se mezclen es un CHECK y un `where` — otra vez, base de datos.
//   · El audio se guarda si es NUESTRO y del coach que escribe. Apuntar al audio
//     de otro coach se lo entregaría a atletas que no tienen nada que ver con él.
//
// Se salta con aviso cuando no hay TEST_DATABASE_URL — nunca en verde falso.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import { createCommunication, listCommunicationsForAthlete } from '@/lib/coach/communications';
import { publishCommunication } from '@/lib/coach/communications-publish';
import { listAthleteCommunications } from '@/lib/athlete/communications';
import { audioProxyUrl } from '@/lib/communications/audio';
import {
  createCommunicationSchema,
  type CreateCommunicationInput,
} from '@fahybrid/shared/domain/coach-communications';

const DIA_MS = 86_400_000;
const SEMANA_MS = 7 * DIA_MS;

/** Ventana de la nota: ocho semanas que TERMINAN hace dos, para que quede
 *  calendario real por delante y por detrás con el que probar los bordes. */
const SEMANAS_VENTANA = 8;

describeWithDb('la gráfica firmada y la nota de voz (DB real)', () => {
  const sql = getTestSql();

  let fx: Fixture;
  /** Un segundo atleta del MISMO coach, sin un solo entreno medido. */
  let sinDatos = 0;
  let sinDatosUserId = 0;
  /** El lunes en el que empieza la ventana de la nota. */
  let ventanaInicio = '';

  const input = (raw: unknown): CreateCommunicationInput => createCommunicationSchema.parse(raw);

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);

    const user = await sql<Array<{ id: string }>>`
      insert into users (email, role)
      values (${`gz-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`}, 'athlete')
      returning id::text
    `;
    sinDatosUserId = Number(user[0]!.id);
    const ath = await sql<Array<{ id: string }>>`
      insert into athletes (user_id, coach_id, full_name)
      values (${sinDatosUserId}, ${fx.coachId}, 'Atleta sin pulso')
      returning id::text
    `;
    sinDatos = Number(ath[0]!.id);

    // La ventana: [hace 9 semanas, hace 2 semanas], ambas puntas inclusive.
    const finVentana = lunesHace(2);
    ventanaInicio = iso(new Date(finVentana.getTime() - (SEMANAS_VENTANA - 1) * SEMANA_MS));

    // Tres semanas medidas DENTRO y una FUERA, por delante. La de fuera es lo que
    // prueba que la ventana no se estira sola con el paso del tiempo.
    await sembrarSemana(lunesHace(9), { z2_s: 3600, no_hr_s: 600 });
    await sembrarSemana(lunesHace(6), { z2_s: 5400, z4_s: 900 });
    await sembrarSemana(lunesHace(2), { z1_s: 1800, z2_s: 7200 });
    await sembrarSemana(lunesHace(0), { z5_s: 4200 });
  }, 120_000);

  afterAll(async () => {
    await sql`delete from athletes where id = ${sinDatos}`;
    await sql`delete from users where id = ${sinDatosUserId}`;
    await fx.cleanup();
    await closeTestSql();
  }, 120_000);

  // ── Escribir ───────────────────────────────────────────────────────────────

  it('guarda el periodo y las marcas, y no guarda ni una barra', async () => {
    const c = await createCommunication({
      coach_id: fx.coachId,
      input: notaConGrafica('El periodo se guarda entero'),
      sql,
    });

    const seccion = c.items.find((i) => i.display === 'grafica');
    expect(seccion).toBeDefined();
    expect(seccion!.grafica).not.toBeNull();
    expect(seccion!.grafica!.week_start).toBe(ventanaInicio);
    expect(seccion!.grafica!.weeks).toBe(SEMANAS_VENTANA);
    expect(seccion!.grafica!.modality).toBeNull();
    expect(seccion!.grafica!.ranges).toHaveLength(2);
    expect(seccion!.grafica!.ranges[0]!.tone).toBe('atencion');
    expect(seccion!.grafica!.ranges[1]!.label).toBe('La base sube y se sostiene');
    // Una sección que no se teclea no guarda texto de relleno.
    expect(seccion!.content).toBe('');

    // Y el reparto de la misma nota sigue siendo un reparto: comparten tabla
    // desde la 0169 y no se pueden mezclar (esto es lo que rompería la 0163).
    const reparto = c.items.find((i) => i.display === 'reparto');
    expect(reparto!.segments.map((s) => s.label)).toEqual(['duras', 'moderadas']);
    expect(reparto!.grafica).toBeNull();
    expect(seccion!.segments).toEqual([]);
  });

  it('rechaza una marca que se sale del periodo', () => {
    expect(() =>
      input({
        kind: 'note',
        title: 'Una marca fuera',
        anchor_kind: 'plan',
        items: [
          {
            display: 'grafica',
            label: 'Sus zonas',
            week_start: ventanaInicio,
            weeks: SEMANAS_VENTANA,
            ranges: [
              {
                // Una semana MÁS ALLÁ del final de la ventana.
                week_start: iso(new Date(Date.parse(ventanaInicio) + SEMANAS_VENTANA * SEMANA_MS)),
                week_end: iso(new Date(Date.parse(ventanaInicio) + SEMANAS_VENTANA * SEMANA_MS)),
                label: 'Fuera de la gráfica',
                tone: 'bien',
              },
            ],
          },
        ],
      }),
    ).toThrow(/se sale del periodo/i);
  });

  it('rechaza un tono que no existe y una ventana que no empieza en lunes', () => {
    const conTono = (tone: string) => ({
      kind: 'note',
      title: 'Tono raro',
      anchor_kind: 'plan',
      items: [
        {
          display: 'grafica',
          label: 'Sus zonas',
          week_start: ventanaInicio,
          weeks: SEMANAS_VENTANA,
          ranges: [
            { week_start: ventanaInicio, week_end: ventanaInicio, label: 'Ojo', tone },
          ],
        },
      ],
    });
    expect(() => input(conTono('rojo'))).toThrow();
    expect(() => input(conTono('bien'))).not.toThrow();

    expect(() =>
      input({
        kind: 'note',
        title: 'Empieza un martes',
        anchor_kind: 'plan',
        items: [
          {
            display: 'grafica',
            label: 'Sus zonas',
            week_start: iso(new Date(Date.parse(ventanaInicio) + DIA_MS)),
            weeks: SEMANAS_VENTANA,
            ranges: [],
          },
        ],
      }),
    ).toThrow(/lunes/i);
  });

  it('no deja colgar la gráfica de una sesión suelta: son meses, no un día', () => {
    expect(() =>
      input({
        kind: 'note',
        title: 'Anclada a una sesión',
        anchor_kind: 'session',
        items: [
          {
            display: 'grafica',
            label: 'Sus zonas',
            week_start: ventanaInicio,
            weeks: SEMANAS_VENTANA,
            ranges: [],
          },
        ],
      }),
    ).toThrow(/plan|semana/i);
  });

  // ── Servir ─────────────────────────────────────────────────────────────────

  it('el atleta recibe SUS semanas con dato, sólo las de dentro de la ventana', async () => {
    const c = await createCommunication({
      coach_id: fx.coachId,
      input: notaConGrafica('Lo que ve el atleta'),
      sql,
    });
    await publishCommunication({
      coach_id: fx.coachId,
      id: c.id,
      athlete_ids: [fx.athleteId],
      sql,
    });

    const bandeja = await listAthleteCommunications({ athlete_id: fx.athleteId, sql });
    const nota = bandeja.find((x) => x.id === c.id)!;
    const grafica = nota.items.find((i) => i.display === 'grafica')!.grafica!;

    // Tres semanas sembradas dentro; la cuarta cae fuera y NO viaja. Ésta es la
    // prueba de que la ventana está congelada: existe dato más reciente y la
    // gráfica no lo enseña, porque el coach no estaba hablando de él.
    expect(grafica.weeks_data.map((w) => w.week_start).sort()).toEqual(
      [iso(lunesHace(9)), iso(lunesHace(6)), iso(lunesHace(2))].sort(),
    );
    expect(grafica.week_start).toBe(ventanaInicio);
    expect(grafica.weeks).toBe(SEMANAS_VENTANA);

    // Y los segundos son los sembrados, no un recuento de filas.
    const seis = grafica.weeks_data.find((w) => w.week_start === iso(lunesHace(6)))!;
    expect(seis.z2_s).toBe(5400);
    expect(seis.z4_s).toBe(900);
    expect(seis.total_s).toBe(6300);

    // Las marcas del coach viajan enteras con ella.
    expect(grafica.ranges.map((r) => r.tone)).toEqual(['atencion', 'bien']);

    // Una semana SIN dato no viaja como cero: no viaja. Un cero diría «no
    // entrenó» y la ausencia dice «de esa semana no sabemos».
    expect(grafica.weeks_data.some((w) => w.total_s === 0)).toBe(false);
  });

  it('un atleta sin un solo entreno medido recibe la gráfica sin barras', async () => {
    const c = await createCommunication({
      coach_id: fx.coachId,
      input: notaConGrafica('Para el que no tiene dato'),
      sql,
    });
    await publishCommunication({
      coach_id: fx.coachId,
      id: c.id,
      athlete_ids: [sinDatos],
      sql,
    });

    const bandeja = await listAthleteCommunications({ athlete_id: sinDatos, sql });
    const grafica = bandeja
      .find((x) => x.id === c.id)!
      .items.find((i) => i.display === 'grafica')!.grafica!;

    // La CONFIG viaja siempre (es lo que el coach escribió) y las barras van
    // vacías: el cliente dice que no hay dato en vez de pintar suelo de ceros.
    expect(grafica.weeks_data).toEqual([]);
    expect(grafica.anchor).toBeNull();
    expect(grafica.week_start).toBe(ventanaInicio);
  });

  it('el coach ve en la ficha exactamente la misma gráfica que el atleta', async () => {
    const c = await createCommunication({
      coach_id: fx.coachId,
      input: notaConGrafica('La misma para los dos'),
      sql,
    });
    await publishCommunication({
      coach_id: fx.coachId,
      id: c.id,
      athlete_ids: [fx.athleteId],
      sql,
    });

    const suya = await listAthleteCommunications({ athlete_id: fx.athleteId, sql });
    const delCoach = await listCommunicationsForAthlete({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      sql,
    });

    const deElla = suya.find((x) => x.id === c.id)!.items.find((i) => i.display === 'grafica')!;
    const deEl = delCoach.find((x) => x.id === c.id)!.items.find((i) => i.display === 'grafica')!;
    expect(deEl.grafica).toEqual(deElla.grafica);
  });

  // ── El audio ───────────────────────────────────────────────────────────────

  it('guarda la nota de voz y la sirve a los dos lados', async () => {
    const url = audioProxyUrl(`comunicados/${fx.coachId}/2026/08/${crypto.randomUUID()}.wav`);
    const c = await createCommunication({
      coach_id: fx.coachId,
      input: input({
        kind: 'focus',
        title: 'Esta semana, la respiración',
        anchor_kind: 'checkin',
        body: 'Te lo explico en el audio.',
        audio_url: url,
        audio_seconds: 134,
      }),
      sql,
    });
    expect(c.audio_url).toBe(url);
    expect(c.audio_seconds).toBe(134);

    await publishCommunication({
      coach_id: fx.coachId,
      id: c.id,
      athlete_ids: [fx.athleteId],
      sql,
    });
    const bandeja = await listAthleteCommunications({ athlete_id: fx.athleteId, sql });
    const suyo = bandeja.find((x) => x.id === c.id)!;
    expect(suyo.audio_url).toBe(url);
    expect(suyo.audio_seconds).toBe(134);
  });

  it('no guarda un audio que no es nuestro ni el de otro coach', async () => {
    const ajeno = audioProxyUrl(`comunicados/${fx.coachId + 999_999}/2026/08/${crypto.randomUUID()}.wav`);
    await expect(
      createCommunication({
        coach_id: fx.coachId,
        input: input({
          kind: 'focus',
          title: 'Audio de otro',
          anchor_kind: 'general',
          body: 'No debería guardarse.',
          audio_url: ajeno,
          audio_seconds: 30,
        }),
        sql,
      }),
    ).rejects.toThrow(/no es de este comunicado/i);

    await expect(
      createCommunication({
        coach_id: fx.coachId,
        input: input({
          kind: 'focus',
          title: 'Audio de internet',
          anchor_kind: 'general',
          body: 'No debería guardarse.',
          audio_url: 'https://ejemplo.invalido/audio.wav',
          audio_seconds: 30,
        }),
        sql,
      }),
    ).rejects.toThrow(/no es de este comunicado/i);
  });

  it('la duración sin audio (y al revés) no es un comunicado a medias: no pasa', () => {
    expect(() =>
      input({
        kind: 'focus',
        title: 'Media nota de voz',
        anchor_kind: 'general',
        body: 'x',
        audio_seconds: 30,
      }),
    ).toThrow(/duración/i);
  });

  // ── Ayudas ─────────────────────────────────────────────────────────────────

  /** La nota del caso real: la gráfica marcada más un reparto, para comprobar de
   *  paso que las dos formas conviven en la misma tabla hija sin pisarse. */
  function notaConGrafica(titulo: string): CreateCommunicationInput {
    const marcaA = iso(lunesHace(9));
    const marcaB = iso(lunesHace(6));
    return input({
      kind: 'note',
      title: titulo,
      anchor_kind: 'plan',
      items: [
        {
          display: 'grafica',
          label: 'Tus últimos 2 meses en zonas',
          week_start: ventanaInicio,
          weeks: SEMANAS_VENTANA,
          modality: null,
          ranges: [
            {
              week_start: marcaA,
              week_end: marcaB,
              label: 'Sierra: todo a tope, nada de base',
              tone: 'atencion',
            },
            {
              week_start: iso(lunesHace(3)),
              week_end: iso(lunesHace(2)),
              label: 'La base sube y se sostiene',
              tone: 'bien',
            },
          ],
        },
        {
          display: 'reparto',
          label: '6 sesiones sí, 6 a tope no',
          segments: [
            { value_num: 3, label: 'duras' },
            { value_num: 2, label: 'moderadas' },
          ],
        },
        { display: 'texto', label: 'Lo que veo', content: 'Estás desplazando la zona a la derecha.' },
      ],
    });
  }

  /**
   * Una sesión medida con su reparto por zonas, colgada del lunes que se le
   * diga. Se escribe `segment_zone_seconds` a mano y no por el motor: lo que se
   * está probando aquí es la AGREGACIÓN por ventana, y el motor ya tiene su
   * propio test contra base de datos (`tests/zones/zone-engine.db.test.ts`).
   */
  async function sembrarSemana(
    lunes: Date,
    zonas: { z1_s?: number; z2_s?: number; z3_s?: number; z4_s?: number; z5_s?: number; no_hr_s?: number },
  ): Promise<void> {
    const templateId = await makeTemplate({ fx, name: `Sesión ${iso(lunes)}` });
    // El miércoles de esa semana: bien dentro, lejos de los dos bordes.
    const cuando = new Date(lunes.getTime() + 2 * DIA_MS + 10 * 3600_000);
    const assignmentId = await makeAssignment({
      fx,
      templateId,
      scheduledForIso: iso(cuando),
      status: 'completed',
    });
    const exec = await sql<Array<{ id: string }>>`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, source)
      values (
        ${assignmentId}, ${fx.athleteId},
        ${cuando.toISOString()}::timestamptz,
        ${new Date(cuando.getTime() + 3600_000).toISOString()}::timestamptz,
        3600, 'healthkit'
      )
      returning id::text
    `;
    const seg = await sql<Array<{ id: string }>>`
      insert into segment_executions (execution_id, position, started_at, ended_at, modality)
      values (
        ${Number(exec[0]!.id)}, 0,
        ${cuando.toISOString()}::timestamptz,
        ${new Date(cuando.getTime() + 3600_000).toISOString()}::timestamptz,
        'run'
      )
      returning id::text
    `;
    await sql`
      insert into segment_zone_seconds (
        segment_execution_id, z1_s, z2_s, z3_s, z4_s, z5_s, no_hr_s,
        hr_origin, computed_with_anchor, computed_with_lthr_bpm
      ) values (
        ${Number(seg[0]!.id)},
        ${zonas.z1_s ?? 0}, ${zonas.z2_s ?? 0}, ${zonas.z3_s ?? 0},
        ${zonas.z4_s ?? 0}, ${zonas.z5_s ?? 0}, ${zonas.no_hr_s ?? 0},
        'samples', 'lthr_measured', 170
      )
    `;
  }
});

/** El lunes de hace `n` semanas, en UTC. Las fechas del test son de calendario:
 *  el motor agrupa en la zona del atleta y la fixture no le pone ninguna, así
 *  que cae en la del box y el miércoles a las 10 está lejos de cualquier borde. */
function lunesHace(semanas: number): Date {
  const hoy = new Date();
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  const alLunes = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - alLunes * DIA_MS - semanas * SEMANA_MS);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
