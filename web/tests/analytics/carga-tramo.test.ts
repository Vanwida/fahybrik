// La carga única por tramo (shared/domain/analytics/carga-tramo.ts): cada
// peldaño de la escalera, cada ancla, el resto de la sesión y el día.

import { describe, expect, test } from 'vitest';
import {
  anclaDeLaSerie,
  preciarSesion,
  preciarTramo,
  PENDIENTE_MAX_RITMO_PCT,
  ritmoEquivalenteLlano,
  serieDiaria,
  tssDe,
  type EntradaCargaTramo,
  type SesionHecha,
  type TramoHecho,
} from '@fahybrid/shared/domain/analytics/carga-tramo';
import { anclasVacias, wattsDeSplit500, type AnclaResuelta, type AnclasAtleta } from '@fahybrid/shared/domain/analytics/anclas';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { DEFAULT_HR_ZONE_FRACTIONS } from '@fahybrid/shared/domain/methodology/hr-zones';
import { intensityFromRpe } from '@fahybrid/shared/domain/training-load/tss';

const ancla = (valor: number, a: AnclaResuelta['ancla'] = 'medida'): AnclaResuelta => ({
  valor,
  ancla: a,
  fuente: 'test',
  explica_es: 'test',
  desde_iso: null,
});

function anclas(overrides: Partial<AnclasAtleta> = {}): AnclasAtleta {
  const base = anclasVacias();
  return {
    pulso: overrides.pulso ?? ancla(170),
    ritmo: { ...base.ritmo, run: ancla(240), row: ancla(120), ...(overrides.ritmo ?? {}) },
    potencia: { ...base.potencia, row: ancla(wattsDeSplit500(120)!), ...(overrides.potencia ?? {}) },
  };
}

function entrada(overrides: Partial<EntradaCargaTramo> = {}): EntradaCargaTramo {
  return { anclas: anclas(), metodo: defaultCoachAnalyticsMethod(), fracciones_hr: DEFAULT_HR_ZONE_FRACTIONS, ...overrides };
}

function tramo(overrides: Partial<TramoHecho> = {}): TramoHecho {
  return {
    segundos: 3600,
    modalidad: 'run',
    familia: 'correr',
    potencia_w: null,
    ritmo_s: null,
    pendiente_pct: null,
    pulso_medio: null,
    zonas: null,
    esfuerzo: null,
    ...overrides,
  };
}

const HORA = 3600;

describe('ritmo (correr)', () => {
  test('una hora al ritmo umbral = 100, por ritmo, con el ancla del umbral', () => {
    const p = preciarTramo(tramo({ ritmo_s: 240 }), null, entrada());
    expect(p.partes).toEqual([{ segundos: HORA, tss: 100, peldano: 'ritmo', ancla: 'medida' }]);
    expect(p.sin_saber_s).toBe(0);
  });

  test('en cuesta el ritmo se corrige por el coste energético: 5:00/km al 3 % cuesta como ~4:16 en llano', () => {
    expect(ritmoEquivalenteLlano(300, 3)).toBeCloseTo(255.6, 0);
    expect(ritmoEquivalenteLlano(300, null)).toBe(300);
    expect(ritmoEquivalenteLlano(300, -2)).toBeGreaterThan(300);
    expect(ritmoEquivalenteLlano(300, PENDIENTE_MAX_RITMO_PCT + 1)).toBeNull();
    const p = preciarTramo(tramo({ ritmo_s: 300, pendiente_pct: 3 }), null, entrada());
    expect(p.partes[0]!.peldano).toBe('ritmo');
    expect(p.partes[0]!.tss).toBeCloseTo(tssDe(HORA, 240 / 255.6), 0);
  });

  test('con una pendiente por encima del tope el ritmo no precia y cae al siguiente peldaño', () => {
    const p = preciarTramo(tramo({ ritmo_s: 300, pendiente_pct: 20, pulso_medio: 150 }), null, entrada());
    expect(p.partes[0]!.peldano).toBe('pulso');
  });

  test('una ancla POBLACIONAL de ritmo no precia; una estimada sí, marcada', () => {
    const est = preciarTramo(tramo({ ritmo_s: 240 }), null, entrada({ anclas: anclas({ ritmo: { run: ancla(240, 'estimada'), row: null, ski: null, bike: null } }) }));
    expect(est.partes[0]).toMatchObject({ peldano: 'ritmo', ancla: 'estimada' });
    const pob = preciarTramo(tramo({ ritmo_s: 240 }), 6, entrada({ anclas: anclas({ ritmo: { run: ancla(240, 'poblacional'), row: null, ski: null, bike: null } }) }));
    expect(pob.partes[0]!.peldano).toBe('esfuerzo');
  });
});

describe('potencia (ergo) — cúbica, no lineal', () => {
  test('una hora al split umbral = 100 por potencia', () => {
    const p = preciarTramo(tramo({ modalidad: 'row', familia: 'remo', ritmo_s: 120 }), null, entrada());
    expect(p.partes[0]).toMatchObject({ peldano: 'potencia', ancla: 'medida' });
    expect(p.partes[0]!.tss).toBeCloseTo(100, 3);
  });

  test('un 1:45 contra un umbral de 2:00 vale 1,49 en vatios (no 1,14 en ritmo)', () => {
    const p = preciarTramo(tramo({ modalidad: 'row', familia: 'remo', ritmo_s: 105 }), null, entrada());
    // (120/105)³ = 1,4927 → IF² ≈ 2,228 → 222,8 en una hora
    expect(p.partes[0]!.tss).toBeCloseTo(222.8, 0);
    expect(p.partes[0]!.tss).toBeGreaterThan(200);
  });

  test('los vatios medidos mandan sobre el split', () => {
    const p = preciarTramo(tramo({ modalidad: 'row', familia: 'remo', ritmo_s: 105, potencia_w: wattsDeSplit500(120)! }), null, entrada());
    expect(p.partes[0]!.tss).toBeCloseTo(100, 1);
  });

  test('sin umbral de esa máquina, el ergo cae al pulso o al esfuerzo', () => {
    const p = preciarTramo(tramo({ modalidad: 'ski', familia: 'ski', ritmo_s: 130, pulso_medio: 153 }), null, entrada());
    expect(p.partes[0]!.peldano).toBe('pulso');
    expect(p.partes[0]!.tss).toBeCloseTo(tssDe(HORA, 153 / 170), 6);
  });
});

describe('pulso', () => {
  test('con segundos por zona congelados, cada zona a la intensidad media de su banda; el hueco sin pulso cae al esfuerzo', () => {
    const p = preciarTramo(
      tramo({
        modalidad: 'other',
        familia: 'wod',
        segundos: 4200,
        zonas: { por_zona: { 1: 0, 2: 1800, 3: 0, 4: 1800, 5: 0 }, sin_pulso_s: 600, ancla: 'medida' },
      }),
      6,
      entrada(),
    );
    const z2 = (0.82 + 0.88) / 2;
    const z4 = (0.95 + 1.02) / 2;
    expect(p.partes.map((x) => x.peldano)).toEqual(['pulso', 'pulso', 'esfuerzo']);
    expect(p.partes[0]!.tss).toBeCloseTo(tssDe(1800, z2), 6);
    expect(p.partes[1]!.tss).toBeCloseTo(tssDe(1800, z4), 6);
    expect(p.partes[2]).toMatchObject({ segundos: 600, ancla: null });
    expect(p.partes.reduce((a, x) => a + x.segundos, 0)).toBe(4200);
  });

  test('unas zonas congeladas con ancla poblacional no valen: se usa el pulso medio contra el umbral vigente', () => {
    const p = preciarTramo(
      tramo({ modalidad: 'other', familia: 'wod', pulso_medio: 136, zonas: { por_zona: { 1: 0, 2: 3600, 3: 0, 4: 0, 5: 0 }, sin_pulso_s: 0, ancla: 'poblacional' } }),
      null,
      entrada(),
    );
    expect(p.partes).toEqual([{ segundos: HORA, tss: tssDe(HORA, 136 / 170), peldano: 'pulso', ancla: 'medida' }]);
  });

  test('con pulso pero solo un umbral de la edad y sin esfuerzo: no se sabe, y se apunta que había pulso', () => {
    const p = preciarTramo(tramo({ modalidad: 'other', familia: 'otro', pulso_medio: 150 }), null, entrada({ anclas: anclas({ pulso: ancla(156, 'poblacional') }) }));
    expect(p.partes).toEqual([]);
    expect(p.sin_saber_s).toBe(HORA);
    expect(p.sin_saber_con_pulso_s).toBe(HORA);
  });
});

describe('esfuerzo', () => {
  test('fuerza a RPE 8 por sRPE; el coeficiente del coach la escala; el RPE fraccionario interpola', () => {
    const e = entrada();
    const p8 = preciarTramo(tramo({ modalidad: 'strength', familia: 'fuerza', esfuerzo: 8 }), null, e);
    expect(p8.partes[0]).toMatchObject({ peldano: 'esfuerzo', ancla: null });
    expect(p8.partes[0]!.tss).toBeCloseTo(tssDe(HORA, 0.93), 6);

    const mitad = entrada({ metodo: { ...defaultCoachAnalyticsMethod(), fuerza_coeficiente: 0.5 } });
    expect(preciarTramo(tramo({ modalidad: 'strength', familia: 'fuerza', esfuerzo: 8 }), null, mitad).partes[0]!.tss).toBeCloseTo(tssDe(HORA, 0.93) / 2, 6);

    expect(intensityFromRpe(7.5)).toBeCloseTo((0.85 + 0.93) / 2, 9);
    expect(intensityFromRpe(7)).toBe(0.85);
    expect(intensityFromRpe(Number.NaN)).toBeNull();
  });

  test('sin esfuerzo del tramo manda el de la sesión; sin ninguno, no se sabe', () => {
    const conSesion = preciarTramo(tramo({ modalidad: 'strength', familia: 'fuerza' }), 5, entrada());
    expect(conSesion.partes[0]!.tss).toBeCloseTo(tssDe(HORA, 0.7), 6);
    const sinNada = preciarTramo(tramo({ modalidad: 'strength', familia: 'fuerza' }), null, entrada());
    expect(sinNada.sin_saber_s).toBe(HORA);
    expect(sinNada.sin_saber_con_pulso_s).toBe(0);
  });

  test('el orden es del coach: pulso antes que ritmo al correr', () => {
    const metodo = defaultCoachAnalyticsMethod();
    metodo.fuentes_run = ['pulso', 'ritmo', 'esfuerzo'];
    const p = preciarTramo(tramo({ ritmo_s: 240, pulso_medio: 150 }), null, entrada({ metodo }));
    expect(p.partes[0]!.peldano).toBe('pulso');
  });
});

describe('la sesión', () => {
  const sesion = (overrides: Partial<SesionHecha> = {}): SesionHecha => ({
    id: 's1',
    dia: '2026-06-01',
    segundos: HORA,
    rpe: null,
    pulso_medio: null,
    tramos: [],
    ...overrides,
  });

  test('el resto que ningún tramo cubre se precia con el RPE de la sesión', () => {
    const s = preciarSesion(sesion({ rpe: 5, tramos: [tramo({ segundos: 1800, ritmo_s: 240 })] }), entrada());
    expect(s.tss).toBeCloseTo(50 + tssDe(1800, 0.7), 6);
    expect(s.partes.map((p) => p.peldano)).toEqual(['ritmo', 'esfuerzo']);
    expect(s.por_familia.correr?.tss).toBeCloseTo(50, 6);
    expect(s.por_familia.otro?.segundos).toBe(1800);
  });

  test('el resto con pulso medio de sesión va por pulso antes que por esfuerzo', () => {
    const s = preciarSesion(sesion({ rpe: 5, pulso_medio: 136, tramos: [tramo({ segundos: 1800, ritmo_s: 240 })] }), entrada());
    expect(s.partes[1]).toMatchObject({ peldano: 'pulso', segundos: 1800 });
  });

  test('sin ninguna evidencia: tss null, todo sin saber, un tramo que pedir', () => {
    const s = preciarSesion(sesion(), entrada());
    expect(s.tss).toBeNull();
    expect(s.sin_saber_s).toBe(HORA);
    expect(s.sin_saber_tramos).toBe(1);
  });

  test('una sesión de duración cero cuesta 0, no null', () => {
    expect(preciarSesion(sesion({ segundos: 0 }), entrada()).tss).toBe(0);
  });

  test('un tramo no reclama más tiempo del que le queda a la sesión', () => {
    const s = preciarSesion(sesion({ segundos: 1800, tramos: [tramo({ segundos: 3600, ritmo_s: 240 })] }), entrada());
    expect(s.partes[0]!.segundos).toBe(1800);
    expect(s.tss).toBeCloseTo(50, 6);
  });
});

describe('el día', () => {
  test('serieDiaria: contigua, ceros reales, desglose por ancla y peldaño', () => {
    const e = entrada({ anclas: anclas({ pulso: ancla(170, 'estimada') }) });
    const s1 = preciarSesion({ id: 'a', dia: '2026-06-01', segundos: HORA, rpe: null, pulso_medio: null, tramos: [tramo({ ritmo_s: 240 })] }, e);
    const s2 = preciarSesion({ id: 'b', dia: '2026-06-03', segundos: HORA, rpe: 6, pulso_medio: null, tramos: [tramo({ modalidad: 'other', familia: 'wod', segundos: 1800, pulso_medio: 150 })] }, e);
    const s3 = preciarSesion({ id: 'c', dia: '2026-06-03', segundos: 600, rpe: null, pulso_medio: null, tramos: [] }, e);
    const dias = serieDiaria([s1, s2, s3], ['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(dias.map((d) => d.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(dias[1]).toMatchObject({ tss: 0, sesiones: 0, known_seconds: 0 });
    expect(dias[0]!.por_ancla.medida).toBe(HORA);
    expect(dias[0]!.measured_seconds).toBe(HORA);
    expect(dias[2]).toMatchObject({ sesiones: 2, unknown_seconds: 600, unknown_sessions: 1 });
    expect(dias[2]!.por_ancla.estimada).toBe(1800);
    expect(dias[2]!.declared_seconds).toBe(1800);
    expect(dias[2]!.por_peldano.pulso).toBe(1800);
    expect(anclaDeLaSerie(dias)).toBe('estimada');
  });
});
