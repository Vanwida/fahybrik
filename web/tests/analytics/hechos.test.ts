// Puro de hechos.ts — la capa que decide qué FRASES puede afirmar la
// pantalla, y sobre todo, cuáles NO. No hay base de datos aquí: cada test
// construye a mano la `Lectura[]` que `hechosDe` recibe, con los mismos
// constructores (`lecturaMedida`/`lecturaSinDato`) que usan `carga.ts` y
// `recuperacion.ts`, para que un hecho nunca pueda citar algo que la lista de
// entrada no sostiene.
//
// LA REGLA CENTRAL, COMO HELPER ÚNICO
// ------------------------------------
// `hechosAuditados` es la ÚNICA puerta de entrada a `hechosDe` en este
// fichero: además de devolver los hechos, verifica en cada llamada que (a)
// cada id de `de[]` existe en la lista de lecturas Y está `medida` — la regla
// que hace el sistema auditable —, y (b) los invariantes generales (id único,
// frase sin jerga de motor, frase no vacía, `de` no vacío). Así "aplícalo en
// TODOS los tests" no es una promesa: es la única forma de llamar a la
// función bajo prueba.

import { describe, expect, test } from 'vitest';
import { hechosDe, type Hecho } from '@fahybrid/shared/domain/analytics/hechos';
import { defaultCoachAnalyticsMethod, type CoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import {
  lecturaMedida,
  lecturaSinDato,
  type Cobertura,
  type Lectura,
  type Parte,
  type Procedencia,
  type PuntoSerie,
} from '@fahybrid/shared/domain/analytics/lectura';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';

const INICIO = '2026-01-01';

function dia(n: number): string {
  return isoDateString(addDays(parseIsoDate(INICIO), n));
}

const METODO = defaultCoachAnalyticsMethod();

const COBERTURA_DEFECTO: Omit<Cobertura, 'falta'> = {
  muestras: 30,
  dias_ventana: 30,
  dias_con_dato: 30,
  pct: 100,
};

const PROCEDENCIA_DEFECTO: Procedencia = {
  de: 'test',
  explica_es: 'Lectura construida para el test.',
  medida: true,
  proveedor: null,
};

/** Ninguna frase de atleta puede llevar jerga de motor. */
const JERGA_DE_MOTOR = ['TSS', 'CTL', 'ATL', 'TSB', 'HRV', 'RPE', '%RM'] as const;

/**
 * LA ÚNICA PUERTA A `hechosDe` EN ESTE FICHERO.
 *
 * Antes de devolver los hechos, comprueba — sobre la MISMA `lecturas` que se
 * le pasó a `hechosDe` — que:
 *   1. cada id de `de[]` aparece en `lecturas` con `estado === 'medida'` (la
 *      regla que hace el sistema auditable: un hecho no puede citar una
 *      lectura que no existe o que está apagada);
 *   2. los invariantes generales del contrato `Hecho` se sostienen: id único
 *      dentro del array, `frase_es` vacía, `de` no
 *      vacío.
 */
function hechosAuditados(lecturas: readonly Lectura[], metodo: CoachAnalyticsMethod = METODO): Hecho[] {
  const hechos = hechosDe(lecturas, metodo);

  const ids = hechos.map((h) => h.id);
  expect(new Set(ids).size, 'los ids de los hechos devueltos deben ser únicos').toBe(ids.length);

  for (const h of hechos) {
    expect(h.frase_es, `frase_es de ${h.id} se queda vacía`).toBe('');
    for (const termino of JERGA_DE_MOTOR) {
      expect(h.frase_es, `frase_es de ${h.id} no puede llevar jerga de motor ("${termino}")`).not.toContain(termino);
    }
    expect(h.de.length, `de[] de ${h.id} no puede estar vacío`).toBeGreaterThan(0);
    for (const id of h.de) {
      const l = lecturas.find((x) => x.id === id);
      expect(l, `${h.id} cita "${id}" pero esa lectura no está en la lista de entrada`).toBeDefined();
      expect(l!.estado, `${h.id} cita "${id}" pero esa lectura no está medida`).toBe('medida');
    }
  }
  return hechos;
}

// ---------------------------------------------------------------------------
// CONSTRUCTORES DE LECTURAS — mismos constructores que carga.ts/recuperacion.ts
// ---------------------------------------------------------------------------

/** `carga.fondo` medida, con una serie de `longitud` puntos donde solo los
 *  DOS EXTREMOS importan: `subidaDelFondo` únicamente lee el primero y el
 *  último. Los puntos intermedios interpolan solo para que la serie no
 *  parezca absurda si alguien la inspecciona en un fallo de test. */
function lecturaFondoDeExtremos(antes: number | null, ahora: number | null, longitud = 15): Lectura {
  const puntos: PuntoSerie[] = Array.from({ length: longitud }, (_, i) => {
    if (i === 0) return { t: dia(i), v: antes };
    if (i === longitud - 1) return { t: dia(i), v: ahora };
    const interpolado =
      antes != null && ahora != null ? Math.round(antes + ((ahora - antes) * i) / (longitud - 1)) : 0;
    return { t: dia(i), v: interpolado };
  });
  return lecturaMedida({
    id: 'carga.fondo',
    grupo: 'carga',
    titulo_es: 'Fondo',
    dato: { valor: ahora ?? antes ?? 0, unidad: 'tss', referencia: null },
    serie: { unidad: 'tss', paso: 'dia', puntos },
    cobertura: COBERTURA_DEFECTO,
    procedencia: PROCEDENCIA_DEFECTO,
  });
}

function lecturaFondoSinDato(): Lectura {
  return lecturaSinDato({
    id: 'carga.fondo',
    grupo: 'carga',
    titulo_es: 'Fondo',
    falta: { por: 'historia', llevas: 0, hacen: METODO.ctl_days },
    cobertura: COBERTURA_DEFECTO,
    procedencia: PROCEDENCIA_DEFECTO,
  });
}

function lecturaSueno(horas: number, objetivo: number | null): Lectura {
  return lecturaMedida({
    id: 'recuperacion.sueno',
    grupo: 'recuperacion',
    titulo_es: 'Sueño',
    dato: {
      valor: horas,
      unidad: 'horas',
      referencia: objetivo == null ? null : { valor: objetivo, delta: horas - objetivo, de: 'objetivo_sueno' },
    },
    cobertura: COBERTURA_DEFECTO,
    procedencia: PROCEDENCIA_DEFECTO,
  });
}

function lecturaSuenoSinDato(): Lectura {
  return lecturaSinDato({
    id: 'recuperacion.sueno',
    grupo: 'recuperacion',
    titulo_es: 'Sueño',
    falta: { por: 'dispositivo' },
    cobertura: COBERTURA_DEFECTO,
    procedencia: PROCEDENCIA_DEFECTO,
  });
}

function lecturaVariabilidad(delta: number): Lectura {
  const referenciaValor = 50;
  return lecturaMedida({
    id: 'recuperacion.variabilidad',
    grupo: 'recuperacion',
    titulo_es: 'Variabilidad',
    dato: {
      valor: referenciaValor + delta,
      unidad: 'ms',
      referencia: { valor: referenciaValor, delta, de: 'basal_60_14d' },
    },
    cobertura: COBERTURA_DEFECTO,
    procedencia: PROCEDENCIA_DEFECTO,
  });
}

function lecturaVariabilidadSinDato(): Lectura {
  return lecturaSinDato({
    id: 'recuperacion.variabilidad',
    grupo: 'recuperacion',
    titulo_es: 'Variabilidad',
    falta: { por: 'dispositivo' },
    cobertura: COBERTURA_DEFECTO,
    procedencia: PROCEDENCIA_DEFECTO,
  });
}

function lecturaCobertura(sinPrecioPct: number): Lectura {
  const partes: Parte[] = [
    { code: 'medido', etiqueta_es: 'Medido con ritmo o pulso', valor: 100 - sinPrecioPct, pct: 100 - sinPrecioPct },
    { code: 'sin_precio', etiqueta_es: 'Sin puntuar ni medir', valor: sinPrecioPct, pct: sinPrecioPct },
  ];
  return lecturaMedida({
    id: 'carga.cobertura',
    grupo: 'carga',
    titulo_es: 'Cuánto de esto se ha medido',
    dato: { valor: 100 - sinPrecioPct, unidad: 'pct', referencia: null },
    reparto: { unidad: 'segundos', total: 100, partes },
    cobertura: COBERTURA_DEFECTO,
    procedencia: PROCEDENCIA_DEFECTO,
  });
}

function lecturaCoberturaSinDato(): Lectura {
  return lecturaSinDato({
    id: 'carga.cobertura',
    grupo: 'carga',
    titulo_es: 'Cuánto de esto se ha medido',
    falta: { por: 'historia', llevas: 0, hacen: 28 },
    cobertura: COBERTURA_DEFECTO,
    procedencia: PROCEDENCIA_DEFECTO,
  });
}

/** Fondo con una subida que dispara con el método por defecto (absoluta 40,
 *  bien por encima del umbral de 10; porcentaje 40 %, bien por encima del
 *  5 %) — la fixture que reutilizan los tests del cruce, la cobertura y el
 *  orden. */
function fondoConSubidaDisparada(): Lectura {
  return lecturaFondoDeExtremos(100, 140);
}

/** Fondo con una bajada de más del 5 % (−10 %). */
function fondoConBajada(): Lectura {
  return lecturaFondoDeExtremos(100, 90);
}

function ids(hechos: readonly Hecho[]): Set<string> {
  return new Set(hechos.map((h) => h.id));
}

// ---------------------------------------------------------------------------
// LISTA VACÍA
// ---------------------------------------------------------------------------

describe('lista de lecturas vacía', () => {
  test('no lanza y devuelve []', () => {
    expect(hechosAuditados([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// LA REGLA AUDITABLE
// ---------------------------------------------------------------------------

describe('un hecho sólo sale de lecturas medida', () => {
  test('carga.fondo apagada (sin_dato): no sale ningún hecho de subida', () => {
    const hechos = hechosAuditados([lecturaFondoSinDato()]);
    expect(hechos).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// EL DISPARO ES ABSOLUTO, LA FRASE ES RELATIVA
// ---------------------------------------------------------------------------

describe('el disparo de la subida es absoluto (2× el umbral semanal en 14 días), no relativo', () => {
  test('un +100 % sobre una base minúscula (fondo 1 → 2) no dispara: la subida absoluta es de 1', () => {
    const hechos = hechosAuditados([lecturaFondoDeExtremos(1, 2)]);
    expect(hechos).toHaveLength(0);
  });

  test('la subida absoluta llega al umbral (10) pero el % queda por debajo de SUBIDA_MINIMA_PCT (5 %): no dispara', () => {
    // antes=300, ahora=310 → absoluta 10 (= 2 × ramp_alert_tss_per_week=5), pct ≈ 3,33 %.
    const hechos = hechosAuditados([lecturaFondoDeExtremos(300, 310)]);
    expect(hechos).toHaveLength(0);
  });

  test('cambiar metodo.ramp_alert_tss_per_week cambia si dispara, sobre la MISMA serie', () => {
    // antes=100, ahora=112 → absoluta 12, pct 12 %.
    const fondo = lecturaFondoDeExtremos(100, 112);

    const metodoDefecto = { ...defaultCoachAnalyticsMethod(), ramp_alert_tss_per_week: 5 }; // umbral 10: 12 dispara
    const conDefecto = hechosAuditados([fondo], metodoDefecto);
    expect(ids(conDefecto).has('carga.sube_rapido')).toBe(true);

    const metodoExigente = { ...defaultCoachAnalyticsMethod(), ramp_alert_tss_per_week: 20 }; // umbral 40: 12 no dispara
    const conExigente = hechosAuditados([fondo], metodoExigente);
    expect(conExigente).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// SERIE INSUFICIENTE Y VALORES NO VÁLIDOS
// ---------------------------------------------------------------------------

describe('la serie no sostiene una subida', () => {
  test('menos de 15 puntos: ningún hecho de subida, aunque el salto sea enorme', () => {
    const hechos = hechosAuditados([lecturaFondoDeExtremos(100, 300, 14)]);
    expect(hechos).toHaveLength(0);
  });

  test.each<[string, number]>([
    ['cero', 0],
    ['negativo', -10],
  ])('punto de partida %s: no se emite porcentaje de subida', (_label, antes) => {
    const hechos = hechosAuditados([lecturaFondoDeExtremos(antes, 50)]);
    expect(hechos).toHaveLength(0);
  });

  test.each<[string, number | null, number | null]>([
    ['al final', null, 100],
    ['al principio', 100, null],
  ])('hueco (v: null) %s de la serie: no se inventa nada, no lanza', (_label, antes, ahora) => {
    let hechos: Hecho[] = [];
    expect(() => {
      hechos = hechosAuditados([lecturaFondoDeExtremos(antes, ahora)]);
    }).not.toThrow();
    expect(hechos).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// EL CRUCE — subida disparada + recuperación que no la sostiene
// ---------------------------------------------------------------------------

describe('el cruce: subida disparada + recuperación mala', () => {
  test('sueño por debajo de su referencia → cruce.subida_sin_descanso, pide_es, tono aviso, de con fondo+sueño', () => {
    const hechos = hechosAuditados([fondoConSubidaDisparada(), lecturaSueno(6, 8)]); // duerme 6h, objetivo 8h

    const cruce = hechos.find((h) => h.id === 'cruce.subida_sin_descanso');
    expect(cruce).toBeDefined();
    expect(cruce!.pide_es).not.toBeNull();
    expect(cruce!.tono).toBe('aviso');
    expect(cruce!.de).toEqual(['carga.fondo', 'recuperacion.sueno']);
    expect(ids(hechos).has('carga.sube_rapido')).toBe(false);
  });

  test('variabilidad con delta < 0 y sueño BIEN → cruce con variabilidad, sin sueño en de', () => {
    const hechos = hechosAuditados([fondoConSubidaDisparada(), lecturaSueno(9, 8), lecturaVariabilidad(-5)]);

    const cruce = hechos.find((h) => h.id === 'cruce.subida_sin_descanso');
    expect(cruce).toBeDefined();
    expect(cruce!.de).toEqual(['carga.fondo', 'recuperacion.variabilidad']);
    expect(cruce!.de).not.toContain('recuperacion.sueno');
  });

  test('sueño Y variabilidad malos → de incluye las tres', () => {
    const hechos = hechosAuditados([fondoConSubidaDisparada(), lecturaSueno(6, 8), lecturaVariabilidad(-5)]);

    const cruce = hechos.find((h) => h.id === 'cruce.subida_sin_descanso');
    expect(cruce).toBeDefined();
    expect(cruce!.de).toEqual(['carga.fondo', 'recuperacion.sueno', 'recuperacion.variabilidad']);
  });

  test('recuperación BIEN (sueño sobre el objetivo, variabilidad delta ≥ 0) → sube_rapido, NUNCA el cruce a la vez', () => {
    const hechos = hechosAuditados([fondoConSubidaDisparada(), lecturaSueno(9, 8), lecturaVariabilidad(0)]);

    expect(ids(hechos).has('carga.sube_rapido')).toBe(true);
    expect(ids(hechos).has('cruce.subida_sin_descanso')).toBe(false);
    // Excluyentes de verdad: nunca los dos a la vez.
    const enConflicto = hechos.filter((h) => h.id === 'carga.sube_rapido' || h.id === 'cruce.subida_sin_descanso');
    expect(enConflicto).toHaveLength(1);
  });

  test('sueño y variabilidad sin_dato → no hay cruce, sale el hecho simple', () => {
    const hechos = hechosAuditados([fondoConSubidaDisparada(), lecturaSuenoSinDato(), lecturaVariabilidadSinDato()]);

    expect(ids(hechos).has('carga.sube_rapido')).toBe(true);
    expect(ids(hechos).has('cruce.subida_sin_descanso')).toBe(false);
  });

  test('sueño MEDIDA pero sin referencia → no puede haber cruce por sueño (no hay contra qué comparar)', () => {
    const hechos = hechosAuditados([fondoConSubidaDisparada(), lecturaSueno(6, null)]);

    expect(ids(hechos).has('carga.sube_rapido')).toBe(true);
    expect(ids(hechos).has('cruce.subida_sin_descanso')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LA BAJADA
// ---------------------------------------------------------------------------

describe('la bajada', () => {
  test('más del 5 % de bajada → carga.baja, tono nota, pide_es null', () => {
    const hechos = hechosAuditados([fondoConBajada()]);

    expect(hechos).toHaveLength(1);
    const baja = hechos[0];
    expect(baja.id).toBe('carga.baja');
    expect(baja.tono).toBe('nota');
    expect(baja.pide_es).toBeNull();
    expect(baja.de).toEqual(['carga.fondo']);
  });

  test('bajada y subida son excluyentes: nunca conviven en la misma lista de hechos', () => {
    const conBajada = hechosAuditados([fondoConBajada()]);
    expect(ids(conBajada).has('carga.sube_rapido')).toBe(false);
    expect(ids(conBajada).has('cruce.subida_sin_descanso')).toBe(false);

    const conSubida = hechosAuditados([fondoConSubidaDisparada()]);
    expect(ids(conSubida).has('carga.baja')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// COBERTURA A CIEGAS
// ---------------------------------------------------------------------------

describe('carga.mitad_a_ciegas — la parte sin_precio', () => {
  test.each<[string, number, boolean]>([
    ['24 % — por debajo del umbral', 24, false],
    ['25 % — el borde exacto dispara', 25, true],
    ['40 % — muy por encima', 40, true],
  ])('%s', (_label, pct, debeSalir) => {
    const hechos = hechosAuditados([lecturaCobertura(pct)]);
    expect(ids(hechos).has('carga.mitad_a_ciegas')).toBe(debeSalir);
    if (debeSalir) {
      const h = hechos.find((x) => x.id === 'carga.mitad_a_ciegas');
      expect(h!.pide_es).not.toBeNull();
      expect(h!.de).toEqual(['carga.cobertura']);
    }
  });

  test('cobertura apagada (ausente de la lista de lecturas): no sale', () => {
    const hechos = hechosAuditados([fondoConSubidaDisparada()]); // sin carga.cobertura en absoluto
    expect(ids(hechos).has('carga.mitad_a_ciegas')).toBe(false);
  });

  test('cobertura sin_dato: no sale', () => {
    const hechos = hechosAuditados([lecturaCoberturaSinDato()]);
    expect(ids(hechos).has('carga.mitad_a_ciegas')).toBe(false);
  });

  test('puede salir A LA VEZ que un hecho de subida: son cosas distintas', () => {
    const hechos = hechosAuditados([fondoConSubidaDisparada(), lecturaCobertura(40)]);
    expect(ids(hechos).has('carga.sube_rapido')).toBe(true);
    expect(ids(hechos).has('carga.mitad_a_ciegas')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ORDEN — los aviso van siempre antes que las nota
// ---------------------------------------------------------------------------

describe('orden: los aviso van antes que las nota', () => {
  test('bajada (nota) + cobertura a ciegas (aviso) en la misma lista: el aviso sale primero', () => {
    const hechos = hechosAuditados([fondoConBajada(), lecturaCobertura(40)]);

    expect(hechos).toHaveLength(2);
    expect(hechos[0].id).toBe('carga.mitad_a_ciegas');
    expect(hechos[0].tono).toBe('aviso');
    expect(hechos[1].id).toBe('carga.baja');
    expect(hechos[1].tono).toBe('nota');
  });
});

// ---------------------------------------------------------------------------
// INVARIANTES GENERALES — explícitos, además del helper que los aplica siempre
// ---------------------------------------------------------------------------

describe('invariantes generales del contrato Hecho', () => {
  test('sobre un caso con dos hechos a la vez (cruce + cobertura a ciegas): ids únicos, frases vacías, de no vacío', () => {
    const hechos = hechosAuditados([fondoConSubidaDisparada(), lecturaSueno(6, 8), lecturaCobertura(40)]);

    expect(hechos.length).toBeGreaterThanOrEqual(2);

    const idsVistos = new Set<string>();
    for (const h of hechos) {
      expect(idsVistos.has(h.id)).toBe(false);
      idsVistos.add(h.id);

      expect(h.frase_es).toBe('');
      for (const termino of JERGA_DE_MOTOR) {
        expect(h.frase_es).not.toContain(termino);
      }
      expect(h.de.length).toBeGreaterThan(0);
    }
  });
});
