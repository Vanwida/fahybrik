import { describe, expect, test } from 'vitest';
import { parseNotationCell } from '@fahybrid/shared/domain/import/notation';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import type { WeekDay } from '@fahybrid/shared/schema/program-templates';
import { gridFromWeeks } from '@/lib/dashboard/programming/grid-model';
import {
  itemPrescription,
  progressDay,
  progressPrescription,
  progressRange,
} from '@/lib/dashboard/programming/progress-ops';
import { dayVolume, volumeParts, volumeTimeLabel } from '@/lib/dashboard/programming/week-volume';

const parse = (t: string): Prescription => parseNotationCell(t)[0]!.prescription;

function dayOf(dow: number, ...lines: string[]): WeekDay {
  return {
    day_of_week: dow,
    sessions: [
      {
        kind: 'workout',
        template_id: null,
        blocks: lines.map((l, i) => ({
          uid: `b${i}`,
          format: 'sets',
          title: l,
          items: [{ uid: `i${i}`, exercise_id: 1, exercise_name: l, prescription_json: parse(l) }],
        })),
      },
    ],
  };
}

const first = (d: WeekDay): Prescription => itemPrescription(d.sessions[0]!.blocks![0]!.items[0]!);

describe('carga', () => {
  test('%RM sube PUNTOS por semana (75 → 77,5 → 80), también en rangos', () => {
    const p = parse('sentadilla 5x5 @75%');
    expect(progressPrescription(p, { kind: 'load', pct: 2.5 }, 1).sets![0]!.target).toEqual({ kind: 'percent_rm', value: 77.5 });
    expect(progressPrescription(p, { kind: 'load', pct: 2.5 }, 2).sets![4]!.target).toEqual({ kind: 'percent_rm', value: 80 });
    const r = progressPrescription(parse('press banca 4x4 @78-80% r90'), { kind: 'load', pct: 2.5 }, 1);
    expect(r.sets![0]!.target).toEqual({ kind: 'percent_rm', min: 80.5, max: 82.5 });
    expect(r.sets![0]!.rest_s).toBe(90);
  });

  test('kg se multiplica y se redondea a 0,5 kg; RPE, zonas y ritmos no se tocan', () => {
    expect(progressPrescription(parse('sentadilla 100kg 5x5'), { kind: 'load', pct: 2.5 }, 1).sets![0]!.target).toEqual({ kind: 'kg', value: 102.5 });
    const z2 = parse("45' carrera z2");
    expect(progressPrescription(z2, { kind: 'load', pct: 2.5 }, 3).target).toEqual(z2.target);
    const rpe = parse('burpees 5x10 @rpe8');
    expect(progressPrescription(rpe, { kind: 'load', pct: 5 }, 1)).toEqual(rpe);
  });

  test('una carga negativa baja (y nunca pasa del 100 % ni baja de 0)', () => {
    expect(progressPrescription(parse('sentadilla 5x5 @75%'), { kind: 'load', pct: -10 }, 1).sets![0]!.target).toEqual({ kind: 'percent_rm', value: 65 });
    expect(progressPrescription(parse('sentadilla 5x5 @98%'), { kind: 'load', pct: 2.5 }, 2).sets![0]!.target).toEqual({ kind: 'percent_rm', value: 100 });
  });
});

describe('series', () => {
  test('+1 serie copia la última de trabajo; en intervalos suma también la ronda', () => {
    expect(progressPrescription(parse('sentadilla 5x5 @75%'), { kind: 'sets', n: 1 }, 1).sets).toHaveLength(6);
    const iv = progressPrescription(parse("8x400m r1' z4"), { kind: 'sets', n: 1 }, 2);
    expect(iv.sets).toHaveLength(10);
    expect(iv.rounds).toBe(10);
  });
  test('las series de aproximación no cuentan ni se tocan', () => {
    const p = parse('sentadilla 5x5 @75%');
    p.sets = [{ ...p.sets![0]!, is_approach: true }, ...p.sets!];
    const out = progressPrescription(p, { kind: 'sets', n: -10 }, 1);
    expect(out.sets!.filter((s) => s.is_approach)).toHaveLength(1);
    expect(out.sets!.filter((s) => !s.is_approach)).toHaveLength(1);
  });
});

describe('descarga', () => {
  test('−30 % de volumen: 5 series → 4 (redondeo), 8 rondas → 6, 45′ → 31′30″', () => {
    expect(progressPrescription(parse('sentadilla 5x5 @75%'), { kind: 'deload', pct: 30 }, 0).sets).toHaveLength(4);
    const iv = progressPrescription(parse("8x400m r1' z4"), { kind: 'deload', pct: 30 }, 0);
    expect(iv.sets).toHaveLength(6);
    expect(iv.rounds).toBe(6);
    expect(progressPrescription(parse("45' carrera z2"), { kind: 'deload', pct: 30 }, 0).total_s).toBe(1890);
  });
  test('la intensidad no se toca en una descarga', () => {
    const out = progressPrescription(parse('sentadilla 5x5 @75%'), { kind: 'deload', pct: 50 }, 0);
    expect(out.sets![0]!.target).toEqual({ kind: 'percent_rm', value: 75 });
  });
});

describe('escalar volumen (factor, los dos sentidos)', () => {
  test('×1,2 sube: 5 series → 6, 45′ → 54′; la intensidad no se toca', () => {
    const up = progressPrescription(parse('sentadilla 5x5 @75%'), { kind: 'volume', factor: 1.2 }, 0);
    expect(up.sets).toHaveLength(6);
    expect(up.sets![5]!.target).toEqual({ kind: 'percent_rm', value: 75 });
    expect(progressPrescription(parse("45' carrera z2"), { kind: 'volume', factor: 1.2 }, 0).total_s).toBe(3240);
  });
  test('×0,7 es lo mismo que una descarga del 30 %', () => {
    const p = parse("8x400m r1' z4");
    expect(progressPrescription(p, { kind: 'volume', factor: 0.7 }, 0)).toEqual(
      progressPrescription(p, { kind: 'deload', pct: 30 }, 0),
    );
  });
  test('se acota a ×1,5 (y a ×0,2 por abajo)', () => {
    expect(progressPrescription(parse('sentadilla 4x5'), { kind: 'volume', factor: 3 }, 0).sets).toHaveLength(6);
    expect(progressPrescription(parse('sentadilla 10x5'), { kind: 'volume', factor: 0 }, 0).sets).toHaveLength(2);
  });
});

describe('rango', () => {
  test('la primera semana del rango es la base; cada semana suma un paso', () => {
    const w = [dayOf(1, 'sentadilla 5x5 @75%')];
    const g = gridFromWeeks([{ days: w }, { days: w }, { days: w }, { days: w }]);
    const writes = progressRange(g, { r0: 0, r1: 3, c0: 0, c1: 6 }, { kind: 'load', pct: 2.5 }, { rows: 4, cols: 7 });
    const byRow = (r: number) => first(writes.find((x) => x.row === r && x.col === 0)!.day).sets![0]!.target;
    expect([0, 1, 2, 3].map(byRow)).toEqual([
      { kind: 'percent_rm', value: 75 },
      { kind: 'percent_rm', value: 77.5 },
      { kind: 'percent_rm', value: 80 },
      { kind: 'percent_rm', value: 82.5 },
    ]);
  });

  test('params_json se re-deriva de la prescripción nueva', () => {
    const d = progressDay(dayOf(1, 'sentadilla 5x5 @75%'), { kind: 'sets', n: 1 }, 1);
    expect(d.sessions[0]!.blocks![0]!.items[0]!.params_json).toMatchObject({ sets: 6 });
  });
});

describe('volumen planificado', () => {
  test('suma series de fuerza, km y minutos de carrera; el tiempo es un suelo honesto', () => {
    const d = dayOf(1, 'sentadilla 5x5 @75%', "8x400m r1' z4", "45' carrera z2");
    d.sessions[0]!.blocks![1]!.items[0]!.prescription_json!.modality = 'run';
    const v = dayVolume(d);
    expect(v.strength_sets).toBe(5);
    expect(v.run_m).toBe(3200);
    expect(v.run_s).toBe(2700);
    // la fuerza por repeticiones no escribe reloj → el día se lee «≥»
    expect(v.open_sessions).toBe(1);
    expect(volumeTimeLabel(v)?.startsWith('≥')).toBe(true);
    expect(volumeParts(v).map((p) => p.key)).toEqual(['fuerza', 'carrera']);
  });
  test('un día vacío no tiene volumen ni etiqueta', () => {
    expect(volumeTimeLabel(dayVolume({ day_of_week: 1, sessions: [] }))).toBeNull();
  });
});

describe('una sola semana', () => {
  test('recibe un paso entero', () => {
    const g = gridFromWeeks([{ days: [dayOf(1, 'sentadilla 5x5 @75%')] }]);
    const [w] = progressRange(g, { r0: 0, r1: 0, c0: 0, c1: 0 }, { kind: 'load', pct: 2.5 }, { rows: 1, cols: 7 });
    expect(first(w!.day).sets![0]!.target).toEqual({ kind: 'percent_rm', value: 77.5 });
  });
});
