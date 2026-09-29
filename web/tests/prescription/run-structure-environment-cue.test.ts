// M3 (dónde se corre) y M8 (cue del coach) y el aviso por tramo, en la gramática de
// correr (docs/reloj-muneca/modelo.md §6). ADITIVO: lo que no trae el campo se
// comporta como hoy. Los casos salen de las sesiones reales asignadas que los pedían:
// 509 y 535 (cinta al 1 %, y el reloj asumía calle), 494 y 552 («mirar el pulso»).

import { describe, expect, test } from 'vitest';
import {
  flattenSegments,
  parsePrescription,
  prescriptionFromStructure,
  safeParseRunStructure,
  structureToLegacy,
  type RunStructure,
  type Segment,
  type SegmentTarget,
} from '@fahybrid/shared/domain/prescription';
import {
  RUN_ALERT_DIRECTIONS,
  RUN_CUE_MAX_LENGTH,
  RUN_ENVIRONMENTS,
} from '@fahybrid/shared/domain/prescription/run-structure';

const dist = (m: number) => ({ type: 'distance' as const, m });
const dur = (s: number) => ({ type: 'duration' as const, s });
const work = (measure: Segment['measure'], target: SegmentTarget | null, extra: Partial<Segment> = {}): Segment => ({
  kind: 'work',
  measure,
  target,
  ...extra,
});
const rec = (measure: Segment['measure'], extra: Partial<Segment> = {}): Segment => ({
  kind: 'recovery',
  measure,
  target: null,
  recovery_mode: 'trote',
  ...extra,
});
const paceZone = (zone: number): SegmentTarget => ({ type: 'pace_zone', zone });
const hrZone = (zone: number): SegmentTarget => ({ type: 'hr_zone', zone });
const rpe = (value: number): SegmentTarget => ({ type: 'rpe', value });
const one = (seg: Segment): RunStructure => [{ role: 'main', elements: [seg] }];
const ok = (s: RunStructure) => safeParseRunStructure(s).success;

describe('M3 · entorno: dónde se corre', () => {
  test('el vocabulario es el del kit del reloj y el de Swift: calle, cinta, pista', () => {
    expect(RUN_ENVIRONMENTS).toEqual(['calle', 'cinta', 'pista']);
  });

  test('509 y 535: una sesión de series en cinta al 1 %, con el entorno en cada tramo', () => {
    const cinta = { environment: 'cinta' as const, incline_pct: 1 };
    const s: RunStructure = [
      { role: 'warmup', elements: [work(dur(600), hrZone(1), cinta)] },
      {
        role: 'main',
        elements: [
          { times: 3, elements: [{ times: 6, elements: [work(dur(60), paceZone(4), cinta), rec(dur(60), cinta)] }] },
        ],
      },
      { role: 'cooldown', elements: [work(dur(300), hrZone(1), cinta)] },
    ];
    expect(ok(s)).toBe(true);
    const segs = flattenSegments(s);
    expect(segs).toHaveLength(2 + 36);
    expect(segs.every((seg) => seg.environment === 'cinta' && seg.incline_pct === 1)).toBe(true);
  });

  test('una cuesta en calle lleva inclinación sin ser cinta', () => {
    expect(ok(one(work(dist(200), rpe(9), { environment: 'calle', incline_pct: 8 })))).toBe(true);
  });

  test('la pista es plana: con inclinación se rechaza, con 0 % no', () => {
    expect(ok(one(work(dist(400), paceZone(4), { environment: 'pista', incline_pct: 3 })))).toBe(false);
    expect(ok(one(work(dist(400), paceZone(4), { environment: 'pista', incline_pct: 0 })))).toBe(true);
    expect(ok(one(work(dist(400), paceZone(4), { environment: 'pista' })))).toBe(true);
  });

  test('un entorno que no existe se rechaza', () => {
    expect(ok(one({ ...work(dist(400), null), environment: 'gimnasio' } as unknown as Segment))).toBe(false);
  });
});

describe('M8 · cue: coaching corto que llega a la muñeca', () => {
  test('494 y 552: «mirar el pulso» en un tramo, sin ser prescripción', () => {
    const s: RunStructure = [
      { role: 'main', elements: [work(dur(1200), hrZone(2), { cue: 'Mirar el pulso, no el ritmo' })] },
    ];
    expect(ok(s)).toBe(true);
    expect(flattenSegments(s)[0]!.cue).toBe('Mirar el pulso, no el ritmo');
  });

  test('se recorta y no admite vacío, saltos de línea ni más de una línea de muñeca', () => {
    const cue = (c: string) => ok(one(work(dur(60), null, { cue: c })));
    expect(cue('  Relaja los hombros  ')).toBe(true);
    expect(cue('')).toBe(false);
    expect(cue('   ')).toBe(false);
    expect(cue('primera\nsegunda')).toBe(false);
    expect(cue('x'.repeat(RUN_CUE_MAX_LENGTH))).toBe(true);
    expect(cue('x'.repeat(RUN_CUE_MAX_LENGTH + 1))).toBe(false);
  });

  test('parsePrescription recorta el cue y lo conserva en la estructura', () => {
    const p = prescriptionFromStructure(one(work(dur(1200), hrZone(2), { cue: '  Mirar el pulso  ' })));
    expect(parsePrescription(p).structure![0]!.elements[0]).toMatchObject({ cue: 'Mirar el pulso' });
  });
});

describe('aviso por tramo (alert): hacia dónde vibra', () => {
  test('el vocabulario: arriba, abajo, ambos, ninguno', () => {
    expect(RUN_ALERT_DIRECTIONS).toEqual(['arriba', 'abajo', 'ambos', 'ninguno']);
  });

  test('vale con un objetivo que se mide en vivo: ritmo, zona de ritmo o zona de pulso', () => {
    const pace: SegmentTarget = { type: 'pace', min_s: 225, max_s: 235 };
    for (const t of [pace, paceZone(3), hrZone(2)]) {
      for (const alert of RUN_ALERT_DIRECTIONS) expect(ok(one(work(dist(1000), t, { alert })))).toBe(true);
    }
  });

  test('sin nada que medir (sin objetivo o a RPE) un aviso es un dato contradictorio', () => {
    expect(ok(one(work(dist(1000), null, { alert: 'arriba' })))).toBe(false);
    expect(ok(one(work(dist(1000), rpe(7), { alert: 'ambos' })))).toBe(false);
    expect(ok(one(work(dist(1000), null)))).toBe(true);
  });

  test('un valor que no existe se rechaza', () => {
    expect(ok(one({ ...work(dist(1000), paceZone(3)), alert: 'solo-arriba' } as unknown as Segment))).toBe(false);
  });
});

describe('retrocompatibilidad: lo que no trae el campo se comporta como hoy', () => {
  const plain: RunStructure = [
    { role: 'warmup', elements: [work(dur(600), hrZone(1))] },
    { role: 'main', elements: [{ times: 6, elements: [work(dist(1000), paceZone(4)), rec(dur(90))] }] },
  ];

  test('una estructura sin campos nuevos valida igual y no se le inventa ninguno', () => {
    const parsed = safeParseRunStructure(plain);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    for (const seg of flattenSegments(parsed.data)) {
      expect(seg).not.toHaveProperty('environment');
      expect(seg).not.toHaveProperty('cue');
      expect(seg).not.toHaveProperty('alert');
    }
    expect(parsed.data).toEqual(plain);
  });

  test('el aplanado al modelo viejo (el que lee el iOS instalado) es idéntico con y sin los campos nuevos', () => {
    const decorated: RunStructure = [
      { role: 'warmup', elements: [work(dur(600), hrZone(1), { environment: 'cinta', incline_pct: 1, cue: 'Suave' })] },
      {
        role: 'main',
        elements: [{ times: 6, elements: [work(dist(1000), paceZone(4), { environment: 'cinta', alert: 'ambos' }), rec(dur(90))] }],
      },
    ];
    const strip = (s: RunStructure): RunStructure =>
      s.map((ph) => ({
        ...ph,
        elements: ph.elements.map((el) => {
          const walk = (e: (typeof ph.elements)[number]): (typeof ph.elements)[number] => {
            if ('times' in e) return { ...e, elements: e.elements.map(walk) };
            const rest = { ...e };
            delete rest.environment;
            delete rest.cue;
            delete rest.alert;
            return rest;
          };
          return walk(el);
        }),
      }));
    const legacyOf = (s: RunStructure) => structureToLegacy(s);
    // `incline_pct` no es un campo nuevo: se conserva; lo demás no cambia el aplanado.
    expect(legacyOf(decorated)).toEqual(legacyOf(strip(decorated)));
    // Y la estructura entera viaja en el cable dentro de la prescripción.
    const wire = parsePrescription(prescriptionFromStructure(decorated));
    expect(wire.structure).toEqual(decorated);
  });
});
