// LA COMPARATIVA POR PERIODOS, contra base de datos REAL (migración 0170).
//
// Qué se está probando aquí y por qué no vale un cliente falso:
//
//   · Una sección con forma de comparativa NO guarda totales: guarda dos trozos
//     de calendario, y el servidor los suma cruzando `segment_zone_seconds` con
//     las semanas de cada uno. Eso es una agregación con `date_trunc` y una zona
//     horaria; un cliente falso devolvería lo que se le pida.
//   · LOS DOS PERIODOS ESTÁN CONGELADOS. Es la propiedad que sostiene la pieza:
//     el atleta que abre la nota en octubre lee la misma historia que el coach
//     firmó en agosto. Se prueba con dato REAL fuera de los dos periodos, que es
//     la única forma de que un borde mal puesto se vea.
//   · EL SOLAPE ES UN CHECK, no un `if`. Con semanas compartidas, las mismas
//     horas se sumarían en los dos lados y el delta se comería a sí mismo.
//   · LA ETIQUETA SALE DE HECHOS DEL ATLETA (cuándo entró, cuándo arrancó su
//     plan), que están en la base. Sin ella no se puede probar que «Con el plan»
//     habla del plan de verdad y no de una fecha que alguien tecleó.
//
// Se salta con aviso cuando no hay TEST_DATABASE_URL — nunca en verde falso.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import { createCommunication } from '@/lib/coach/communications';
import { publishCommunication } from '@/lib/coach/communications-publish';
import { listAthleteCommunications } from '@/lib/athlete/communications';
import { loadCompareContext, loadZoneComparison } from '@/lib/zones/compare';
import {
  createCommunicationSchema,
  type CreateCommunicationInput,
} from '@fahybrid/shared/domain/coach-communications';
import { comparePresets } from '@fahybrid/shared/domain/zone-compare';

const DIA_MS = 86_400_000;
const SEMANA_MS = 7 * DIA_MS;
const HORA = 3600;

/** Cuatro semanas por lado. El mínimo que la pieza admite, que es justo lo que
 *  hace el test corto sin dejar de ser un periodo de verdad. */
const SEMANAS = 4;

describeWithDb('la comparativa por periodos (DB real)', () => {
  const sql = getTestSql();

  let fx: Fixture;
  /** Un segundo atleta del MISMO coach, sin un solo entreno medido. */
  let sinDatos = 0;
  let sinDatosUserId = 0;
  /** Lunes en el que arranca cada lado. */
  let aInicio = '';
  let bInicio = '';

  const input = (raw: unknown): CreateCommunicationInput => createCommunicationSchema.parse(raw);

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);

    const user = await sql<Array<{ id: string }>>`
      insert into users (email, role)
      values (${`cmp-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`}, 'athlete')
      returning id::text
    `;
    sinDatosUserId = Number(user[0]!.id);
    const ath = await sql<Array<{ id: string }>>`
      insert into athletes (user_id, coach_id, full_name)
      values (${sinDatosUserId}, ${fx.coachId}, 'Atleta sin pulso')
      returning id::text
    `;
    sinDatos = Number(ath[0]!.id);

    // El DESPUÉS: cuatro semanas que terminan hace dos. El ANTES: las cuatro de
    // justo antes. Queda calendario por delante y por detrás con el que probar
    // los bordes de los dos.
    bInicio = iso(new Date(lunesHace(2).getTime() - (SEMANAS - 1) * SEMANA_MS));
    aInicio = iso(new Date(Date.parse(bInicio) - SEMANAS * SEMANA_MS));

    // ANTES (semanas 8 y 6): mucho techo, poca base, y una hora sin pulso.
    await sembrarSemana(lunesHace(8), { z4_s: 2 * HORA, z5_s: 1 * HORA, no_hr_s: 1 * HORA }, 170);
    await sembrarSemana(lunesHace(6), { z2_s: 1 * HORA, z4_s: 3 * HORA }, 170);
    // DESPUÉS (semanas 4, 3 y 2): la base sube y el techo baja.
    await sembrarSemana(lunesHace(4), { z1_s: 1 * HORA, z2_s: 3 * HORA }, 170);
    await sembrarSemana(lunesHace(3), { z2_s: 4 * HORA }, 170);
    await sembrarSemana(lunesHace(2), { z2_s: 2 * HORA, z4_s: 1 * HORA }, 170);
    // FUERA de los dos, por delante y por detrás. Nada de esto puede aparecer.
    await sembrarSemana(lunesHace(0), { z5_s: 5 * HORA }, 170);
    await sembrarSemana(lunesHace(20), { z5_s: 9 * HORA }, 170);
  }, 180_000);

  afterAll(async () => {
    await sql`delete from athletes where id = ${sinDatos}`;
    await sql`delete from users where id = ${sinDatosUserId}`;
    await fx.cleanup();
    await closeTestSql();
  }, 120_000);

  // ── La suma ────────────────────────────────────────────────────────────────

  it('suma cada lado con SUS semanas, y ni una de fuera', async () => {
    const c = await loadZoneComparison({
      athlete_id: fx.athleteId,
      a_start: aInicio,
      b_start: bInicio,
      weeks: SEMANAS,
      client: sql,
    });

    expect(c.weeks).toBe(SEMANAS);

    // ANTES: dos semanas medidas de las cuatro.
    expect(c.a.weeks_with_data).toBe(2);
    expect(c.a.z2_s).toBe(1 * HORA);
    expect(c.a.z4_s).toBe(5 * HORA);
    expect(c.a.z5_s).toBe(1 * HORA);
    expect(c.a.no_hr_s).toBe(1 * HORA);
    // El total es la suma de las partes, y por eso el reparto cierra en 100.
    expect(c.a.total_s).toBe(8 * HORA);

    // DESPUÉS: tres semanas medidas.
    expect(c.b.weeks_with_data).toBe(3);
    expect(c.b.z1_s).toBe(1 * HORA);
    expect(c.b.z2_s).toBe(9 * HORA);
    expect(c.b.z4_s).toBe(1 * HORA);
    expect(c.b.z5_s).toBe(0);
    expect(c.b.total_s).toBe(11 * HORA);

    // Las nueve horas de Z5 de hace veinte semanas y las cinco de esta semana
    // están en la base y NO entran en ningún lado: es la ventana congelada.
    expect(c.a.z5_s + c.b.z5_s).toBe(1 * HORA);
  });

  it('un atleta sin nada medido sale a ceros con cobertura cero, no a null', async () => {
    const c = await loadZoneComparison({
      athlete_id: sinDatos,
      a_start: aInicio,
      b_start: bInicio,
      weeks: SEMANAS,
      client: sql,
    });
    expect(c.a.total_s).toBe(0);
    expect(c.a.weeks_with_data).toBe(0);
    expect(c.b.total_s).toBe(0);
    expect(c.b.weeks_with_data).toBe(0);
    expect(c.anchor).toBeNull();
    // Y sigue siendo una comparación servida: los dos periodos están ahí.
    expect(c.a.week_start).toBe(aInicio);
    expect(c.b.week_start).toBe(bInicio);
  });

  it('dice con qué umbral se repartió, y avisa cuando los dos lados no lo comparten', async () => {
    const mismo = await loadZoneComparison({
      athlete_id: fx.athleteId,
      a_start: aInicio,
      b_start: bInicio,
      weeks: SEMANAS,
      client: sql,
    });
    expect(mismo.anchor).toMatchObject({ lthr_bpm: 170, mixed: false });
    expect(mismo.anchor!.source_label.length).toBeGreaterThan(0);

    // El atleta se mide el umbral A MITAD del periodo reciente: el viejo sigue
    // siendo mayoría en ese lado, así que comparando sólo los umbrales
    // dominantes de cada lado esto se escaparía — y es el caso más probable.
    await sembrarSemana(lunesHace(3), { z2_s: 5 * HORA }, 182);
    const mezclado = await loadZoneComparison({
      athlete_id: fx.athleteId,
      a_start: aInicio,
      b_start: bInicio,
      weeks: SEMANAS,
      client: sql,
    });
    expect(mezclado.anchor!.mixed).toBe(true);
  });

  // ── Las etiquetas: la voz del servidor ─────────────────────────────────────

  it('el arranque del plan del atleta pone nombre a los dos lados', async () => {
    const templateId = await makeTemplate({ fx, name: 'Sesión del mes' });
    const mes = await sql<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name)
      values (${fx.coachId}, 'Mes de prueba comparativa')
      returning id::text
    `;
    const monthId = Number(mes[0]!.id);
    fx.monthTemplates.push({ monthId, weekIds: [] });

    // El plan arranca justo donde arranca el DESPUÉS: es el corte que el atajo
    // «antes del plan / con el plan» busca.
    await sql`
      insert into athlete_month_assignments
        (athlete_id, month_template_id, start_date, end_date, microcycle_ids, assignment_count)
      values (
        ${fx.athleteId}, ${monthId}, ${bInicio}::date,
        ${iso(new Date(Date.parse(bInicio) + (SEMANAS * 7 - 1) * DIA_MS))}::date,
        ${[templateId]}::bigint[], 1
      )
    `;

    const contexto = await loadCompareContext(fx.athleteId, sql);
    expect(contexto.plan).toBe(bInicio);

    const c = await loadZoneComparison({
      athlete_id: fx.athleteId,
      a_start: aInicio,
      b_start: bInicio,
      weeks: SEMANAS,
      client: sql,
    });
    expect(c.b.label).toBe('Con el plan');
    expect(c.a.label).toBe('Antes del plan');

    // Y un par que NO cae en ese corte se llama por sus fechas, no «Con el plan».
    const otro = await loadZoneComparison({
      athlete_id: fx.athleteId,
      a_start: iso(new Date(Date.parse(aInicio) - SEMANA_MS)),
      b_start: iso(new Date(Date.parse(bInicio) - SEMANA_MS)),
      weeks: SEMANAS,
      client: sql,
    });
    expect(otro.b.label).toMatch(/^Del /);

    // El atajo del plan, montado con las fechas reales que acaban de leerse.
    const [plan] = comparePresets({ anclas: contexto, hoy: contexto.hoy });
    expect(plan!.key).toBe('plan');
    expect(plan!.b_start).toBe(bInicio);
  });

  // ── Escribir y servir ──────────────────────────────────────────────────────

  it('guarda los dos periodos y no guarda ni un total', async () => {
    const c = await createCommunication({
      coach_id: fx.coachId,
      input: notaConComparativa('Los dos periodos se guardan'),
      sql,
    });

    const seccion = c.items.find((i) => i.display === 'comparativa')!;
    expect(seccion.comparativa).not.toBeNull();
    expect(seccion.comparativa!.a.week_start).toBe(aInicio);
    expect(seccion.comparativa!.b.week_start).toBe(bInicio);
    expect(seccion.comparativa!.weeks).toBe(SEMANAS);
    // Sin atleta delante no hay totales: la config viaja, el dato no se inventa.
    expect(seccion.comparativa!.a.total_s).toBe(0);
    expect(seccion.comparativa!.b.weeks_with_data).toBe(0);
    // Una sección que no se teclea no guarda texto de relleno.
    expect(seccion.content).toBe('');
    // Y no se pisa con la gráfica de la misma nota: son dos formas distintas.
    expect(seccion.grafica).toBeNull();
  });

  it('rechaza dos periodos que se pisan y uno que no empieza en lunes', () => {
    expect(() =>
      input({
        kind: 'note',
        title: 'Se pisan',
        anchor_kind: 'plan',
        items: [
          {
            display: 'comparativa',
            label: 'Antes y ahora',
            a_start: aInicio,
            // Una semana antes de donde puede: la última de `a` se contaría dos veces.
            b_start: iso(new Date(Date.parse(bInicio) - SEMANA_MS)),
            weeks: SEMANAS,
          },
        ],
      }),
    ).toThrow(/se pisan/i);

    expect(() =>
      input({
        kind: 'note',
        title: 'Empieza un martes',
        anchor_kind: 'plan',
        items: [
          {
            display: 'comparativa',
            label: 'Antes y ahora',
            a_start: iso(new Date(Date.parse(aInicio) + DIA_MS)),
            b_start: bInicio,
            weeks: SEMANAS,
          },
        ],
      }),
    ).toThrow(/lunes/i);
  });

  it('no deja colgar la comparativa de una sesión suelta: son meses, no un día', () => {
    expect(() =>
      input({
        kind: 'note',
        title: 'Anclada a una sesión',
        anchor_kind: 'session',
        items: [
          {
            display: 'comparativa',
            label: 'Antes y ahora',
            a_start: aInicio,
            b_start: bInicio,
            weeks: SEMANAS,
          },
        ],
      }),
    ).toThrow(/plan|semana/i);
  });

  it('el atleta recibe los dos periodos sumados, y no se mueven con el reloj', async () => {
    const c = await createCommunication({
      coach_id: fx.coachId,
      input: notaConComparativa('Lo que ve el atleta'),
      sql,
    });
    await publishCommunication({
      coach_id: fx.coachId,
      id: c.id,
      athlete_ids: [fx.athleteId],
      sql,
    });

    const bandeja = await listAthleteCommunications({ athlete_id: fx.athleteId, sql });
    const cmp = bandeja
      .find((x) => x.id === c.id)!
      .items.find((i) => i.display === 'comparativa')!.comparativa!;

    expect(cmp.a.week_start).toBe(aInicio);
    expect(cmp.b.week_start).toBe(bInicio);
    expect(cmp.a.weeks_with_data).toBe(2);
    expect(cmp.b.weeks_with_data).toBe(3);
    // Existe dato más reciente (esta misma semana, cinco horas de Z5) y la nota
    // NO lo enseña: el coach no estaba hablando de él.
    expect(cmp.b.z5_s).toBe(0);
    // Y las etiquetas vienen escritas por el servidor, no por el cliente.
    expect(cmp.b.label).toBe('Con el plan');
  });

  it('la misma nota le llega vacía de dato al atleta que no tiene ninguno', async () => {
    const c = await createCommunication({
      coach_id: fx.coachId,
      input: notaConComparativa('Para el que no tiene dato'),
      sql,
    });
    await publishCommunication({
      coach_id: fx.coachId,
      id: c.id,
      athlete_ids: [sinDatos],
      sql,
    });

    const bandeja = await listAthleteCommunications({ athlete_id: sinDatos, sql });
    const cmp = bandeja
      .find((x) => x.id === c.id)!
      .items.find((i) => i.display === 'comparativa')!.comparativa!;
    expect(cmp.a.total_s).toBe(0);
    expect(cmp.b.total_s).toBe(0);
    expect(cmp.a.weeks_with_data).toBe(0);
    // La config sigue ahí: es lo que el coach escribió.
    expect(cmp.weeks).toBe(SEMANAS);
  });

  // ── Ayudas ─────────────────────────────────────────────────────────────────

  function notaConComparativa(titulo: string): CreateCommunicationInput {
    return input({
      kind: 'note',
      title: titulo,
      anchor_kind: 'plan',
      items: [
        {
          display: 'comparativa',
          label: 'Antes y ahora, mes contra mes',
          a_start: aInicio,
          b_start: bInicio,
          weeks: SEMANAS,
        },
        { display: 'texto', label: 'Lo que veo', content: 'La base sube y el techo baja.' },
      ],
    });
  }

  /**
   * Una sesión medida con su reparto por zonas, colgada del lunes que se le diga
   * y computada con el umbral que se le diga. Se escribe `segment_zone_seconds`
   * a mano y no por el motor: lo que se prueba aquí es la SUMA por periodo, y el
   * motor ya tiene su propio test contra base de datos.
   */
  async function sembrarSemana(
    lunes: Date,
    zonas: { z1_s?: number; z2_s?: number; z3_s?: number; z4_s?: number; z5_s?: number; no_hr_s?: number },
    lthr: number,
  ): Promise<void> {
    const templateId = await makeTemplate({ fx, name: `Sesión ${iso(lunes)} ${lthr}` });
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
        'samples', 'lthr_measured', ${lthr}
      )
    `;
  }
});

/** El lunes de hace `n` semanas, en UTC. Las fechas del test son de calendario:
 *  el motor agrupa en la zona del atleta y la fixture no le pone ninguna, así que
 *  cae en la del box y el miércoles a las 10 está lejos de cualquier borde. */
function lunesHace(semanas: number): Date {
  const hoy = new Date();
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  const alLunes = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - alLunes * DIA_MS - semanas * SEMANA_MS);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
