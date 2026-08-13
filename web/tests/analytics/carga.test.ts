// Pure unit tests for shared/domain/analytics/carga.ts (`lecturasCarga`) — las
// seis lecturas de carga (fondo, reciente, frescura, subida, cociente,
// cobertura), con o sin datos del atleta.
//
// No hay base de datos aquí: se construye `DailyTss[]` a mano, como
// tests/analytics/recuperacion.test.ts hace con `FilaBiometrica[]`.

import { describe, expect, test } from 'vitest';
import { lecturasCarga, type EntradaCarga } from '@fahybrid/shared/domain/analytics/carga';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import type { DailyTss } from '@fahybrid/shared/domain/training-load/banister';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';

const INICIO = '2026-01-01';

function dia(n: number): string {
  return isoDateString(addDays(parseIsoDate(INICIO), n));
}

function porId(lecturas: readonly Lectura[], id: string): Lectura {
  const l = lecturas.find((x) => x.id === id);
  if (!l) throw new Error(`no se encontró la lectura ${id}`);
  return l;
}

const SEIS_IDS = [
  'carga.fondo',
  'carga.reciente',
  'carga.frescura',
  'carga.subida',
  'carga.cociente',
  'carga.cobertura',
] as const;

function entrada(overrides: Partial<EntradaCarga> = {}): EntradaCarga {
  return {
    diario: [],
    metodo: defaultCoachAnalyticsMethod(),
    ventana_dias: 28,
    dias_de_historia: null,
    ...overrides,
  };
}

/** Un día con sesión REAL: segundos conocidos, con reparto medido/declarado. */
function diaEntrenado(
  n: number,
  opts: {
    tss?: number;
    known?: number;
    measured?: number;
    declared?: number;
    unknown?: number;
    unknownSessions?: number;
  } = {},
): DailyTss {
  const known = opts.known ?? 3600;
  const measured = opts.measured ?? known;
  const declared = opts.declared ?? Math.max(0, known - measured);
  return {
    date: dia(n),
    tss: opts.tss ?? 60,
    known_seconds: known,
    unknown_seconds: opts.unknown ?? 0,
    unknown_sessions: opts.unknownSessions ?? 0,
    measured_seconds: measured,
    declared_seconds: declared,
  };
}

/** Un día sin ejecutar nada. */
function diaVacio(n: number): DailyTss {
  return {
    date: dia(n),
    tss: 0,
    known_seconds: 0,
    unknown_seconds: 0,
    unknown_sessions: 0,
    measured_seconds: 0,
    declared_seconds: 0,
  };
}

function diario(n: number, build: (i: number) => DailyTss = (i) => diaEntrenado(i)): DailyTss[] {
  return Array.from({ length: n }, (_, i) => build(i));
}

// ---------------------------------------------------------------------------
// LAS SEIS, SIEMPRE
// ---------------------------------------------------------------------------

describe('las seis lecturas, siempre', () => {
  test('salen las seis con sus ids exactos, tenga o no datos el atleta', () => {
    const conDatos = lecturasCarga(entrada({ diario: diario(60), dias_de_historia: 60 }));
    const sinDatos = lecturasCarga(entrada({ diario: [] }));
    for (const lecturas of [conDatos, sinDatos]) {
      expect(lecturas).toHaveLength(6);
      expect(lecturas.map((l) => l.id).sort()).toEqual([...SEIS_IDS].sort());
    }
  });
});

// ---------------------------------------------------------------------------
// INVARIANTE DEL CONTRATO — recorrida en cada escenario
// ---------------------------------------------------------------------------

function expectContrato(lecturas: readonly Lectura[]) {
  expect(lecturas).toHaveLength(6);
  for (const l of lecturas) {
    if (l.estado === 'medida') {
      expect(l.dato).not.toBeNull();
    } else {
      expect(l.dato).toBeNull();
      expect(l.cobertura.falta).not.toBeNull();
    }
  }
}

describe('invariante del contrato: medida↔dato, sin_dato↔falta', () => {
  test.each<[string, EntradaCarga]>([
    ['sin historia', entrada({ diario: [] })],
    ['con historia completa', entrada({ diario: diario(120), dias_de_historia: 120 })],
    ['arranque en frío (poca historia)', entrada({ diario: diario(10), dias_de_historia: 10 })],
    [
      'sin trabajo reciente pero con historia real',
      entrada({
        diario: [...diario(100), ...Array.from({ length: 30 }, (_, i) => diaVacio(100 + i))],
        dias_de_historia: 130,
      }),
    ],
    [
      'chronic window sin carga (todo a cero)',
      entrada({ diario: Array.from({ length: 40 }, (_, i) => diaVacio(i)), dias_de_historia: 40 }),
    ],
  ])('%s: el contrato aguanta en las seis', (_label, e) => {
    expectContrato(lecturasCarga(e));
  });
});

// ---------------------------------------------------------------------------
// SIN HISTORIA
// ---------------------------------------------------------------------------

describe('sin historia (diario vacío)', () => {
  test('las seis salen sin_dato con falta.por === "historia", ni un cero', () => {
    const lecturas = lecturasCarga(entrada({ diario: [] }));
    expect(lecturas).toHaveLength(6);
    for (const l of lecturas) {
      expect(l.estado).toBe('sin_dato');
      expect(l.dato).toBeNull();
      expect(l.cobertura.falta).toMatchObject({ por: 'historia' });
    }
  });
});

// ---------------------------------------------------------------------------
// CARGA.COCIENTE — nunca un cero cuando no hay fondo
// ---------------------------------------------------------------------------

describe('carga.cociente — sin fondo en la ventana, nunca un cero', () => {
  test('40 días de diario, todos a cero: hay historia pero no hay fondo que comparar → sin_dato', () => {
    const diario40 = Array.from({ length: 40 }, (_, i) => diaVacio(i));
    const lecturas = lecturasCarga(entrada({ diario: diario40, dias_de_historia: 40 }));
    const cociente = porId(lecturas, 'carga.cociente');
    expect(cociente.estado).toBe('sin_dato');
    expect(cociente.dato).toBeNull();

    // Contraste explícito con fondo/reciente/frescura: una EWMA en cero SÍ es
    // una medida real (el atleta no entrenó, el fondo es 0 de verdad); el
    // cociente es una RATIO 0/0, y eso es indefinido, no cero.
    const fondo = porId(lecturas, 'carga.fondo');
    expect(fondo.estado).toBe('medida');
    expect(fondo.dato?.valor).toBe(0);
  });

  test('con fondo real, el cociente sí calcula (unidad ratio)', () => {
    const lecturas = lecturasCarga(entrada({ diario: diario(60), dias_de_historia: 60 }));
    const cociente = porId(lecturas, 'carga.cociente');
    expect(cociente.estado).toBe('medida');
    expect(cociente.dato?.unidad).toBe('ratio');
  });
});

// ---------------------------------------------------------------------------
// CARGA.SUBIDA — rampa nula
// ---------------------------------------------------------------------------

describe('carga.subida — rampa nula con poca serie', () => {
  test('menos de 8 días de serie: sin_dato', () => {
    const lecturas = lecturasCarga(entrada({ diario: diario(5), dias_de_historia: 5 }));
    const subida = porId(lecturas, 'carga.subida');
    expect(subida.estado).toBe('sin_dato');
    expect(subida.dato).toBeNull();
  });

  test('con 30 días de serie, la rampa sí calcula (unidad tss_semana)', () => {
    const lecturas = lecturasCarga(entrada({ diario: diario(30), dias_de_historia: 30 }));
    const subida = porId(lecturas, 'carga.subida');
    expect(subida.estado).toBe('medida');
    expect(subida.dato?.unidad).toBe('tss_semana');
  });
});

// ---------------------------------------------------------------------------
// LA SERIE SE RECORTA A ventana_dias; LA PORTADA SALE DEL DIARIO COMPLETO
// ---------------------------------------------------------------------------

describe('la serie dibujada se recorta a ventana_dias, la portada no', () => {
  test('200 días de diario, ventana_dias 28: la serie trae 28 puntos y la portada es la misma que sin recortar', () => {
    const diario200 = diario(200, (i) => diaEntrenado(i, { tss: 40 + (i % 10) }));
    const conVentana = lecturasCarga(entrada({ diario: diario200, ventana_dias: 28, dias_de_historia: 200 }));
    const sinRecorte = lecturasCarga(entrada({ diario: diario200, ventana_dias: 200, dias_de_historia: 200 }));

    for (const id of ['carga.fondo', 'carga.reciente', 'carga.frescura', 'carga.subida'] as const) {
      const recortada = porId(conVentana, id);
      const completa = porId(sinRecorte, id);
      expect(recortada.serie?.puntos).toHaveLength(28);
      // El número de portada NO depende de cuánto se dibuje: los puntos de
      // calentamiento sostienen el número y no se enseñan.
      expect(recortada.dato?.valor).toBe(completa.dato?.valor);
    }
  });
});

// ---------------------------------------------------------------------------
// CARGA.COBERTURA — el reparto
// ---------------------------------------------------------------------------

describe('carga.cobertura — el reparto suma el total, el pct suma ~100', () => {
  test('las tres partes (medido, declarado, sin_precio) suman el total declarado', () => {
    const d = diario(40, (i) =>
      diaEntrenado(i, {
        known: 3600,
        measured: 2400,
        unknown: i % 5 === 0 ? 600 : 0,
        unknownSessions: i % 5 === 0 ? 1 : 0,
      }),
    );
    const lecturas = lecturasCarga(entrada({ diario: d, dias_de_historia: 40 }));
    const cobertura = porId(lecturas, 'carga.cobertura');
    expect(cobertura.estado).toBe('medida');
    const partes = cobertura.reparto!.partes;
    expect(partes.map((p) => p.code).sort()).toEqual(['declarado', 'medido', 'sin_precio']);
    const sumaValores = partes.reduce((s, p) => s + p.valor, 0);
    expect(sumaValores).toBe(cobertura.reparto!.total);
    const sumaPct = partes.reduce((s, p) => s + (p.pct ?? 0), 0);
    expect(sumaPct).toBeCloseTo(100, 6);
  });

  test('total 0 (nada ejecutado en los últimos 28 días): sin_dato', () => {
    const lecturas = lecturasCarga(entrada({ diario: diario(40, (i) => diaVacio(i)), dias_de_historia: 40 }));
    const cobertura = porId(lecturas, 'carga.cobertura');
    expect(cobertura.estado).toBe('sin_dato');
    expect(cobertura.dato).toBeNull();
    expect(cobertura.cobertura.falta).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pct ES 0-100 EN TODO EL CONTRATO
// ---------------------------------------------------------------------------

describe('pct es 0-100 en todo el contrato, nunca una fracción', () => {
  test('cobertura.pct de las seis lecturas, y Parte.pct del reparto, viajan en 0-100', () => {
    const lecturas = lecturasCarga(entrada({ diario: diario(40), dias_de_historia: 40 }));
    for (const l of lecturas) {
      if (l.cobertura.pct != null) {
        expect(l.cobertura.pct).toBeGreaterThanOrEqual(0);
        expect(l.cobertura.pct).toBeLessThanOrEqual(100);
      }
    }
    const cobertura = porId(lecturas, 'carga.cobertura');
    for (const p of cobertura.reparto?.partes ?? []) {
      if (p.pct != null) {
        expect(p.pct).toBeGreaterThanOrEqual(0);
        expect(p.pct).toBeLessThanOrEqual(100);
      }
    }
    // Con TODO medido, el dato de cobertura ronda 100, no 1 — el cruce
    // fracción↔porcentaje que el comentario del fichero fuente avisa que
    // "ya estuvo a punto de servir un 0,87 rotulado como porcentaje".
    expect(cobertura.dato?.valor).toBeGreaterThan(1);
    expect(cobertura.dato?.referencia?.valor).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// EL MÉTODO MANDA
// ---------------------------------------------------------------------------

describe('el método del coach manda', () => {
  test('cambiar metodo.ctl_days cambia el fondo, sobre el mismo diario', () => {
    const d = diario(90, (i) => diaEntrenado(i, { tss: i < 45 ? 40 : 90 }));
    const metodo42 = { ...defaultCoachAnalyticsMethod(), ctl_days: 42 };
    const metodo28 = { ...defaultCoachAnalyticsMethod(), ctl_days: 28 };
    const fondo42 = porId(
      lecturasCarga(entrada({ diario: d, metodo: metodo42, dias_de_historia: 90 })),
      'carga.fondo',
    );
    const fondo28 = porId(
      lecturasCarga(entrada({ diario: d, metodo: metodo28, dias_de_historia: 90 })),
      'carga.fondo',
    );
    expect(fondo42.dato?.valor).not.toBe(fondo28.dato?.valor);
  });

  test('cambiar ramp_alert_tss_per_week cambia la REFERENCIA de carga.subida, no su VALOR', () => {
    const d = diario(30, (i) => diaEntrenado(i, { tss: 40 + i }));
    const metodoBase = { ...defaultCoachAnalyticsMethod(), ramp_alert_tss_per_week: 5 };
    const metodoAlto = { ...defaultCoachAnalyticsMethod(), ramp_alert_tss_per_week: 20 };
    const subidaBase = porId(
      lecturasCarga(entrada({ diario: d, metodo: metodoBase, dias_de_historia: 30 })),
      'carga.subida',
    );
    const subidaAlta = porId(
      lecturasCarga(entrada({ diario: d, metodo: metodoAlto, dias_de_historia: 30 })),
      'carga.subida',
    );
    expect(subidaBase.estado).toBe('medida');
    expect(subidaBase.dato?.valor).toBe(subidaAlta.dato?.valor);
    expect(subidaBase.dato?.referencia?.valor).toBe(5);
    expect(subidaAlta.dato?.referencia?.valor).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// PROCEDENCIA
// ---------------------------------------------------------------------------

describe('procedencia', () => {
  test('explica_es no vacío en las seis, y de distinto en las seis, con datos', () => {
    const lecturas = lecturasCarga(entrada({ diario: diario(60), dias_de_historia: 60 }));
    for (const l of lecturas) {
      expect(l.procedencia.explica_es.length).toBeGreaterThan(0);
    }
    const des = lecturas.map((l) => l.procedencia.de);
    expect(new Set(des).size).toBe(des.length);
  });

  test('lo mismo vale sin datos: la procedencia no depende de si hay lectura', () => {
    const lecturas = lecturasCarga(entrada({ diario: [] }));
    for (const l of lecturas) {
      expect(l.procedencia.explica_es.length).toBeGreaterThan(0);
    }
    const des = lecturas.map((l) => l.procedencia.de);
    expect(new Set(des).size).toBe(des.length);
  });
});

// ---------------------------------------------------------------------------
// BUGS — reportados, no arreglados (instrucción explícita: solo tests)
// ---------------------------------------------------------------------------

describe('BUGS encontrados en shared/domain/analytics/carga.ts', () => {
  // shared/domain/analytics/carga.ts:342 — cuando NO hay trabajo en los
  // últimos 28 días PERO el atleta sí tiene historia real (entrenó meses,
  // luego paró), `carga.cobertura` etiqueta el hueco como
  // `{ por: 'historia', llevas: 0, hacen: 28 }` — un `llevas` que contradice
  // el `dias_de_historia` recibido. El vocabulario `Falta`
  // (shared/domain/running/progress.ts) no tiene hoy un motivo para "sin
  // trabajo reciente" distinto de "historia insuficiente", así que el código
  // reutiliza 'historia' con un `llevas` fijo en vez de leído — y esa cifra es
  // una afirmación falsa: un atleta de 130 días de calendario que acaba de
  // descansar un mes vería "llevas 0 días", que es lo contrario de lo que la
  // función ya sabe (`dias_de_historia: 130` está en el propio argumento).
  //
  // Impacto real: bajo hoy mismo — `lecturasCarga` no tiene ningún caller
  // todavía (grep: solo se referencia desde su propio fichero y sus tests),
  // así que nada en producción sirve este número todavía. Lo dejo documentado
  // antes de que se conecte a un endpoint.
  test(
    'sin trabajo en los últimos 28 días pero con historia real, "llevas" refleja los días del atleta y no un 0',
    () => {
      const historiaLarga = [
        ...diario(100), // 100 días de entrenamiento real
        ...Array.from({ length: 30 }, (_, i) => diaVacio(100 + i)), // 30 días parados
      ];
      const lecturas = lecturasCarga(entrada({ diario: historiaLarga, dias_de_historia: 130 }));
      const cobertura = porId(lecturas, 'carga.cobertura');
      expect(cobertura.estado).toBe('sin_dato');
      // Lo que debería pasar: `llevas` refleja `dias_de_historia`. Hoy sale
      // 0 pase lo que pase (línea 342, `llevas: 0` literal).
      expect(cobertura.cobertura.falta).toMatchObject({ por: 'historia', llevas: 130 });
    },
  );

  // shared/domain/analytics/carga.ts:141 — `coberturaDeLaCarga` recorta con
  // `diario.slice(-ventana_dias)`, sin la misma guarda que `serieDe` (línea
  // 120: `ventana_dias > 0 ? slice(-ventana_dias) : slice()`) aplica para
  // cualquier `ventana_dias` no positivo. Con `ventana_dias` NEGATIVO,
  // `slice(-(-n)) === slice(n)`: ni "todo el diario" ni "los últimos n días",
  // sino "todo menos los primeros n días" — y `dias_ventana` sale con el
  // número negativo tal cual, así que `dias_con_dato` puede superar a
  // `dias_ventana`, rompiendo la invariante que el resto del contrato de
  // Cobertura da por sentada (ver tests/analytics/recuperacion.test.ts,
  // "la cobertura... nunca más días que la ventana").
  //
  // Impacto real: nulo hoy — `ventana_dias` solo llega desde
  // `VENTANAS_CARGA_SEMANAS` × 7 (siempre positivo). Robustez defensiva, no un
  // camino que un caller real recorra hoy.
  test('ventana_dias negativo se lee como «todo lo que haya» y la cobertura sigue siendo coherente', () => {
    const lecturas = lecturasCarga(entrada({ diario: diario(60), ventana_dias: -10, dias_de_historia: 60 }));
    const fondo = porId(lecturas, 'carga.fondo');
    expect(fondo.cobertura.dias_con_dato).toBeLessThanOrEqual(fondo.cobertura.dias_ventana);
  });
});
