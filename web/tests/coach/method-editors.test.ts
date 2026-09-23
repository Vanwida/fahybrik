// El método que ya era dato del coach y ahora tiene editor (pre-FLEXR): las
// reglas que validan lo que escribe, la cadencia de tests que decide «Toca test»,
// el huso del coach en el «hoy» del panel, las zonas prescribibles del modelo y
// la pendiente del coach en la lectura de carrera. Todo puro.

import { describe, expect, it } from 'vitest';
import { DEFAULT_COACH_HR_METHOD } from '@fahybrid/shared/domain/coach/hr-method';
import {
  hrMethodProblem,
  paceZonesProblem,
  runningThresholdsPatchSchema,
} from '@fahybrid/shared/domain/methodology/method-editors';
import { STANDARD_ZONES_PER_KM } from '@fahybrid/shared/domain/methodology';
import {
  DEFAULT_TEST_RETEST_WEEKS,
  normalizeTestRetestWeeks,
  testDueDays,
} from '@fahybrid/shared/domain/coach/test-cadence';
import { startOfDayInTz, timezoneCity, todayInTz } from '@fahybrid/shared/domain/coach/coach-timezone';
import { isoDateString } from '@fahybrid/shared/domain/dates';
import { runStructureSchema, structureToLegacy, prescriptionSchema } from '@fahybrid/shared/domain/prescription';
import { SEQUENCE_DAYS_MAX, SEQUENCE_DAYS_MIN, sequenceDaysPerWeek } from '@fahybrid/shared/schema/program-sequences';
import { levelCriteriaSchema } from '@fahybrid/shared/domain/coach/level-editor';
import { coachCalendar } from '@/lib/dashboard/athletes/plan-facts';
import { snoozeUntilDate } from '@/lib/coach/attention/overrides';
import { decidirLectura, type TramoLeido } from '@/components/v2/carrera/modelo';

describe('bandas de FC: lo que no puede guardarse', () => {
  it('los defectos son coherentes', () => {
    expect(hrMethodProblem(DEFAULT_COACH_HR_METHOD)).toBeNull();
  });
  it('dice qué zona se solapa', () => {
    expect(hrMethodProblem({ ...DEFAULT_COACH_HR_METHOD, z3_lo_frac: 0.85 })).toMatch(/Z3/);
  });
  it('el reparto suma 100', () => {
    expect(hrMethodProblem({ ...DEFAULT_COACH_HR_METHOD, polarization_high_pct: 25 })).toMatch(/100/);
  });
  it('lo fácil acaba antes que lo medio', () => {
    expect(
      hrMethodProblem({ ...DEFAULT_COACH_HR_METHOD, polarization_low_max_zone: 3, polarization_mid_max_zone: 3 }),
    ).toMatch(/fácil/);
  });
});

describe('zonas de ritmo: seis, sin solapes, la de umbral en el umbral', () => {
  const edit = STANDARD_ZONES_PER_KM.map((z) => ({ label: z.label, low_offset_s: z.low_offset_s, high_offset_s: z.high_offset_s }));
  it('el estándar vale', () => expect(paceZonesProblem(edit)).toBeNull());
  it('Z1 sin techo', () => {
    expect(paceZonesProblem(edit.map((z, i) => (i === 0 ? { ...z, high_offset_s: 60 } : z)))).toMatch(/Z1/);
  });
  it('la de umbral empieza en 0', () => {
    expect(paceZonesProblem(edit.map((z, i) => (i === 3 ? { ...z, low_offset_s: 2 } : z)))).toMatch(/umbral/);
  });
  it('una zona no pisa la anterior', () => {
    expect(paceZonesProblem(edit.map((z, i) => (i === 2 ? { ...z, high_offset_s: 30 } : z)))).toMatch(/Z3/);
  });
  it('seis, ni una menos', () => expect(paceZonesProblem(edit.slice(0, 5))).toMatch(/6/));
});

describe('umbrales de carrera: por clave, con sus límites', () => {
  it('acepta una clave y null (= su defecto)', () => {
    expect(runningThresholdsPatchSchema.safeParse({ gradient_retires_pace_pct: 6 }).success).toBe(true);
    expect(runningThresholdsPatchSchema.safeParse({ gradient_retires_pace_pct: null }).success).toBe(true);
  });
  it('rechaza fuera de rango, decimales donde no toca y claves inventadas', () => {
    expect(runningThresholdsPatchSchema.safeParse({ gradient_retires_pace_pct: 40 }).success).toBe(false);
    expect(runningThresholdsPatchSchema.safeParse({ min_weeks_to_judge: 6.5 }).success).toBe(false);
    expect(runningThresholdsPatchSchema.safeParse({ nope: 1 }).success).toBe(false);
  });
});

describe('cortes de un nivel: la marca va por sexo cuando es un tiempo', () => {
  it('tiempos por sexo, sentadilla para todos', () => {
    expect(levelCriteriaSchema.safeParse({ criteria: [{ metric: 'run_5k_s', sex: 'male', threshold: 1300 }] }).success).toBe(true);
    expect(levelCriteriaSchema.safeParse({ criteria: [{ metric: 'run_5k_s', sex: null, threshold: 1300 }] }).success).toBe(false);
    expect(levelCriteriaSchema.safeParse({ criteria: [{ metric: 'squat_bw', sex: null, threshold: 1.4 }] }).success).toBe(true);
    expect(levelCriteriaSchema.safeParse({ criteria: null }).success).toBe(true);
  });
});

describe('cadencia de tests → «Toca test»', () => {
  it('sin dato, el defecto: la repetición más corta', () => {
    expect(testDueDays(null)).toBe(Math.min(...DEFAULT_TEST_RETEST_WEEKS) * 7);
  });
  it('el coach que repite a las 8 y 10 semanas no recibe el aviso a las 5', () => {
    expect(testDueDays([10, 8])).toBe(56);
  });
  it('guardar el defecto o nada es volver al defecto (null)', () => {
    expect(normalizeTestRetestWeeks([12, 6])).toBeNull();
    expect(normalizeTestRetestWeeks([])).toBeNull();
    expect(normalizeTestRetestWeeks([8, 4, 8])).toEqual([4, 8]);
  });
});

describe('el «hoy» del coach es el de su huso', () => {
  // 23 sept 23:30 en Madrid = 22 sept 17:30 en Ciudad de México.
  const now = new Date('2026-09-23T21:30:00Z');
  it('día del calendario por huso', () => {
    expect(todayInTz(now, 'Europe/Madrid')).toBe('2026-09-23');
    expect(todayInTz(now, 'America/Mexico_City')).toBe('2026-09-23');
    expect(todayInTz(new Date('2026-09-23T23:30:00Z'), 'Europe/Madrid')).toBe('2026-09-24');
    expect(todayInTz(new Date('2026-09-23T23:30:00Z'), 'America/Mexico_City')).toBe('2026-09-23');
    expect(isoDateString(startOfDayInTz(new Date('2026-09-23T23:30:00Z'), 'America/Mexico_City'))).toBe('2026-09-23');
  });
  it('la semana del calendario del coach cambia a SU medianoche', () => {
    // Domingo 27 sept 23:30 UTC: en Madrid ya es lunes 28; en México sigue siendo domingo.
    const sunday = new Date('2026-09-27T23:30:00Z');
    expect(coachCalendar(sunday, 'Europe/Madrid').week_start).toBe('2026-09-28');
    expect(coachCalendar(sunday, 'America/Mexico_City').week_start).toBe('2026-09-21');
    expect(coachCalendar(sunday).week_start).toBe('2026-09-28');
  });
  it('posponer 1 d vence a la medianoche del coach', () => {
    const until = snoozeUntilDate('1d', new Date('2026-09-23T10:00:00Z'), 'America/Mexico_City');
    // Medianoche del 24 en México (UTC−6) = 06:00 UTC.
    expect(until.toISOString()).toBe('2026-09-24T06:00:00.000Z');
    expect(snoozeUntilDate('1d', new Date('2026-09-23T10:00:00Z')).toISOString()).toBe('2026-09-23T22:00:00.000Z');
  });
  it('la ciudad del huso para los correos', () => {
    expect(timezoneCity('Europe/Madrid')).toBe('Madrid');
    expect(timezoneCity('America/Mexico_City')).toBe('Mexico City');
  });
});

describe('las zonas prescribibles son las del modelo', () => {
  const run = (target: object) => [
    { role: 'main', elements: [{ kind: 'work', measure: { type: 'distance', m: 200 }, target }] },
  ];
  it('Z6 de ritmo se puede prescribir, y la línea plana que sale sigue siendo válida', () => {
    const parsed = runStructureSchema.safeParse(run({ type: 'pace_zone', zone: 6 }));
    expect(parsed.success).toBe(true);
    const legacy = structureToLegacy(parsed.data!);
    expect(prescriptionSchema.safeParse({ ...legacy, structure: parsed.data }).success).toBe(true);
  });
  it('en FC el modelo tiene cinco: Z6 de FC no', () => {
    expect(runStructureSchema.safeParse(run({ type: 'hr_zone', zone: 6 })).success).toBe(false);
    expect(runStructureSchema.safeParse(run({ type: 'pace_zone', zone: 7 })).success).toBe(false);
  });
});

describe('días por semana de un grupo: 1 a 7', () => {
  it('lo que tiene una semana', () => {
    expect([SEQUENCE_DAYS_MIN, SEQUENCE_DAYS_MAX]).toEqual([1, 7]);
    expect(sequenceDaysPerWeek.safeParse(2).success).toBe(true);
    expect(sequenceDaysPerWeek.safeParse(7).success).toBe(true);
    expect(sequenceDaysPerWeek.safeParse(8).success).toBe(false);
  });
});

describe('la pendiente que retira el ritmo es la del coach', () => {
  const tramo = (n: number, pendientePct: number): TramoLeido => ({
    position: n,
    n,
    papel: 'trabajo',
    fase: 'main',
    modo: null,
    distanciaM: 400,
    duracionS: 90,
    ritmoSkm: 225,
    fcMediaPpm: null,
    pendientePct,
    inicioS: null,
    veredicto: 'dentro',
    veredictoDuracion: null,
    banda: null,
  });
  const resumen = { total: 2, evaluable: 2, dentro: 2, fuera_rapido: 0, fuera_lento: 0, sin_dato: 0, pct_dentro: 100 };
  const ctx = { hayCurva: false, nKilometros: 0, zonaPedida: null, segundosEnZona: null, veredictoUnico: null };
  const tramos = [tramo(1, 5), tramo(2, 5)];
  it('con el defecto (3 %), un 5 % retira el ritmo', () => {
    expect(decidirLectura(tramos, resumen, ctx).eje).toBe('tiempo');
  });
  it('un coach de trail que lo retira al 8 % sigue juzgando por ritmo', () => {
    expect(decidirLectura(tramos, resumen, { ...ctx, pendienteQueRetiraPct: 8 }).eje).not.toBe('tiempo');
  });
});
