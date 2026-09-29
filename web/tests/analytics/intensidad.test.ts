// ¿ENTRENO A LA INTENSIDAD QUE TOCA? (shared/domain/analytics/intensidad.ts):
// tiempo en zonas por semana y por familia, el reparto frente al objetivo del
// coach, y el ritmo por zonas al correr.

import { describe, expect, test } from 'vitest';
import { lecturasIntensidad, veredictoReparto, type EntradaIntensidad } from '@fahybrid/shared/domain/analytics/intensidad';
import { zonaDeRitmo } from '@fahybrid/shared/domain/analytics/intensidad-ritmo';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { resolverVentana } from '@fahybrid/shared/domain/analytics/ventana';
import { defaultCoachHrMethod } from '@fahybrid/shared/domain/coach/hr-method';
import { resolveZonesForAthlete, standardZonesFor } from '@fahybrid/shared/domain/methodology';
import type { SesionHecha, TramoHecho, ZonasCongeladas } from '@fahybrid/shared/domain/analytics/carga-tramo';
import { aMitadDeFrase, type Ancla, type Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import type { AnclaResuelta } from '@fahybrid/shared/domain/analytics/anclas';

const HOY = '2026-09-27'; // domingo: la ventana de 4 semanas son cuatro semanas enteras
const VENTANA = resolverVentana({ clave: '4s', hoy_local: HOY, primera_sesion_iso: '2026-01-01' });

function zonas(z: [number, number, number, number, number], sin_pulso_s = 0, ancla: Ancla | null = 'estimada'): ZonasCongeladas {
  return { por_zona: { 1: z[0], 2: z[1], 3: z[2], 4: z[3], 5: z[4] }, sin_pulso_s, ancla };
}

function tramo(over: Partial<TramoHecho>): TramoHecho {
  return { segundos: 3600, modalidad: 'run', familia: 'correr', potencia_w: null, ritmo_s: null, pendiente_pct: null, pulso_medio: 140, zonas: null, esfuerzo: null, ...over };
}

function sesion(id: string, dia: string, tramos: TramoHecho[]): SesionHecha {
  return { id, dia, segundos: tramos.reduce((a, t) => a + t.segundos, 0), rpe: null, pulso_medio: null, tramos };
}

const UMBRAL_PULSO: AnclaResuelta = { valor: 160, ancla: 'estimada', fuente: 'from_max_hr', explica_es: 'Estimado desde tu FC máxima', desde_iso: null };

function entrada(sesiones: SesionHecha[], over: Partial<EntradaIntensidad> = {}): EntradaIntensidad {
  return {
    sesiones,
    ventana: VENTANA,
    metodo: defaultCoachAnalyticsMethod(),
    hr: defaultCoachHrMethod(),
    pulso: { ancla: UMBRAL_PULSO, bandas: null },
    ritmo_correr: null,
    ...over,
  };
}

const porId = (ls: Lectura[], id: string) => ls.find((l) => l.id === id);

// Un rodaje de 1 h todo en Z2 esta semana, unas series de 40 min (20 Z2 / 20 Z4)
// hace dos semanas, y 1 h de fuerza en Z1 (que no entra en el reparto).
const SESIONES = [
  sesion('a', '2026-09-24', [tramo({ zonas: zonas([0, 3600, 0, 0, 0]) })]),
  sesion('b', '2026-09-10', [tramo({ segundos: 2400, zonas: zonas([0, 1200, 0, 1200, 0]) })]),
  sesion('c', '2026-09-11', [tramo({ modalidad: 'strength', familia: 'fuerza', zonas: zonas([3600, 0, 0, 0, 0]) })]),
  // Periodo anterior (antes del 31-08): 1 h en Z2.
  sesion('d', '2026-08-20', [tramo({ zonas: zonas([0, 3600, 0, 0, 0]) })]),
];

describe('el tiempo en zonas', () => {
  test('suma todas las familias, con el reparto de las cinco zonas', () => {
    const l = porId(lecturasIntensidad(entrada(SESIONES)), 'intensidad.zonas')!;
    expect(l.dato).toMatchObject({ valor: 1 + 40 / 60 + 1, unidad: 'horas' });
    expect(l.reparto?.partes.map((p) => [p.code, p.valor])).toEqual([
      ['z1', 1],
      ['z2', 1 + 20 / 60],
      ['z3', 0],
      ['z4', 20 / 60],
      ['z5', 0],
    ]);
    expect(l.procedencia).toMatchObject({ de: 'segundos_por_zona', ancla: 'estimada', medida: true });
    // Contra el periodo anterior (1 h): +267 %, en la unidad del cambio de horas del coach.
    expect(l.comparacion).toMatchObject({ anterior: 1, unidad: 'pct', cambio_minimo: 10, significativo: true });
  });

  test('cada zona por semana: una semana sin pulso es un HUECO, una con pulso y nada en esa zona es un cero', () => {
    const l = porId(lecturasIntensidad(entrada(SESIONES)), 'intensidad.z4')!;
    expect(l.serie?.paso).toBe('semana');
    expect(l.serie?.puntos).toEqual([
      { t: '2026-08-31', v: null },
      { t: '2026-09-07', v: 20 / 60 },
      { t: '2026-09-14', v: null },
      { t: '2026-09-21', v: 0 },
    ]);
  });

  test('cada familia con pulso tiene su reparto', () => {
    const ls = lecturasIntensidad(entrada(SESIONES));
    expect(ls.filter((l) => l.id.startsWith('intensidad.zonas.')).map((l) => [l.id, l.familia])).toEqual([
      ['intensidad.zonas.correr', 'correr'],
      ['intensidad.zonas.fuerza', 'fuerza'],
    ]);
  });
});

describe('el reparto frente al objetivo del coach', () => {
  test('sin la fuerza: 80 min fáciles de 100 = 80 % contra el 80 del objetivo, pero 20 puntos de zona media: «mucha zona media»', () => {
    const l = porId(lecturasIntensidad(entrada(SESIONES)), 'intensidad.polarizacion')!;
    expect(l.dato).toMatchObject({ valor: 80, unidad: 'pct', referencia: { valor: 80, delta: 0, de: 'objetivo_coach' } });
    expect(l.reparto?.partes.map((p) => [p.code, p.etiqueta_es, p.pct])).toEqual([
      ['facil', 'Fácil (Z1–Z2)', 80],
      ['medio', 'Medio (Z3–Z4)', 20],
      ['duro', 'Duro (Z5)', 0],
    ]);
    expect(l.veredicto).toMatchObject({ code: 'zona_media', tono: 'atencion' });
    expect(l.veredicto?.frase_es).toMatch(/20 puntos más de zona media/);
    expect(l.comparacion).toMatchObject({ anterior: 100, delta: -20, unidad: 'pp', cambio_minimo: 5, significativo: true });
    expect(l.serie?.referencias).toEqual([{ code: 'objetivo', etiqueta_es: 'Objetivo de tu coach', valor: 80 }]);
  });

  test('con la fuerza dentro (método del coach) el fácil se infla', () => {
    const metodo = { ...defaultCoachAnalyticsMethod(), polarizacion_familias: ['correr' as const, 'fuerza' as const] };
    const l = porId(lecturasIntensidad(entrada(SESIONES, { metodo })), 'intensidad.polarizacion')!;
    expect(l.dato?.valor).toBe(88); // (80 + 60) / 160 min
  });

  test('la holgura es del coach: con 25 puntos, el mismo 80/20/0 está «en tu reparto»', () => {
    const metodo = { ...defaultCoachAnalyticsMethod(), polarizacion_tolerancia_pts: 25 };
    const l = porId(lecturasIntensidad(entrada(SESIONES, { metodo })), 'intensidad.polarizacion')!;
    expect(l.veredicto).toMatchObject({ code: 'en_reparto', tono: 'bien', frase_es: null });
  });

  test('si el pulso no cubre el mínimo del coach, el número se queda y la palabra se retira', () => {
    const sesiones = [sesion('a', '2026-09-24', [tramo({ zonas: zonas([0, 1800, 0, 0, 0], 1800) })])];
    const l = porId(lecturasIntensidad(entrada(sesiones)), 'intensidad.polarizacion')!;
    expect(l.estado).toBe('medida');
    expect(l.dato?.valor).toBe(100);
    expect(l.veredicto).toBeNull();
    expect(l.cobertura.falta).toEqual({ por: 'sensor' });
  });

  test('la palabra la pone la banda que MÁS se pasa', () => {
    const obj = { low: 80, mid: 0, high: 20 };
    expect(veredictoReparto({ low: 80, mid: 5, high: 15 }, obj, 10).code).toBe('en_reparto');
    expect(veredictoReparto({ low: 55, mid: 30, high: 15 }, obj, 10).code).toBe('zona_media');
    expect(veredictoReparto({ low: 50, mid: 5, high: 45 }, obj, 10).code).toBe('demasiado_duro');
    expect(veredictoReparto({ low: 100, mid: 0, high: 0 }, obj, 10).code).toBe('demasiado_suave');
  });
});

describe('los cuatro estados', () => {
  test('vacío: sin sesiones en la ventana falta tiempo', () => {
    const ls = lecturasIntensidad(entrada([]));
    expect(porId(ls, 'intensidad.zonas')?.cobertura.falta).toEqual({ por: 'historia', llevas: 0, hacen: 28 });
    expect(porId(ls, 'intensidad.polarizacion')?.estado).toBe('sin_dato');
    expect(porId(ls, 'intensidad.z2')?.estado).toBe('sin_dato');
    expect(ls.some((l) => l.id.startsWith('intensidad.zonas.'))).toBe(false);
  });

  test('con pulso pero sin ancla (zonas congeladas sin umbral): falta el ancla', () => {
    const ls = lecturasIntensidad(entrada([sesion('a', '2026-09-24', [tramo({ zonas: zonas([0, 0, 0, 0, 0], 3600, null) })])]));
    expect(porId(ls, 'intensidad.zonas')?.cobertura.falta).toEqual({ por: 'ancla' });
  });

  test('sin pulso en ningún tramo: falta el sensor', () => {
    const ls = lecturasIntensidad(entrada([sesion('a', '2026-09-24', [tramo({ pulso_medio: null, zonas: zonas([0, 0, 0, 0, 0], 3600, null) })])]));
    expect(porId(ls, 'intensidad.zonas')?.cobertura.falta).toEqual({ por: 'sensor' });
  });
});

describe('el ritmo por zonas al correr', () => {
  const UMBRAL_RITMO: AnclaResuelta = { valor: 270, ancla: 'medida', fuente: 'perfil_test', explica_es: 'Medido en un test', desde_iso: '2026-06-01' };
  const ZONAS = resolveZonesForAthlete({ modality: 'run', threshold_s: 270, pace_unit: 'per_km' }, [...standardZonesFor('per_km')]);

  test('las seis bandas parten el eje sin huecos: cada zona va de su borde rápido al de la siguiente más suave', () => {
    // Umbral 4:30 → Z1 ≥ 314, Z2 298–312, Z3 286–296, Z4 270–284, Z5 264–268, Z6 256–262.
    expect(zonaDeRitmo(330, ZONAS)?.code).toBe('Z1');
    expect(zonaDeRitmo(313, ZONAS)?.code).toBe('Z2'); // el segundo entre Z2 y Z1
    expect(zonaDeRitmo(285, ZONAS)?.code).toBe('Z4');
    expect(zonaDeRitmo(269, ZONAS)?.code).toBe('Z5');
    expect(zonaDeRitmo(240, ZONAS)?.code).toBe('Z6'); // más rápido que todo: la última
  });

  test('cada tramo entero en la zona de su ritmo medio, corregido por la pendiente', () => {
    const sesiones = [
      sesion('a', '2026-09-24', [
        tramo({ segundos: 1200, ritmo_s: 330 }),
        tramo({ segundos: 600, ritmo_s: 300, pendiente_pct: 4 }), // 5:00 al 4 % ≈ 4:10 en llano → Z6
        tramo({ segundos: 300, ritmo_s: 280 }),
        tramo({ segundos: 300, modalidad: 'row', familia: 'remo', ritmo_s: 120 }),
      ]),
    ];
    const l = porId(lecturasIntensidad(entrada(sesiones, { ritmo_correr: { ancla: UMBRAL_RITMO, zonas: ZONAS } })), 'intensidad.ritmo.correr')!;
    expect(l.familia).toBe('correr');
    expect(l.dato?.valor).toBeCloseTo(2100 / 3600, 10);
    const partes = Object.fromEntries(l.reparto!.partes.map((p) => [p.code, p.valor * 3600]));
    expect(partes).toMatchObject({ Z1: 1200, Z4: 300, Z6: 600 });
    expect(l.procedencia.ancla).toBe('medida');
    expect(l.procedencia.explica_es).toMatch(/4:30\/km/);
  });

  test('sin umbral se pide; sin carreras en la ventana, se calla', () => {
    const corre = [sesion('a', '2026-09-24', [tramo({ ritmo_s: 300 })])];
    expect(porId(lecturasIntensidad(entrada(corre)), 'intensidad.ritmo.correr')?.cobertura.falta).toEqual({ por: 'ancla' });
    const rema = [sesion('a', '2026-09-24', [tramo({ modalidad: 'row', familia: 'remo', ritmo_s: 120 })])];
    expect(porId(lecturasIntensidad(entrada(rema)), 'intensidad.ritmo.correr')?.cobertura.falta).toEqual({ por: 'ocasion' });
  });
});

describe('la prosa', () => {
  test('una etiqueta a mitad de frase baja la inicial, pero no una sigla', () => {
    expect(aMitadDeFrase('Correr')).toBe('correr');
    expect(aMitadDeFrase('WOD')).toBe('WOD');
    expect(aMitadDeFrase('Estimado desde tu FC máxima')).toBe('estimado desde tu FC máxima');
    expect(aMitadDeFrase('')).toBe('');
  });

  test('el reparto nombra las familias sin romper las siglas', () => {
    const l = porId(lecturasIntensidad(entrada(SESIONES)), 'intensidad.polarizacion')!;
    expect(l.procedencia.explica_es).toMatch(/correr, remo, ski, bici, estaciones, WOD/);
    expect(l.procedencia.explica_es).toMatch(/\(estimado desde tu FC máxima\)/);
  });
});
