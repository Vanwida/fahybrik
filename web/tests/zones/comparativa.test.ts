// LA COMPARATIVA, EN SU ARITMÉTICA — lo que se rompe en silencio.
//
// Aquí no hay base de datos a propósito: lo que se prueba son las cuentas y las
// palabras, que son lo único de esta pieza que puede dar un número creíble y
// falso. La agregación contra Postgres tiene su propio test
// (`tests/communications/comparativa.db.test.ts`).
//
// Las cuatro propiedades que sostienen la pieza entera:
//   1. Los dos lados miden LO MISMO y no se pisan.
//   2. Una semana sin dato NO es una semana a cero: «por semana» divide entre
//      las medidas, y la cobertura se dice.
//   3. La etiqueta la escribe el SERVIDOR y sale de hechos del atleta, no de la
//      fecha de hoy: la misma sección se llama igual dentro de seis meses.
//   4. Los atajos se cortan por la última semana CERRADA. La semana en curso va
//      a medias y hundiría la media del lado reciente.

import { describe, expect, it } from 'vitest';
import {
  atajoDeEntrada,
  comparacionEnOrden,
  comparePresets,
  COMPARE_MIN_WEEKS,
  etiquetaDePeriodo,
  finDeComparacion,
  type ZoneComparePeriodDTO,
  type ZoneComparisonDTO,
} from '@fahybrid/shared/domain/zone-compare';
import {
  deltasDe,
  fraseDeCobertura,
  fraseDePuntos,
  fraseDeTiempo,
  fraseDeCadencia,
  ladosSinDato,
  parPorDefecto,
  partesDe,
  porSemanaMedida,
  sePuedeComparar,
} from '@/lib/zones/comparativa';

const HORA = 3600;

/** Un miércoles: el lunes de su semana es el 10 y la última cerrada, el 3. */
const HOY = '2026-08-12';
const LUNES_DE_HOY = '2026-08-10';
const ULTIMA_CERRADA = '2026-08-03';

function periodo(over: Partial<ZoneComparePeriodDTO> & { week_start: string }): ZoneComparePeriodDTO {
  return {
    label: 'x',
    z1_s: 0,
    z2_s: 0,
    z3_s: 0,
    z4_s: 0,
    z5_s: 0,
    no_hr_s: 0,
    total_s: 0,
    weeks_with_data: 0,
    ...over,
  };
}

/** Diez horas repartidas de dos formas distintas, con la misma cobertura: es el
 *  caso limpio, el único donde el delta habla sólo de entreno. */
function comparacion(): ZoneComparisonDTO {
  return {
    weeks: 13,
    a: periodo({
      week_start: '2026-01-05',
      label: 'Antes del plan',
      z1_s: 1 * HORA,
      z2_s: 1 * HORA,
      z4_s: 6 * HORA,
      z5_s: 2 * HORA,
      total_s: 10 * HORA,
      weeks_with_data: 13,
    }),
    b: periodo({
      week_start: '2026-04-06',
      label: 'Con el plan',
      z1_s: 4 * HORA,
      z2_s: 4 * HORA,
      z4_s: 1 * HORA,
      z5_s: 1 * HORA,
      total_s: 10 * HORA,
      weeks_with_data: 13,
    }),
    anchor: null,
  };
}

describe('los dos periodos no se pisan y miden lo mismo', () => {
  it('acepta el par que empieza justo cuando termina el anterior', () => {
    // Trece semanas desde el 5 de enero terminan la semana del 30 de marzo, así
    // que lo más pronto que puede arrancar el segundo es el 6 de abril.
    expect(finDeComparacion('2026-01-05', 13)).toBe('2026-03-30');
    expect(comparacionEnOrden({ a_start: '2026-01-05', b_start: '2026-04-06', weeks: 13 })).toBe(true);
  });

  it('rechaza una sola semana de solape', () => {
    expect(comparacionEnOrden({ a_start: '2026-01-05', b_start: '2026-03-30', weeks: 13 })).toBe(false);
  });

  it('rechaza el orden invertido, un martes y un periodo demasiado corto', () => {
    expect(comparacionEnOrden({ a_start: '2026-04-06', b_start: '2026-01-05', weeks: 13 })).toBe(false);
    expect(comparacionEnOrden({ a_start: '2026-01-06', b_start: '2026-04-06', weeks: 13 })).toBe(false);
    expect(
      comparacionEnOrden({ a_start: '2026-01-05', b_start: '2026-04-06', weeks: COMPARE_MIN_WEEKS - 1 }),
    ).toBe(false);
  });

  it('el par por defecto sale en orden y termina en la última semana CERRADA', () => {
    const par = parPorDefecto(HOY);
    expect(comparacionEnOrden(par)).toBe(true);
    expect(par.weeks).toBe(13);
    // El después termina en la semana del 3 de agosto: la del 10 está a medias.
    expect(finDeComparacion(par.b_start, par.weeks)).toBe(ULTIMA_CERRADA);
    expect(finDeComparacion(par.b_start, par.weeks)).not.toBe(LUNES_DE_HOY);
  });
});

describe('el reparto y sus diferencias', () => {
  it('los porcentajes cierran en 100 y las diferencias son las que se ven', () => {
    const c = comparacion();
    const suma = partesDe(c.b).reduce((acc, p) => acc + p.share, 0);
    expect(suma).toBeCloseTo(1, 10);

    const deltas = new Map(deltasDe(c).map((d) => [d.key, d]));
    // Z1 pasa del 10 % al 40 %: treinta puntos y tres horas.
    expect(deltas.get('z1')!.pts).toBeCloseTo(30, 10);
    expect(deltas.get('z1')!.seconds).toBe(3 * HORA);
    // Z4 baja del 60 % al 10 %.
    expect(deltas.get('z4')!.pts).toBeCloseTo(-50, 10);
    expect(deltas.get('z4')!.seconds).toBe(-5 * HORA);
    // Z3 no existe en ninguno de los dos lados: cero, no un hueco.
    expect(deltas.get('z3')!.pts).toBe(0);
  });

  it('el tiempo sin repartir cuenta dentro del total: es tiempo que entrenó', () => {
    const p = periodo({
      week_start: '2026-01-05',
      z2_s: 3 * HORA,
      no_hr_s: 1 * HORA,
      total_s: 4 * HORA,
      weeks_with_data: 4,
    });
    const partes = new Map(partesDe(p).map((x) => [x.key, x]));
    expect(partes.get('no_hr')!.share).toBeCloseTo(0.25, 10);
    expect(partesDe(p).reduce((acc, x) => acc + x.share, 0)).toBeCloseTo(1, 10);
  });
});

describe('una semana sin dato no es una semana a cero', () => {
  it('«por semana» divide entre las MEDIDAS, y la frase lo dice', () => {
    const p = periodo({
      week_start: '2026-01-05',
      z2_s: 10 * HORA,
      total_s: 10 * HORA,
      weeks_with_data: 5,
    });
    // Diez horas en cinco semanas medidas son dos por semana. Dividir entre las
    // trece de la ventana daría 46 minutos y diría que casi no entrenó.
    expect(porSemanaMedida(p)).toBe(2 * HORA);
    expect(fraseDeCadencia(p, 13)).toBe('por semana medida');
    expect(fraseDeCobertura(p, 13)).toBe('5 de 13 semanas con dato');
  });

  it('con la ventana entera medida no se añade el matiz', () => {
    const p = periodo({
      week_start: '2026-01-05',
      z2_s: 13 * HORA,
      total_s: 13 * HORA,
      weeks_with_data: 13,
    });
    expect(fraseDeCadencia(p, 13)).toBe('por semana');
    expect(fraseDeCobertura(p, 13)).toBe('Las 13 semanas con dato');
  });

  it('un lado sin nada medido no se compara: se declara', () => {
    const c = comparacion();
    c.a = periodo({ week_start: c.a.week_start, label: c.a.label });
    expect(sePuedeComparar(c)).toBe(false);
    expect(ladosSinDato(c)).toEqual(['a']);
    expect(fraseDeCobertura(c.a, 13)).toBe('Sin dato de ninguna de las 13 semanas');
    // Y sigue siendo un periodo servido, no un null: ceros con cobertura cero.
    expect(c.a.total_s).toBe(0);
    expect(c.a.weeks_with_data).toBe(0);
  });
});

describe('las palabras de la diferencia', () => {
  it('lleva signo, y el ruido de redondeo se dice «igual»', () => {
    expect(fraseDePuntos(19.2)).toBe('+19 pts');
    expect(fraseDePuntos(-2.4)).toBe('−2 pts');
    expect(fraseDePuntos(0.3)).toBe('igual');
    expect(fraseDeTiempo(4800)).toBe('+1h 20m');
    expect(fraseDeTiempo(-2700)).toBe('−45m');
    expect(fraseDeTiempo(30)).toBe('igual');
  });

  it('el signo es el menos matemático, nunca un guion largo', () => {
    for (const frase of [fraseDePuntos(-5), fraseDeTiempo(-3600)]) {
      expect(frase.codePointAt(0)).toBe(0x2212);
      expect(frase).not.toMatch(/[—–]/);
    }
  });
});

describe('cómo se llama cada lado — la voz del servidor', () => {
  const anclas = { alta: '2026-01-05', plan: '2026-04-06' };

  it('nombra el plan cuando el corte es el arranque del plan', () => {
    expect(etiquetaDePeriodo({ week_start: '2026-04-06', weeks: 13, lado: 'b', anclas })).toBe(
      'Con el plan',
    );
    // El ANTES se nombra por dónde ACABA: trece semanas que terminan la semana
    // anterior al arranque del plan.
    expect(etiquetaDePeriodo({ week_start: '2026-01-05', weeks: 13, lado: 'a', anclas })).toBe(
      'Antes del plan',
    );
  });

  it('nombra el alta cuando el corte es su entrada', () => {
    expect(
      etiquetaDePeriodo({ week_start: '2026-01-05', weeks: 13, lado: 'b', anclas }),
    ).toBe('Después de entrar');
  });

  it('un periodo que no cuelga de ningún hecho suyo se llama por sus fechas', () => {
    const etiqueta = etiquetaDePeriodo({ week_start: '2026-02-02', weeks: 4, lado: 'b', anclas });
    // Del lunes 2 de febrero al DOMINGO de la cuarta semana, que es el 1 de marzo.
    expect(etiqueta).toBe('Del 2 feb al 1 mar');
  });

  it('sin anclas (la biblioteca, sin atleta delante) se cae a las fechas', () => {
    const etiqueta = etiquetaDePeriodo({
      week_start: '2026-04-06',
      weeks: 13,
      lado: 'b',
      anclas: { alta: null, plan: null },
    });
    expect(etiqueta).toMatch(/^Del /);
  });
});

describe('los atajos, con las fechas reales del atleta', () => {
  it('el del plan corta en su arranque y llega hasta la última semana cerrada', () => {
    const [plan] = comparePresets({ anclas: { alta: '2025-09-01', plan: '2026-05-04' }, hoy: HOY });
    expect(plan!.key).toBe('plan');
    expect(plan!.unavailable).toBeNull();
    // Del 4 de mayo al 3 de agosto hay catorce semanas cerradas, ambas inclusive.
    expect(plan!.weeks).toBe(14);
    expect(plan!.b_start).toBe('2026-05-04');
    expect(plan!.a_start).toBe('2026-01-26');
    expect(comparacionEnOrden({ a_start: plan!.a_start!, b_start: plan!.b_start!, weeks: plan!.weeks! })).toBe(true);
  });

  it('un plan de dos semanas no se puede comparar todavía, y lo dice', () => {
    const [plan] = comparePresets({ anclas: { alta: null, plan: '2026-07-27' }, hoy: HOY });
    expect(plan!.a_start).toBeNull();
    expect(plan!.unavailable).toMatch(/semanas cerradas/);
  });

  it('sin plan y sin alta, los dos atajos dicen por qué y queda el trimestre', () => {
    const presets = comparePresets({ anclas: { alta: null, plan: null }, hoy: HOY });
    expect(presets.map((p) => p.key)).toEqual(['plan', 'alta', 'trimestre']);
    expect(presets[0]!.unavailable).toMatch(/plan asignado/);
    expect(presets[1]!.unavailable).toMatch(/cuándo entró/);

    const trimestre = presets[2]!;
    expect(trimestre.unavailable).toBeNull();
    expect(trimestre.weeks).toBe(13);
    expect(trimestre.b_start).toBe('2026-05-11');
    expect(trimestre.a_start).toBe('2026-02-09');
    expect(finDeComparacion(trimestre.b_start!, 13)).toBe(ULTIMA_CERRADA);
  });

  it('el de entrada es el primero que se puede montar', () => {
    const conPlan = comparePresets({ anclas: { alta: '2025-09-01', plan: '2026-05-04' }, hoy: HOY });
    expect(atajoDeEntrada(conPlan)!.key).toBe('plan');

    const sinPlan = comparePresets({ anclas: { alta: '2026-01-05', plan: null }, hoy: HOY });
    expect(atajoDeEntrada(sinPlan)!.key).toBe('alta');

    const reciente = comparePresets({ anclas: { alta: '2026-08-03', plan: null }, hoy: HOY });
    expect(atajoDeEntrada(reciente)!.key).toBe('trimestre');
  });
});
