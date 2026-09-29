// ¿Mejoro corriendo? (shared/domain/analytics/progreso-correr.ts +
// mejores-correr.ts + running/best-efforts.ts::mejorTiempoDentro).

import { describe, expect, test } from 'vitest';
import { mejorTiempoDentro } from '@fahybrid/shared/domain/running/best-efforts';
import {
  candidatosRecordCorrer,
  esfuerzosCorrer,
  type MarcaCarrera,
  type TramoCorrer,
} from '@fahybrid/shared/domain/analytics/mejores-correr';
import { progresoCorrer, type EntradaCorrer } from '@fahybrid/shared/domain/analytics/progreso-correr';
import { anclasVacias, type AnclaResuelta } from '@fahybrid/shared/domain/analytics/anclas';
import { defaultCoachRunningThresholds } from '@fahybrid/shared/domain/coach/running-thresholds';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { DEFAULT_HR_ZONE_FRACTIONS } from '@fahybrid/shared/domain/methodology/hr-zones';
import { resolverVentana } from '@fahybrid/shared/domain/analytics/ventana';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';

const HOY = '2026-09-29';
const ventana = resolverVentana({ clave: '4s', hoy_local: HOY, primera_sesion_iso: '2026-01-01' });

function porId(ls: readonly Lectura[], id: string): Lectura {
  const l = ls.find((x) => x.id === id);
  if (!l) throw new Error(`falta ${id}: ${ls.map((x) => x.id).join(', ')}`);
  return l;
}

let seq = 0;
function tramo(overrides: Partial<TramoCorrer> & Pick<TramoCorrer, 'dia'>): TramoCorrer {
  seq += 1;
  return {
    sesion_id: `s${seq}`,
    segundos: 0,
    metros: null,
    ritmo_s_km: null,
    pulso: null,
    pendiente_pct: null,
    contexto: 'calle',
    trabajo: true,
    tipo: null,
    esfuerzo: null,
    ...overrides,
  };
}

function entradaBase(overrides: Partial<EntradaCorrer> = {}): EntradaCorrer {
  return {
    ventana,
    tramos: [],
    trazas: [],
    marcas: [],
    desacoples: [],
    anclas: anclasVacias(),
    fracciones_hr: DEFAULT_HR_ZONE_FRACTIONS,
    umbrales: defaultCoachRunningThresholds(),
    metodo: defaultCoachAnalyticsMethod(),
    semanas_historia: 20,
    sin_historia: false,
    ...overrides,
  };
}

describe('mejorTiempoDentro — el mejor tramo dentro de la serie continua', () => {
  /** Traza sintética a 1 Hz: cada tramo corre `metros` a un ritmo de `paceSKm` s/km. */
  function traza(tramos: ReadonlyArray<{ paceSKm: number; metros: number }>) {
    const offsets: number[] = [0];
    const values: number[] = [0];
    let t = 0;
    let d = 0;
    for (const tr of tramos) {
      const duracion = Math.round((tr.paceSKm * tr.metros) / 1000);
      const speed = tr.metros / duracion;
      for (let s = 1; s <= duracion; s++) {
        t += 1;
        d += speed;
        offsets.push(t);
        values.push(d);
      }
    }
    return { offsets, values };
  }

  test('2 km a 300 s/km, 1 km a 240 s/km y 2 km a 300 s/km: el mejor 1000 m es el tramo rápido, ≈240 s', () => {
    const { offsets, values } = traza([
      { paceSKm: 300, metros: 2000 },
      { paceSKm: 240, metros: 1000 },
      { paceSKm: 300, metros: 2000 },
    ]);
    expect(mejorTiempoDentro(offsets, values, 1000)).toBeCloseTo(240, 0);
  });

  test('un hueco > 120 s entre muestras PARTE la serie: una ventana que lo cruzara no se usa', () => {
    // Dos tramos de 1000 m en 60 s, separados por un hueco de 190 s (> MAX_INTERPOLATION_GAP_S).
    const a = traza([{ paceSKm: 60, metros: 1000 }]);
    const offsets = [...a.offsets, ...a.offsets.map((t) => t + 60 + 190)];
    const values = [...a.values, ...a.values.map((d) => d + 1000)];
    // De punta a punta hay 2000 m, pero solo si no se partiera por el hueco.
    expect(mejorTiempoDentro(offsets, values, 2000)).toBeNull();
    // Dentro de cada mitad, 1000 m sí se alcanza (en 60 s).
    expect(mejorTiempoDentro(offsets, values, 1000)).toBeCloseTo(60, 0);
  });

  test('una distancia que retrocede (un reinicio del GPS) también parte la serie', () => {
    const offsets = [0, 10, 20, 30, 40, 50];
    const values = [0, 100, 200, 150, 250, 350]; // 150 < 200: retrocede
    // De punta a punta habría 350 m, pero cada tramo por separado cubre solo 200 m.
    expect(mejorTiempoDentro(offsets, values, 300)).toBeNull();
  });

  test('tolera un residuo de coma flotante de hasta 1e-6 m: no es un metro que falte', () => {
    // Muestras cada 100 s (sin huecos > 120 s) que rematan a 4999,99999999992 m
    // en vez de 5000 exactos: ruido de acumular floats, no un metro que falte.
    const offsets: number[] = [];
    const values: number[] = [];
    for (let t = 0; t <= 3000; t += 100) {
      offsets.push(t);
      values.push(t === 3000 ? 4999.99999999992 : (t / 3000) * 5000);
    }
    expect(mejorTiempoDentro(offsets, values, 5000)).toBeCloseTo(3000, 0);
  });
});

describe('progresoCorrer — la fila sin Motor usa el mejor esfuerzo del peldaño con dato en los dos periodos', () => {
  function entradaConCincoKm(semanas_historia: number): EntradaCorrer {
    return entradaBase({
      semanas_historia,
      tramos: [
        tramo({ dia: '2026-08-10', metros: 5000, segundos: 1500, contexto: 'calle' }), // ventana anterior
        tramo({ dia: '2026-09-10', metros: 5000, segundos: 1470, contexto: 'calle' }), // ventana actual
      ],
    });
  }

  test('sin ancla de pulso (sin Motor posible): la fila es el mejor 5000 m, en s/km', () => {
    const salida = progresoCorrer(entradaConCincoKm(20));
    expect(salida.fila.id).toBe('progreso.correr');
    expect(salida.fila.dato!.unidad).toBe('s_km');
    expect(salida.fila.dato!.valor).toBe(294); // 1470 / 5
    expect(salida.fila.comparacion!.unidad).toBe('s_km');
    expect(salida.fila.comparacion!.delta).toBeCloseTo(-6, 9); // (1470 - 1500) / 5
    expect(salida.fila.veredicto).toMatchObject({ code: 'mejor' });

    const detalle = porId(salida.detalle, 'correr.mejor.5000');
    expect(detalle.dato!.unidad).toBe('segundos');
    expect(detalle.comparacion!.unidad).toBe('s_km');
  });

  test('con menos semanas que `min_weeks_to_judge`: el número y la comparación se quedan, la palabra se retira', () => {
    const salida = progresoCorrer(entradaConCincoKm(2));
    expect(salida.fila.dato!.valor).toBe(294);
    expect(salida.fila.comparacion!.delta).toBeCloseTo(-6, 9);
    expect(salida.fila.veredicto).toBeNull();
    expect(salida.fila.cobertura.falta).toEqual({ por: 'historia', llevas: 2, hacen: 6 });
  });
});

describe('mejores-correr — contexto y procedencia de los candidatos a récord', () => {
  test('un 1000 m en cinta y uno en calle producen dos pruebas distintas', () => {
    const esf = esfuerzosCorrer({
      tramos: [
        tramo({ dia: '2026-01-01', metros: 1000, segundos: 200, contexto: 'calle' }),
        tramo({ dia: '2026-01-02', metros: 1000, segundos: 190, contexto: 'cinta' }),
      ],
      trazas: [],
      marcas: [],
    });
    const candidatos = candidatosRecordCorrer(esf);
    const calle = candidatos.find((c) => c.prueba === 'correr.1000');
    const cinta = candidatos.find((c) => c.prueba === 'correr.1000.cinta');
    expect(calle).toBeDefined();
    expect(cinta).toBeDefined();
    expect(calle!.valor).toBe(200);
    expect(cinta!.valor).toBe(190);
  });

  test('una marca registrada no la midió la app; una de test sí', () => {
    const marcas: MarcaCarrera[] = [
      { dia: '2026-01-01', slug: 'run_10k', segundos: 2400, contexto: 'calle', fuente: 'registrada' },
      { dia: '2026-01-02', slug: 'run_5k', segundos: 1200, contexto: 'calle', fuente: 'test' },
    ];
    const esf = esfuerzosCorrer({ tramos: [], trazas: [], marcas });
    const candidatos = candidatosRecordCorrer(esf);
    const registrada = candidatos.find((c) => c.prueba === 'correr.10000');
    const test_ = candidatos.find((c) => c.prueba === 'correr.5000');
    expect(registrada!.procedencia.medida).toBe(false);
    expect(test_!.procedencia.medida).toBe(true);
  });
});

describe('progresoCorrer — el Motor (ritmo al mismo pulso)', () => {
  const pulsoEstimado: AnclaResuelta = { valor: 170, ancla: 'estimada', fuente: 'from_max_hr', explica_es: 'x', desde_iso: null };

  // Zona 2 con fracciones 0,82–0,88 sobre 170 ppm → banda 139–150 → referencia 145 (punto medio).
  function tramoMotor(dia: string): TramoCorrer {
    return tramo({ dia, metros: 1500, ritmo_s_km: 300, pulso: 145, segundos: 450, contexto: 'calle' });
  }

  test('con ancla de pulso: el Motor sale en s/km al pulso de referencia, y encabeza la fila', () => {
    const e = entradaBase({
      anclas: { ...anclasVacias(), pulso: pulsoEstimado },
      tramos: [
        tramoMotor('2026-08-10'),
        tramoMotor('2026-08-17'),
        tramoMotor('2026-08-24'), // ventana anterior: 3 tramos
        tramoMotor('2026-09-05'),
        tramoMotor('2026-09-12'),
        tramoMotor('2026-09-19'), // ventana actual: 3 tramos
      ],
    });
    const salida = progresoCorrer(e);
    expect(salida.fila.titulo_es).toContain('Motor');

    const motor = porId(salida.detalle, 'correr.motor');
    expect(motor.dato!.valor).toBe(300); // el pulso del tramo (145) es EXACTAMENTE la referencia (145)
    expect(motor.procedencia.ancla).toBe('estimada');
  });

  test('sin ancla de pulso pero con pulso en los tramos → falta el TEST (ancla), no el sensor', () => {
    const e = entradaBase({ tramos: [tramoMotor('2026-09-05')] }); // anclas vacías por defecto
    const motor = porId(progresoCorrer(e).detalle, 'correr.motor');
    expect(motor.estado).toBe('sin_dato');
    expect(motor.cobertura.falta).toEqual({ por: 'ancla' });
  });

  test('sin pulso en ningún tramo → falta el SENSOR', () => {
    const e = entradaBase({ tramos: [tramo({ dia: '2026-09-05', metros: 5000, segundos: 1500, pulso: null })] });
    const motor = porId(progresoCorrer(e).detalle, 'correr.motor');
    expect(motor.estado).toBe('sin_dato');
    expect(motor.cobertura.falta).toEqual({ por: 'sensor' });
  });
});
