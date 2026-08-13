// El puro de recuperación — disciplinas, no camino feliz. Cada test construye
// `FilaBiometrica[]`/`RestingHrDay[]` a mano y llama a `lecturasRecuperacion`
// directamente: no hay base de datos aquí, el cable (`recuperacion-datos.ts`)
// no tiene test propio porque no le queda mecanismo que probar, solo I/O.
//
// `HASTA` y las horas de las muestras se fijan en UTC con `timezone: 'UTC'`
// para razonar en días de calendario simples; el test del sueño usa
// Europe/Madrid a propósito, porque es justo el que ejercita el cruce de las
// 18:00 locales.

import { describe, expect, test } from 'vitest';
import {
  lecturasRecuperacion,
  type EntradaRecuperacion,
  type FilaBiometrica,
} from '@fahybrid/shared/domain/analytics/recuperacion';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { HRV_BASELINE_FROM_DAYS, HRV_BASELINE_TO_DAYS } from '@fahybrid/shared/domain/biometrics/hrv-baseline';
import type { RestingHrDay } from '@fahybrid/shared/domain/biometrics/resting-hr';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';

const HASTA = '2026-08-12';

/** `n` días antes de `HASTA`, como ISO — la misma aritmética que usa el motor,
 *  para no tener que teclear fechas absolutas que podrían llevar mal la cuenta. */
function diaMenos(n: number): string {
  return isoDateString(addDays(parseIsoDate(HASTA), -n));
}

/** Una fila a mediodía UTC del día indicado — con `timezone: 'UTC'` cae de
 *  lleno en ese día de calendario, lejos de cualquier borde. */
function fila(metric: string, diaIso: string, value: number, source = 'garmin'): FilaBiometrica {
  return { metric_type: metric, recorded_at: new Date(`${diaIso}T12:00:00Z`), value_numeric: value, source };
}

function diaPulso(on: string, bpm: number): RestingHrDay {
  return {
    on,
    bpm,
    recorded_at: new Date(`${on}T00:01:05Z`),
    received_at: new Date(`${on}T15:19:41Z`),
  };
}

function entrada(overrides: Partial<EntradaRecuperacion> = {}): EntradaRecuperacion {
  return {
    filas: [],
    pulso_reposo_dias: [],
    hasta: HASTA,
    dias: 14,
    timezone: 'UTC',
    metodo: defaultCoachAnalyticsMethod(),
    ...overrides,
  };
}

function porId(lecturas: readonly Lectura[], id: string): Lectura {
  const l = lecturas.find((x) => x.id === id);
  if (!l) throw new Error(`no se encontró la lectura ${id}`);
  return l;
}

// `n` días distintos dentro de [desdeN, hastaN] días-atrás (inclusive), para
// poblar un basal sin escribir 15 líneas de `fila(...)` a mano.
function nochesEntre(metric: string, desdeN: number, hastaN: number, n: number, value: number): FilaBiometrica[] {
  const paso = Math.max(1, Math.floor((desdeN - hastaN) / Math.max(1, n - 1)));
  const out: FilaBiometrica[] = [];
  for (let i = 0; i < n; i++) {
    const diasAtras = Math.min(desdeN, hastaN + i * paso);
    out.push(fila(metric, diaMenos(diasAtras), value));
  }
  return out;
}

// ---------------------------------------------------------------------------
// VARIABILIDAD — la puerta nueva sobre el basal
// ---------------------------------------------------------------------------

describe('variabilidad — puerta de historia', () => {
  test('basal corto (aunque lo reciente esté bien) → sin_dato con las noches del basal', () => {
    const reciente = [fila('hrv', diaMenos(0), 40), fila('hrv', diaMenos(1), 41), fila('hrv', diaMenos(2), 39)];
    const basalCorto = [fila('hrv', diaMenos(20), 50), fila('hrv', diaMenos(25), 51)]; // 2 noches, hacen falta 14

    const v = porId(lecturasRecuperacion(entrada({ filas: [...reciente, ...basalCorto] })), 'recuperacion.variabilidad');
    expect(v.estado).toBe('sin_dato');
    expect(v.dato).toBeNull();
    expect(v.serie).toBeNull();
    expect(v.cobertura.falta).toEqual({ por: 'historia', llevas: 2, hacen: 14 });
    expect(v.procedencia.medida).toBe(false);
  });

  // Lo RECIENTE es la prueba de vida del aparato, y por eso manda sobre el
  // basal: un plazo solo se dibuja cuando esperando se cumple.
  test('reciente corto (con el basal ya lleno) → el aparato dejó de medir, no le falta historia', () => {
    const basalLleno = nochesEntre('hrv', HRV_BASELINE_FROM_DAYS - 1, HRV_BASELINE_TO_DAYS, 15, 50);
    const recienteCorto = [fila('hrv', diaMenos(1), 40)]; // 1 noche, hacen falta 3

    const v = porId(lecturasRecuperacion(entrada({ filas: [...basalLleno, ...recienteCorto] })), 'recuperacion.variabilidad');
    expect(v.estado).toBe('sin_dato');
    expect(v.cobertura.falta).toEqual({ por: 'dispositivo' });
  });

  // El caso REAL que lo destapó (atleta 67 en producción): 820 muestras y 31
  // noches, todas de hace más de un mes. Decirle «te faltan 3 noches» es un
  // contador clavado que no avanza por mucho que espere.
  test('historia entera pero antigua (el reloj dejó de enviar) → dispositivo, nunca un plazo que no avanza', () => {
    const viejas = nochesEntre('hrv', 60, 30, 31, 50);

    const v = porId(lecturasRecuperacion(entrada({ filas: viejas })), 'recuperacion.variabilidad');
    expect(v.estado).toBe('sin_dato');
    expect(v.cobertura.falta).toEqual({ por: 'dispositivo' });
  });

  test('con las dos ventanas llenas, calcula recent − baseline sobre las muestras crudas', () => {
    // Mismo caso que `hrv-baseline.test.ts` («con ambas ventanas, recent −
    // baseline, en ms y con signo»): basal a 50, reciente a 40 → delta −10.
    const basal = nochesEntre('hrv', HRV_BASELINE_FROM_DAYS - 1, HRV_BASELINE_TO_DAYS, 15, 50);
    const reciente = [
      fila('hrv', diaMenos(0), 40, 'healthkit'), // la muestra más reciente: la que debe ganar como proveedor
      fila('hrv', diaMenos(1), 40),
      fila('hrv', diaMenos(2), 40),
    ];

    const v = porId(lecturasRecuperacion(entrada({ filas: [...basal, ...reciente] })), 'recuperacion.variabilidad');
    expect(v.estado).toBe('medida');
    expect(v.dato).toEqual({ valor: 40, unidad: 'ms', referencia: { valor: 50, delta: -10, de: 'basal_60_14d' } });
    expect(v.procedencia.medida).toBe(true);
    expect(v.procedencia.proveedor).toBe('healthkit'); // la muestra más reciente de la ventana
  });
});

// ---------------------------------------------------------------------------
// PULSO EN REPOSO — el resolvedor se reutiliza, no se reimplementa
// ---------------------------------------------------------------------------

describe('pulso en reposo', () => {
  test('sin ninguna revisión nunca → sin_dato con dispositivo, nunca cero', () => {
    const p = porId(lecturasRecuperacion(entrada({ pulso_reposo_dias: [] })), 'recuperacion.pulso_reposo');
    expect(p.estado).toBe('sin_dato');
    expect(p.dato).toBeNull();
    expect(p.cobertura.falta).toEqual({ por: 'dispositivo' });
  });

  test('con la lectura de hoy y un basal, la referencia es la media del basal 60→14', () => {
    const dias = [
      diaPulso(diaMenos(0), 55),
      diaPulso(diaMenos(20), 50),
      diaPulso(diaMenos(25), 52),
    ];
    const p = porId(lecturasRecuperacion(entrada({ pulso_reposo_dias: dias })), 'recuperacion.pulso_reposo');
    expect(p.estado).toBe('medida');
    expect(p.dato).toEqual({ valor: 55, unidad: 'bpm', referencia: { valor: 51, delta: 4, de: 'basal_60_14d' } });
    // Es la lectura DE HOY: la fuente no es floja.
    expect(p.procedencia.medida).toBe(true);
  });

  test('una lectura vieja se enseña (nunca inventa hoy) pero `medida` avisa de que la fuente es floja', () => {
    const dias = [diaPulso(diaMenos(3), 52)]; // nada en `hasta`, algo hace 3 días
    const p = porId(lecturasRecuperacion(entrada({ pulso_reposo_dias: dias })), 'recuperacion.pulso_reposo');
    expect(p.estado).toBe('medida');
    expect(p.dato?.valor).toBe(52);
    expect(p.procedencia.medida).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SUEÑO — segundos → horas, y el día de DESPERTAR, no el de `recorded_at`
// ---------------------------------------------------------------------------

describe('sueño', () => {
  test('sleep_duration llega en segundos y se enseña en horas', () => {
    const filas = [{ metric_type: 'sleep_duration', recorded_at: new Date(`${HASTA}T08:00:00Z`), value_numeric: 27_000, source: 'garmin' }];
    const s = porId(lecturasRecuperacion(entrada({ filas })), 'recuperacion.sueno');
    expect(s.estado).toBe('medida');
    expect(s.dato?.valor).toBe(7.5); // 27000 s = 7,5 h
    expect(s.dato?.unidad).toBe('horas');
  });

  test('Garmin estampa el sueño en su INICIO (la noche anterior) y aun así cuenta para el día en que se despertó', () => {
    // 23:30 la noche del día anterior en Europe/Madrid (verano, UTC+2) → 21:30 UTC.
    const vispera = diaMenos(1);
    const filas: FilaBiometrica[] = [
      { metric_type: 'sleep_duration', recorded_at: new Date(`${vispera}T21:30:00Z`), value_numeric: 25_200, source: 'garmin' },
    ];
    const s = porId(lecturasRecuperacion(entrada({ filas, timezone: 'Europe/Madrid', dias: 3 })), 'recuperacion.sueno');
    expect(s.estado).toBe('medida');
    expect(s.dato?.valor).toBe(7); // 25200 s = 7 h, atribuidas a HASTA
    // El punto de HASTA en la serie lleva el dato; el de la víspera queda vacío.
    const puntos = s.serie?.puntos ?? [];
    expect(puntos.find((p) => p.t === HASTA)?.v).toBe(7);
    expect(puntos.find((p) => p.t === vispera)?.v).toBeNull();
  });

  test('la referencia de sueño es el objetivo del método, no un basal calculado', () => {
    const filas = [fila('sleep_duration', HASTA, 6 * 3600)]; // 6 h, contra objetivo de 8
    const metodo = { ...defaultCoachAnalyticsMethod(), sleep_target_hours: 8 };
    const s = porId(lecturasRecuperacion(entrada({ filas, metodo })), 'recuperacion.sueno');
    expect(s.dato?.referencia).toEqual({ valor: 8, delta: -2, de: 'objetivo_sueno' });
  });
});

// ---------------------------------------------------------------------------
// CALIDAD DE SUEÑO — Garmin en 'pct', Polar en 'score', mismo número
// ---------------------------------------------------------------------------

describe('calidad del sueño — normalización entre proveedores', () => {
  test('un score de Garmin y el mismo score de Polar salen con el mismo valor', () => {
    const garmin = entrada({ filas: [fila('sleep_score', HASTA, 78, 'garmin')] });
    const polar = entrada({ filas: [fila('sleep_score', HASTA, 78, 'polar')] });

    const lecturaGarmin = porId(lecturasRecuperacion(garmin), 'recuperacion.sueno_calidad');
    const lecturaPolar = porId(lecturasRecuperacion(polar), 'recuperacion.sueno_calidad');

    expect(lecturaGarmin.dato?.valor).toBe(78);
    expect(lecturaPolar.dato?.valor).toBe(78);
    expect(lecturaGarmin.dato?.unidad).toBe('puntos');
    expect(lecturaPolar.dato?.unidad).toBe('puntos');
    // La procedencia SÍ distingue quién la mandó, aunque el número sea igual.
    expect(lecturaGarmin.procedencia.proveedor).toBe('garmin');
    expect(lecturaPolar.procedencia.proveedor).toBe('polar');
  });
});

// ---------------------------------------------------------------------------
// SIN NINGUNA MUESTRA — hoy es el caso real de estrés, batería y calidad
// ---------------------------------------------------------------------------

describe('métricas sin ninguna muestra en producción', () => {
  test.each([
    ['recuperacion.sueno_calidad', 'sleep_score'],
    ['recuperacion.estres', 'stress'],
    ['recuperacion.bateria_corporal', 'body_battery'],
  ])('%s: sin filas de %s → sin_dato, dispositivo, dato null (nunca cero)', (id) => {
    // Otras métricas SÍ tienen datos alrededor, para probar que la ausencia es
    // por FALTA DE ESA fila, no porque el escenario esté vacío entero.
    const filas = [fila('weight', HASTA, 78)];
    const lectura = porId(lecturasRecuperacion(entrada({ filas })), id);
    expect(lectura.estado).toBe('sin_dato');
    expect(lectura.dato).toBeNull();
    expect(lectura.cobertura.falta).toEqual({ por: 'dispositivo' });
    expect(lectura.cobertura.muestras).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// COBERTURA Y SERIES
// ---------------------------------------------------------------------------

describe('cobertura y series', () => {
  test('los huecos de la serie viajan como null, nunca interpolados ni a cero', () => {
    const filas = [fila('weight', diaMenos(4), 80), fila('weight', diaMenos(0), 79)];
    const peso = porId(lecturasRecuperacion(entrada({ filas, dias: 5 })), 'recuperacion.peso');
    const puntos = peso.serie?.puntos ?? [];
    expect(puntos).toHaveLength(5);
    expect(puntos[0]).toEqual({ t: diaMenos(4), v: 80 });
    expect(puntos[1]).toEqual({ t: diaMenos(3), v: null });
    expect(puntos[2]).toEqual({ t: diaMenos(2), v: null });
    expect(puntos[3]).toEqual({ t: diaMenos(1), v: null });
    expect(puntos[4]).toEqual({ t: diaMenos(0), v: 79 });
  });

  test('la cobertura cuenta muestras reales y días con dato, nunca más días que la ventana', () => {
    // Un día con DOS muestras: `muestras` las cuenta las dos, `dias_con_dato` cuenta el día una vez.
    const filas = [
      fila('weight', diaMenos(9), 80),
      fila('weight', diaMenos(9), 80.2),
      fila('weight', diaMenos(3), 79),
    ];
    const peso = porId(lecturasRecuperacion(entrada({ filas, dias: 10 })), 'recuperacion.peso');
    expect(peso.cobertura.dias_ventana).toBe(10);
    expect(peso.cobertura.dias_con_dato).toBe(2);
    expect(peso.cobertura.muestras).toBe(3);
    // `pct` es 0-100 en todo el contrato de lecturas, no una fracción.
    expect(peso.cobertura.pct).toBeCloseTo(20, 5);
    // La misma disciplina para las siete, no solo peso.
    for (const l of lecturasRecuperacion(entrada({ filas, dias: 10 }))) {
      expect(l.cobertura.dias_con_dato).toBeLessThanOrEqual(l.cobertura.dias_ventana);
    }
  });

  test('peso declara su cobertura sin piedad: una muestra en 30 días sigue siendo una', () => {
    const filas = [fila('weight', diaMenos(2), 81.4)];
    const peso = porId(lecturasRecuperacion(entrada({ filas, dias: 30 })), 'recuperacion.peso');
    expect(peso.estado).toBe('medida');
    expect(peso.cobertura.muestras).toBe(1);
    expect(peso.cobertura.dias_con_dato).toBe(1);
    expect(peso.cobertura.pct).toBeCloseTo((1 / 30) * 100, 5);
  });

  test('una ventana sin días no divide por cero: pct null, cobertura en cero, nada revienta', () => {
    const filas = [fila('weight', HASTA, 80)];
    const lecturas = lecturasRecuperacion(entrada({ filas, dias: 0 }));
    expect(lecturas).toHaveLength(7);
    for (const l of lecturas) {
      expect(l.cobertura.dias_ventana).toBe(0);
      expect(l.cobertura.pct).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// EL INVARIANTE DE TIPOS, VERIFICADO EN TIEMPO DE EJECUCIÓN
// ---------------------------------------------------------------------------

describe('medida y sin_dato nunca se contradicen', () => {
  test('una lectura medida siempre trae dato; una sin_dato nunca trae dato', () => {
    // Mezcla deliberada: variabilidad y pulso en reposo sin nada, sueño con un
    // dato, para que la lista tenga de las dos clases.
    const filas = [fila('sleep_duration', HASTA, 7 * 3600), fila('weight', diaMenos(1), 80)];
    const lecturas = lecturasRecuperacion(entrada({ filas, dias: 10 }));
    expect(lecturas.length).toBeGreaterThan(0);
    const hayMedida = lecturas.some((l) => l.estado === 'medida');
    const haySinDato = lecturas.some((l) => l.estado === 'sin_dato');
    expect(hayMedida).toBe(true);
    expect(haySinDato).toBe(true);
    for (const l of lecturas) {
      if (l.estado === 'medida') {
        expect(l.dato).not.toBeNull();
      } else {
        expect(l.dato).toBeNull();
      }
    }
  });
});
