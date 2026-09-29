// buildGarminPlan + sesionGarmin — de la sesión de correr al plan compacto del reloj.
//
// Las sesiones reales (479, 494, 509, 511, 573 y las que no son de correr: 491,
// 513, 542) se escriben como el detalle de asignación que las produce y se miden
// contra los vectores de oro del códec (`tests/design-twin/fixtures/garmin-plan`):
// los mismos pasos que el doble ya dibuja. Donde el doble lleva algo que la
// prescripción no dice (el cue del coach, el sentido del aviso) o decide distinto
// (el nombre «tirada», la recuperación final de 511) se dice aquí.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Prescription, RunStructure } from '@fahybrid/shared/domain/prescription';
import type { AthleteHrZones } from '@fahybrid/shared/domain/methodology';
import { REGLAS_AVISO_DEFECTO, type PasoBase } from '@fahybrid/shared/domain/watch-plan';
import {
  aBase64,
  canonico,
  completarPlan,
  decodificarSesion,
  deBase64,
  codificarSesion,
  metaPorDefecto,
} from '@fahybrid/shared/domain/watch-plan/plan-compacto';
import {
  buildGarminPlan,
  type DetalleGarmin,
  type ResultadoPlanGarmin,
  type ZonasAtletaGarmin,
} from '@/lib/wearables/garmin-plan';
import { sesionGarmin } from '@/lib/wearables/garmin-plan-blob';

// ── El mundo del test ────────────────────────────────────────────────────────

const PULSO: AthleteHrZones = {
  lthr_bpm: 170,
  estimated: true,
  source: 'from_max_hr',
  confidence: 'estimated',
  bands: [
    { zone: 1, min_bpm: null, max_bpm: 138 },
    { zone: 2, min_bpm: 139, max_bpm: 150 },
    { zone: 3, min_bpm: 151, max_bpm: 160 },
    { zone: 4, min_bpm: 161, max_bpm: 173 },
    { zone: 5, min_bpm: 174, max_bpm: 192 },
  ],
};
const ZONAS: ZonasAtletaGarmin = { benchmarks: {}, coachZones: [], pulso: PULSO };
const SIN_ZONAS: ZonasAtletaGarmin = { benchmarks: {}, coachZones: [], pulso: null };

type El = RunStructure[number]['elements'][number];
const work = (measure: { m: number } | { s: number }, target: unknown = null, extra: object = {}): El =>
  ({ kind: 'work', measure: 'm' in measure ? { type: 'distance', m: measure.m } : { type: 'duration', s: measure.s }, target, ...extra }) as El;
const rec = (s: number, mode?: 'trote' | 'caminar' | 'parado'): El =>
  ({ kind: 'recovery', measure: { type: 'duration', s }, target: null, ...(mode ? { recovery_mode: mode } : {}) }) as El;
const rep = (times: number, ...elements: El[]): El => ({ times, elements }) as El;
const hr = (zone: number) => ({ type: 'hr_zone', zone });

const linea = (structure: RunStructure) => ({
  exercise_category: 'running',
  prescription_json: { modality: 'run', structure } as unknown as Prescription,
});
const detalle = (...lineas: RunStructure[]): DetalleGarmin => ({ blocks: [{ items: lineas.map(linea) }] });
const soloCorrer = (r: ResultadoPlanGarmin) => {
  if (!r.soportada) throw new Error(`no soportada: ${r.motivo}`);
  return r.plan;
};

/** Lo que el doble y el servidor dicen igual de un paso (sin el grupo, que el doble aún no lleva, ni la escala). */
const forma = (p: PasoBase) => ({
  clase: p.clase,
  rol: p.rol,
  fase: p.fase,
  medida: p.medida,
  modoRecupera: p.modoRecupera,
  posicion: p.posicion,
  bloque: p.bloque,
  objetivos: p.objetivos.map((o) => ({ eje: o.eje, min: o.min, max: o.max, papel: o.papel })),
});

const oro = (n: string) =>
  JSON.parse(readFileSync(resolve(__dirname, `../design-twin/fixtures/garmin-plan/${n}.json`), 'utf8')) as {
    plan: { pasos: PasoBase[]; zonas: { techos: number[] }; reglas: unknown };
    meta: { fitSport: number; fitSubSport: number; entorno: string | null };
  };

// ── Sesiones reales de correr ────────────────────────────────────────────────

describe('las sesiones reales de correr, contra los vectores de oro', () => {
  it('494 · Run 80′ @Z2: un rodaje continuo por tiempo con su vuelta de un kilómetro', () => {
    const plan = soloCorrer(buildGarminPlan(detalle([{ role: 'main', elements: [work({ s: 4800 }, hr(2))] }]), ZONAS));
    const golden = oro('494').plan;
    expect(plan.pasos).toHaveLength(1);
    const [p] = plan.pasos;
    expect(p).toMatchObject({ rol: 'trabajo', fase: 'principal', medida: golden.pasos[0]!.medida, vueltaAutoM: 1000, entorno: 'calle', cierre: 'medida' });
    expect(p!.objetivos).toEqual([{ eje: 'zona', min: 2, max: 2, papel: 'principal', escala: 'ppm' }]);
    // Las zonas de pulso son las mismas que el doble dibuja, y dicen que son estimadas.
    expect(plan.zonas).toEqual({ techos: golden.zonas.techos, procedencia: 'estimada' });
    expect(plan.reglas).toEqual(golden.reglas);
  });

  it('573 · tempo de 3950 m @Z4: continuo por distancia, medido por GPS', () => {
    const plan = soloCorrer(buildGarminPlan(detalle([{ role: 'main', elements: [work({ m: 3950 }, hr(4))] }]), ZONAS));
    expect(plan.pasos[0]!.medida).toEqual(oro('573').plan.pasos[0]!.medida);
    expect(plan.pasos[0]!.objetivos[0]).toMatchObject({ eje: 'zona', min: 4, max: 4 });
  });

  it('479 · la parte de correr (5′ Z2 · 6 × (800 m @Z5 / 2′30″ trote) · 3′ Z1) es la del doble, paso a paso', () => {
    const estructura: RunStructure = [
      { role: 'warmup', elements: [work({ s: 300 }, hr(2))] },
      { role: 'main', elements: [rep(6, work({ m: 800 }, hr(5)), rec(150, 'trote'))] },
      { role: 'cooldown', elements: [work({ s: 180 }, hr(1))] },
    ];
    // El sentido del aviso es método del coach: con su dato, los objetivos salen idénticos al doble.
    const plan = soloCorrer(
      buildGarminPlan(detalle(estructura), ZONAS, { sentidoAviso: { calentamiento: 'solo-arriba', 'vuelta-calma': 'solo-arriba' } }),
    );
    const golden = oro('479').plan.pasos;
    // El doble de 479 también lleva Wall Ball entre medias; la parte de correr son 12 pasos y la vuelta.
    expect(plan.pasos).toHaveLength(13);
    expect(plan.pasos.slice(0, 12).map(forma)).toEqual(golden.slice(0, 12).map(forma));
    expect(forma(plan.pasos[12]!)).toEqual({ ...forma(golden.at(-1)!), bloque: 2 });
  });

  it('509 · en cinta: 3 × (6 × (1′ / 1′ andando)) r 5′ es la misma cadena de 36 pasos que dibuja el doble', () => {
    const estructura: RunStructure = [
      { role: 'warmup', elements: [work({ s: 480 })] },
      { role: 'main', elements: [rep(3, rep(6, work({ s: 60 }), rec(60, 'caminar')), rec(300))] },
    ];
    const plan = soloCorrer(buildGarminPlan(detalle(estructura), ZONAS, { entorno: 'cinta' }));
    const golden = oro('509').plan.pasos;
    expect(plan.pasos).toHaveLength(36);
    // El doble no lleva modoRecupera en el descanso entre tandas; ni el servidor lo inventa.
    expect(plan.pasos.map(forma)).toEqual(golden.map(forma));
    expect(plan.pasos.every((p) => p.entorno === 'cinta')).toBe(true);
    expect(plan.pasos.filter((p) => p.medida.tipo === 'distancia')).toHaveLength(0);
  });

  it('511 · fartlek en cinta con inclinación: la zona manda y la inclinación acompaña', () => {
    const estructura: RunStructure = [
      { role: 'warmup', elements: [work({ s: 600 }, hr(2))] },
      {
        role: 'main',
        elements: [rep(2, rep(3, work({ s: 180 }, hr(4), { incline_pct: 1 }), rec(180, 'trote')), rec(180))],
      },
      { role: 'cooldown', elements: [work({ s: 480 })] },
    ];
    const plan = soloCorrer(buildGarminPlan(detalle(estructura), ZONAS, { entorno: 'cinta' }));
    const fart = plan.pasos.find((p) => p.clase === 'series' && p.rol === 'trabajo')!;
    expect(fart.objetivos).toEqual([
      { eje: 'zona', min: 4, max: 4, papel: 'principal', escala: 'ppm' },
      { eje: 'inclinacion', min: 1, max: 1, papel: 'secundario' },
    ]);
    // El doble conserva además la última recuperación de cada tanda (17 pasos); el servidor sigue la regla
    // «N series, N−1 descansos» y no la lleva (13). Una sesión con dato literal de ese descanso lo dirá el coach.
    expect(plan.pasos.filter((p) => p.clase === 'descanso-tandas')).toHaveLength(1);
    expect(plan.pasos.at(-1)).toMatchObject({ clase: 'vuelta-calma', fase: 'vuelta' });
  });
});

describe('lo que no es correr NO se degrada: soportada:false', () => {
  const fuerza = { exercise_category: 'strength', prescription_json: { modality: 'strength' } as unknown as Prescription };
  const corre = linea([{ role: 'main', elements: [work({ m: 1000 }, hr(2))] }]);

  it('491 · Run + Movilidad y 479 · Run + Wall Ball: una línea que no es de carrera, la sesión va en la app', () => {
    for (const otra of [{ ...fuerza, exercise_category: 'mobility' }, fuerza]) {
      expect(buildGarminPlan({ blocks: [{ items: [corre, otra] }] }, ZONAS)).toEqual({ soportada: false, motivo: 'fase_2' });
    }
  });

  it('513 · ergo y 542 · HYROX: ninguna línea de carrera, fase_2', () => {
    const ergo = { exercise_category: 'erg', prescription_json: { modality: 'row' } as unknown as Prescription };
    expect(buildGarminPlan({ blocks: [{ items: [ergo, ergo] }] }, ZONAS)).toEqual({ soportada: false, motivo: 'fase_2' });
    const hyrox = { exercise_category: 'hyrox', prescription_json: null };
    expect(buildGarminPlan({ blocks: [{ items: [corre, hyrox] }] }, ZONAS)).toEqual({ soportada: false, motivo: 'fase_2' });
  });

  it('sin detalle, sin líneas o con una línea de carrera sin estructura válida: sin_estructura, nunca un plan a medias', () => {
    expect(buildGarminPlan(null, ZONAS)).toEqual({ soportada: false, motivo: 'sin_estructura' });
    expect(buildGarminPlan({ blocks: [] }, ZONAS)).toEqual({ soportada: false, motivo: 'sin_estructura' });
    const vacia = { exercise_category: 'running', prescription_json: { modality: 'run' } as unknown as Prescription };
    expect(buildGarminPlan({ blocks: [{ items: [corre, vacia] }] }, ZONAS)).toEqual({ soportada: false, motivo: 'sin_estructura' });
  });
});

// ── Objetivos ────────────────────────────────────────────────────────────────

describe('los objetivos, contra ESTE atleta', () => {
  const principal = (target: unknown, zonas = ZONAS, extra: object = {}) =>
    soloCorrer(buildGarminPlan(detalle([{ role: 'main', elements: [work({ m: 1000 }, target, extra)] }]), zonas)).pasos[0]!.objetivos;

  it('un ritmo en banda viaja tal cual; el más rápido es el min (6 × 1000 m @3:45–3:55)', () => {
    expect(principal({ type: 'pace', min_s: 225, max_s: 235 })).toEqual([{ eje: 'ritmo', min: 225, max: 235, papel: 'principal' }]);
    expect(principal({ type: 'pace', value_s: 240 })).toEqual([{ eje: 'ritmo', min: 240, max: 240, papel: 'principal' }]);
  });

  it('una zona de ritmo se resuelve a banda ABSOLUTA con el umbral del atleta; sin umbral, el tramo va abierto', () => {
    const conUmbral: ZonasAtletaGarmin = { ...ZONAS, benchmarks: { time_threshold_pace_s_per_km: 270 } };
    const [o] = principal({ type: 'pace_zone', zone: 4 }, conUmbral);
    expect(o).toMatchObject({ eje: 'ritmo', papel: 'principal' });
    expect(o!.min).toBeLessThan(o!.max!);
    expect(Number.isInteger(o!.min) && Number.isInteger(o!.max)).toBe(true);
    expect(principal({ type: 'pace_zone', zone: 4 })).toEqual([]);
  });

  it('una zona de pulso sin ancla de pulso no inventa banda: abierto. El RPE viaja como RPE', () => {
    expect(principal(hr(3), SIN_ZONAS)).toEqual([]);
    expect(principal({ type: 'rpe', min: 6, max: 7 })).toEqual([{ eje: 'rpe', min: 6, max: 7, papel: 'principal' }]);
    expect(principal({ type: 'rpe', value: 8 })).toEqual([{ eje: 'rpe', min: 8, max: 8, papel: 'principal' }]);
  });

  it('un paso lleva a lo sumo dos objetivos: el principal y la inclinación; la cadencia no la desplaza', () => {
    expect(principal(hr(2), ZONAS, { incline_pct: 2, cadence_spm: 170 })).toHaveLength(2);
    expect(principal(hr(2), ZONAS, { incline_pct: 2, cadence_spm: 170 })[1]).toMatchObject({ eje: 'inclinacion' });
    expect(principal(null, ZONAS, { cadence_spm: 170 })).toEqual([{ eje: 'cadencia', min: 170, max: 170, papel: 'secundario' }]);
  });
});

// ── Estructura: grupos, posición y recuperaciones ───────────────────────────

describe('repeticiones, grupos y recuperaciones', () => {
  const principalDe = (...elements: El[]) => soloCorrer(buildGarminPlan(detalle([{ role: 'main', elements }]), ZONAS)).pasos;

  it('6 × (1000 m / r 90″): seis series de un mismo grupo, cinco recuperaciones y la posición «serie n/6»', () => {
    const pasos = principalDe(rep(6, work({ m: 1000 }), rec(90, 'trote')));
    expect(pasos).toHaveLength(11);
    const series = pasos.filter((p) => p.rol === 'trabajo');
    expect(series.map((p) => p.posicion)).toEqual([1, 2, 3, 4, 5, 6].map((n) => ({ serie: { n, de: 6 } })));
    expect(new Set(series.map((p) => JSON.stringify(p.grupo))).size).toBe(1);
    expect(series[0]!.grupo).toEqual({ id: 0, veces: 6 });
    expect(pasos.filter((p) => p.rol === 'recuperacion').every((p) => p.modoRecupera === 'trote' && p.grupo === undefined)).toBe(true);
    expect(pasos.every((p) => p.clase !== 'rodaje')).toBe(true);
  });

  it('dos tramos de trabajo en una misma repetición son dos grupos, no uno (una pirámide no se funde)', () => {
    const pasos = principalDe(rep(3, work({ m: 400 }), work({ m: 200 }), rec(60)));
    const ids = new Set(pasos.filter((p) => p.rol === 'trabajo').map((p) => p.grupo!.id));
    expect(ids.size).toBe(2);
  });

  it('en tandas, el grupo es el de la serie interior y se repite igual en cada tanda; la posición lleva tanda y serie', () => {
    const pasos = principalDe(rep(3, rep(4, work({ s: 60 }), rec(60)), rec(300)));
    const series = pasos.filter((p) => p.rol === 'trabajo');
    expect(series).toHaveLength(12);
    expect(new Set(series.map((p) => p.grupo!.id)).size).toBe(1);
    expect(series[0]!.grupo).toEqual({ id: 0, veces: 4 });
    expect(series[5]!.posicion).toEqual({ tanda: { n: 2, de: 3 }, serie: { n: 2, de: 4 } });
    expect(pasos.filter((p) => p.clase === 'descanso-tandas')).toHaveLength(2);
  });

  it('las fases: calentamiento, principal y vuelta; el bloque es el índice del elemento de primer nivel', () => {
    const plan = soloCorrer(
      buildGarminPlan(
        detalle([
          { role: 'warmup', elements: [work({ s: 600 }), work({ s: 120 })] },
          { role: 'main', elements: [rep(2, work({ m: 500 }), rec(60))] },
          { role: 'cooldown', elements: [work({ s: 300 })] },
        ]),
        ZONAS,
      ),
    );
    expect(plan.pasos.map((p) => [p.fase, p.clase, p.bloque])).toEqual([
      ['calentamiento', 'calentamiento', 0],
      ['calentamiento', 'calentamiento', 1],
      ['principal', 'series', 2],
      ['principal', 'recuperacion', 2],
      ['principal', 'series', 2],
      ['vuelta', 'vuelta-calma', 3],
    ]);
    expect(plan.pasos.map((p) => p.id)).toEqual(['0', '1', '2', '3', '4', '5']);
  });

  it('dos líneas de correr en la misma fase se funden en orden, sin perder ninguna', () => {
    const plan = soloCorrer(
      buildGarminPlan(
        detalle([{ role: 'main', elements: [work({ s: 300 })] }], [{ role: 'main', elements: [work({ m: 1000 })] }]),
        ZONAS,
      ),
    );
    expect(plan.pasos.map((p) => p.medida.tipo)).toEqual(['tiempo', 'distancia']);
  });
});

// ── Método del coach: dato, con defecto ──────────────────────────────────────

describe('el método del coach es dato; sin él, los defectos editables', () => {
  const uno = detalle([{ role: 'main', elements: [work({ m: 5000 }, hr(2))] }]);

  it('sin método: reglas por defecto, vuelta de 1000 m, calle; con método: el suyo', () => {
    const defecto = soloCorrer(buildGarminPlan(uno, ZONAS));
    expect(defecto.reglas).toEqual(REGLAS_AVISO_DEFECTO);
    expect(defecto.pasos[0]).toMatchObject({ vueltaAutoM: 1000, entorno: 'calle' });
    const reglas = { ...REGLAS_AVISO_DEFECTO, cadenciaS: 45, avisarEnRecuperacion: true };
    const suyo = soloCorrer(buildGarminPlan(uno, ZONAS, { reglas, vueltaAutoM: 400, entorno: 'pista' }));
    expect(suyo.reglas).toEqual(reglas);
    expect(suyo.pasos[0]).toMatchObject({ vueltaAutoM: 400, entorno: 'pista' });
  });

  it('en cinta la distancia la mide la cinta, no el GPS', () => {
    const p = soloCorrer(buildGarminPlan(uno, ZONAS, { entorno: 'cinta' })).pasos[0]!;
    expect(p.medida).toEqual({ tipo: 'distancia', prescrito: 5000, mide: 'cinta' });
  });

  it('una zona de pulso declarada o inferida se dice estimada; solo el test la hace medida', () => {
    const medida: AthleteHrZones = { ...PULSO, estimated: false, source: 'lthr_measured', confidence: 'measured' };
    expect(soloCorrer(buildGarminPlan(uno, { ...ZONAS, pulso: medida })).zonas?.procedencia).toBe('medida');
    const declarada: AthleteHrZones = { ...PULSO, estimated: false, source: 'lthr_declared', confidence: 'declared' };
    expect(soloCorrer(buildGarminPlan(uno, { ...ZONAS, pulso: declarada })).zonas?.procedencia).toBe('estimada');
    expect(soloCorrer(buildGarminPlan(uno, SIN_ZONAS)).zonas).toBeNull();
  });

  it('es determinista: mismo detalle, mismas zonas y mismo método → mismo plan', () => {
    expect(buildGarminPlan(uno, ZONAS, {})).toEqual(buildGarminPlan(uno, ZONAS, {}));
  });
});

// ── El blob ──────────────────────────────────────────────────────────────────

describe('sesionGarmin · lo que viaja por el cable', () => {
  const seisPorMil = () =>
    buildGarminPlan(
      detalle([
        { role: 'warmup', elements: [work({ s: 900 })] },
        { role: 'main', elements: [rep(6, work({ m: 1000 }, { type: 'pace', min_s: 225, max_s: 235 }), rec(90, 'trote'))] },
        { role: 'cooldown', elements: [work({ s: 600 })] },
      ]),
      ZONAS,
    );

  it('el blob decodifica al mismo plan que se construyó, con el id y la huella también fuera del blob', () => {
    const r = seisPorMil();
    const s = sesionGarmin(494, '2026-10-01', r);
    expect(s).toMatchObject({ asignacion_id: 494, fecha: '2026-10-01', soportada: true });
    expect(s.motivo).toBeUndefined();
    const { meta, plan } = decodificarSesion(deBase64(s.plan!));
    expect(meta).toMatchObject({ asignacionId: 494, huella: s.huella, fitSport: 1, fitSubSport: 0, entorno: 'calle' });
    if (!r.soportada) throw new Error('debía ser soportada');
    expect(canonico(plan)).toEqual(canonico(completarPlan(r.plan)));
  });

  it('el sub-deporte del FIT sigue al entorno: genérico en calle, cinta y pista', () => {
    const sub = (entorno: 'calle' | 'cinta' | 'pista') => {
      const r = buildGarminPlan(detalle([{ role: 'main', elements: [work({ s: 600 })] }]), ZONAS, { entorno });
      return decodificarSesion(deBase64(sesionGarmin(1, '2026-10-01', r).plan!)).meta.fitSubSport;
    };
    expect([sub('calle'), sub('cinta'), sub('pista')]).toEqual([0, 1, 4]);
  });

  it('la huella cambia si cambia el plan y no si se pide dos veces', () => {
    const a = sesionGarmin(1, '2026-10-01', seisPorMil());
    expect(sesionGarmin(1, '2026-10-01', seisPorMil()).huella).toBe(a.huella);
    const otra = buildGarminPlan(detalle([{ role: 'main', elements: [work({ m: 800 })] }]), ZONAS);
    expect(sesionGarmin(1, '2026-10-01', otra).huella).not.toBe(a.huella);
  });

  it('una sesión no soportada no lleva plan ni huella, y dice por qué', () => {
    expect(sesionGarmin(7, '2026-10-02', { soportada: false, motivo: 'fase_2' })).toEqual({
      asignacion_id: 7,
      fecha: '2026-10-02',
      huella: null,
      soportada: false,
      motivo: 'fase_2',
    });
  });

  it('más de 200 pasos no se parte: demasiado_grande', () => {
    // 20 × (20 × (trabajo / recuperación)) son 800 pasos.
    const r = buildGarminPlan(detalle([{ role: 'main', elements: [rep(20, rep(20, work({ s: 30 }), rec(30)), rec(60))] }]), ZONAS);
    expect(sesionGarmin(1, '2026-10-01', r)).toMatchObject({ soportada: false, motivo: 'demasiado_grande', huella: null });
  });

  it('un valor que el cable no admite (id de más de 31 bits) deja esa sesión en la app, no tira la semana', () => {
    const r = buildGarminPlan(detalle([{ role: 'main', elements: [work({ s: 600 })] }]), ZONAS);
    expect(sesionGarmin(2 ** 40, '2026-10-01', r)).toMatchObject({ soportada: false, motivo: 'no_codificable' });
  });

  it('el binario es el del códec: los mismos bytes que codificar a mano', () => {
    const r = seisPorMil();
    if (!r.soportada) throw new Error('debía ser soportada');
    const plan = completarPlan(r.plan);
    const meta = metaPorDefecto(plan, { asignacionId: 9, fitSport: 1, fitSubSport: 0, entorno: 'calle' });
    expect(sesionGarmin(9, '2026-10-01', r).plan).toBe(aBase64(codificarSesion(plan, meta)));
  });
});
