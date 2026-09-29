// EL EXAMEN DEL PLAN COMPACTO (docs/garmin-reloj/plan-compacto.md, modelo.md §11).
//
// Lo que se comprueba y por qué:
//   1. IDA Y VUELTA EXACTA de cada sesión real y de cada plan del kit: si un
//      campo no vuelve igual, el reloj mostraría otra cosa que el servidor.
//   2. PRESUPUESTO: ≤ 6 KB de binario (8 KB de base64: la clave máxima de
//      Storage) y ≤ 200 pasos por sesión.
//   3. CERO TEXTO LIBRE: solo cadenas de catálogo, cue, palabra de RPE, la línea
//      de estructura y el vocabulario; ninguna > 40 caracteres salvo cue y
//      estructura (120, con truncado explícito); ningún nombre lleva una dosis.
//   4. AL LÍMITE: HYROX completo, cientos de series, EMOM largo, AMRAP de seis
//      tareas y un plan por cada valor de cada tabla.
//   5. AL AZAR: planes válidos con semilla fija.
//   6. RECHAZOS: lo que el formato NO acepta falla con un código, no con un
//      plan a medias en la muñeca.
//   7. HUECOS DEL MODELO: lo que el examen encontró y no se arregla en el
//      codificador (doc, sección «Huecos del modelo»).
//
// No hay mocks: todo corre sobre los datos del doble y el codificador real.

import { describe, expect, it } from 'vitest';
import { pactoDe } from '@/components/design-twin/kit-reloj/dobles';
import { filasDePasos, hoyDe } from '@/components/design-twin/kit-reloj/estructura';
import { formatoDe, NOMBRE_FORMATO_DEFECTO } from '@/components/design-twin/kit-reloj/familia';
import type { NombresFormato } from '@/components/design-twin/kit-reloj/metodo';
import type { PasoBase } from '@/components/design-twin/kit-reloj/paso';
import {
  CADENAS_ADMITIDAS,
  CLAVE_STORAGE_MAX_BYTES,
  LIMITE_CADENA,
  LIMITE_CUE,
  MAX_NUM,
  MAX_PASOS,
  NUM_PALABRAS_RPE,
  PRESUPUESTO_BYTES,
  VERSION_ESQUEMA,
  canonico,
  codificarSesion,
  decodificarFlujo,
  decodificarPlan,
  decodificarSesion,
  decodificarSobre,
  desenvolver,
  envolver,
  aBase64,
  aBinario,
  deBinario,
  ErrorPlanCompacto,
  flujoDeSesion,
  metaPorDefecto,
  type Flujo,
  type MetaSesion,
} from '@/components/design-twin/kit-garmin/plan-compacto';
import { NO_ENCONTRADAS, NUMEROS_DEL_ENCARGO, casosReales, metaDeCaso, todosLosCasos } from './garmin-plan-casos';
import { aJsonPosicional, medirSesion, resumir, type MedidaSesion } from './garmin-plan-medidas';
import {
  amrapDeTareas,
  emomLargo,
  fuerzaDeMuchasSeries,
  hyroxCompleto,
  hyroxDobles,
  pasosDeWod,
  pasosPorCadaValor,
  planAleatorio,
  planDe,
} from './garmin-plan-sinteticos';

/** Semillas del examen al azar: fijas, para que un fallo se pueda repetir. */
const SEMILLAS = 400;

const TODOS = todosLosCasos();
const CLAVES_REALES = new Set(casosReales().map((c) => c.clave));

const DATOS_SERVIDOR = { asignacionId: 1, fitSport: 10, fitSubSport: 70 };
const metaDe = (plan: Parameters<typeof metaPorDefecto>[0]): MetaSesion => metaPorDefecto(plan, DATOS_SERVIDOR);

function idaYVuelta(plan: Parameters<typeof metaPorDefecto>[0], meta: MetaSesion) {
  const bytes = codificarSesion(plan, meta);
  const d = decodificarSesion(bytes);
  expect(d.plan).toStrictEqual(canonico(plan));
  expect(d.meta).toStrictEqual(meta);
  return bytes;
}

// ---------------------------------------------------------------------------
// 1 · Las sesiones reales y los planes del kit
// ---------------------------------------------------------------------------

describe('plan compacto · sesiones reales y planes del kit', () => {
  it('cubre las sesiones del encargo: las que existen en el doble y las que no', () => {
    const numeros = new Set(casosReales().map((c) => c.numero));
    const faltan = NUMEROS_DEL_ENCARGO.filter((n) => !numeros.has(n));
    expect(faltan).toEqual([...NO_ENCONTRADAS]);
    expect(NUMEROS_DEL_ENCARGO.length - faltan.length).toBe(24);
  });

  it.each(TODOS.map(({ caso, meta }) => [caso.clave, caso, meta] as const))('%s · ida y vuelta exacta (plan y cabecera)', (_c, caso, meta) => {
    idaYVuelta(caso.plan, meta);
  });

  it.each(TODOS.map(({ caso, meta }) => [caso.clave, caso, meta] as const))('%s · cabe: ≤ 6 KB, base64 ≤ 8 KB, ≤ 200 pasos', (_c, caso, meta) => {
    const m = medirSesion(caso.plan, meta);
    expect(m.binario).toBeLessThanOrEqual(PRESUPUESTO_BYTES);
    expect(m.base64).toBeLessThanOrEqual(CLAVE_STORAGE_MAX_BYTES);
    expect(m.pasos).toBeLessThanOrEqual(MAX_PASOS);
  });

  it('el binario es un punto fijo: re-codificar lo decodificado da los mismos bytes', () => {
    for (const { caso, meta } of TODOS) {
      const bytes = codificarSesion(caso.plan, meta);
      const d = decodificarSesion(bytes);
      expect([...codificarSesion(d.plan, d.meta)], caso.clave).toEqual([...bytes]);
    }
  });

  it('cero texto libre: solo tipos de cadena admitidos, sin truncar y dentro de límite', () => {
    for (const { caso, meta } of TODOS) {
      for (const c of flujoDeSesion(caso.plan, meta).cadenas) {
        expect(CADENAS_ADMITIDAS.has(c.tipo), `${caso.clave}: «${c.texto}» es ${c.tipo}`).toBe(true);
        expect(c.truncada, `${caso.clave}: «${c.texto}» se truncó`).toBe(false);
        const limite = c.tipo === 'cue' ? LIMITE_CUE : LIMITE_CADENA;
        expect(c.largo, `${caso.clave}: «${c.texto}»`).toBeLessThanOrEqual(limite);
      }
    }
  });

  it('un nombre de catálogo no lleva una dosis escondida (sin cifras)', () => {
    for (const { caso, meta } of TODOS) {
      for (const c of flujoDeSesion(caso.plan, meta).cadenas.filter((x) => x.tipo === 'catalogo')) {
        expect(c.texto, `${caso.clave}`).not.toMatch(/\d/);
      }
    }
  });

  it('el cue más largo de las sesiones reales sigue lejos de su límite', () => {
    const largos = TODOS.flatMap(({ caso, meta }) => flujoDeSesion(caso.plan, meta).cadenas.filter((c) => c.tipo === 'cue').map((c) => c.largo));
    expect(Math.max(0, ...largos)).toBeLessThan(LIMITE_CUE);
  });

  it('la duración se deriva de los pasos y la línea del brief NO viaja: la compone el reloj del dato', () => {
    const c = TODOS.find((x) => x.caso.clave === 'modelo-6x1000')!;
    expect(c.meta.duracionEstS).toBeGreaterThan(0);
    expect(Object.keys(c.meta).sort()).toEqual(['asignacionId', 'duracionEstS', 'entorno', 'fitSport', 'fitSubSport', 'huella']);
    // Los números llevan un espacio duro antes de la unidad (`fmtPrescrito`): se compara en texto llano.
    expect(hoyDe(c.caso.plan.pasos).titulo.replace(/\u00A0/g, ' ')).toBe('6 × 1000 m');
  });

  it('los tamaños: la mayor cabe con holgura y ninguna se sale', () => {
    const medidas = TODOS.map(({ caso, meta }) => ({ clave: caso.clave, m: medirSesion(caso.plan, meta) }));
    const r = resumir(medidas);
    expect(r.noCaben).toEqual([]);
    expect(r.mayor.bytes).toBeLessThan(PRESUPUESTO_BYTES / 2);
    expect(r.peorDiaDoble).toBeLessThan(PRESUPUESTO_BYTES);
  });

  it('decisión A/B: el binario (con base64) gana al JSON posicional en CADA sesión', () => {
    for (const { caso, meta } of TODOS) {
      const m: MedidaSesion = medirSesion(caso.plan, meta);
      expect(m.binario, caso.clave).toBeLessThan(m.json);
      expect(m.sobre, caso.clave).toBeLessThan(m.json);
    }
  });

  it('A y B son la misma información: el JSON posicional decodifica a lo mismo', () => {
    for (const { caso, meta } of TODOS.slice(0, 12)) {
      const { flujo } = flujoDeSesion(caso.plan, meta);
      const o = JSON.parse(aJsonPosicional(flujo)) as { v: number; s: string[]; d: number[] };
      const viaJson: Flujo = { version: o.v, cadenas: o.s, tokens: o.d };
      expect(decodificarFlujo(viaJson)).toStrictEqual(decodificarFlujo(deBinario(aBinario(flujo))));
    }
  });
});

// ---------------------------------------------------------------------------
// 2 · Al límite
// ---------------------------------------------------------------------------

describe('plan compacto · sesiones sintéticas al límite', () => {
  it('HYROX completo: 8 × (1 km + Roxzone + estación + Roxzone) + calentamiento + vuelta a la calma', () => {
    const plan = hyroxCompleto();
    expect(plan.pasos).toHaveLength(2 + 8 * 4 - 1);
    const bytes = idaYVuelta(plan, metaDe(plan));
    expect(bytes.length).toBeLessThanOrEqual(PRESUPUESTO_BYTES);
  });

  it('el tope de pasos: 100 series con su descanso = 200 pasos caben', () => {
    const plan = fuerzaDeMuchasSeries(100);
    expect(plan.pasos).toHaveLength(MAX_PASOS);
    const bytes = idaYVuelta(plan, metaDe(plan));
    expect(bytes.length).toBeLessThanOrEqual(PRESUPUESTO_BYTES);
  });

  it('200 series con su descanso = 400 pasos: se pasa del tope de pasos, y de bytes solo si el doc lo dice', () => {
    const plan = fuerzaDeMuchasSeries(200);
    const m = medirSesion(plan, metaDe(plan));
    expect(m.pasos).toBe(400);
    expect(m.pasos - MAX_PASOS).toBe(200);
    // La ida y vuelta sigue siendo exacta aunque no quepa: el límite es de presupuesto, no de formato.
    idaYVuelta(plan, metaDe(plan));
    expect(m.cabe).toBe(false);
  });

  it('200 series SIN descanso (200 pasos): caben en pasos; el peso por paso de una serie completa', () => {
    const plan = fuerzaDeMuchasSeries(200, false);
    const m = medirSesion(plan, metaDe(plan));
    expect(m.pasos).toBe(MAX_PASOS);
    idaYVuelta(plan, metaDe(plan));
    expect(m.binario).toBeGreaterThan(PRESUPUESTO_BYTES / 2);
  });

  it('AMRAP con una tarea de 6 ejercicios cabe con mucha holgura', () => {
    const plan = amrapDeTareas(6);
    const bytes = idaYVuelta(plan, metaDe(plan));
    expect(bytes.length).toBeLessThan(PRESUPUESTO_BYTES / 4);
  });

  it('EMOM de 60 ventanas con 4 tareas: la tabla de tareas evita repetirlas en cada ventana', () => {
    const largo = emomLargo(60, 4);
    const corto = emomLargo(4, 4);
    idaYVuelta(largo, metaDe(largo));
    const mLargo = medirSesion(largo, metaDe(largo));
    const mCorto = medirSesion(corto, metaDe(corto));
    // 15 veces más ventanas cuestan lo que cuesta cada ventana (≈ 12 B), no 15 copias del ciclo.
    expect((mLargo.binario - mCorto.binario) / 56).toBeLessThan(20);
    expect(mLargo.binario).toBeLessThan(PRESUPUESTO_BYTES);
  });

  it('un paso por cada valor de cada tabla del formato', () => {
    const plan = planDe(pasosPorCadaValor());
    idaYVuelta(plan, metaDe(plan));
  });

  it('cada formato de WOD, con y sin sus opcionales', () => {
    const plan = planDe(pasosDeWod());
    idaYVuelta(plan, metaDe(plan));
  });

  it('con todo el texto de los dobles: viaja, pero fuera de lo admitido', () => {
    const plan = hyroxDobles();
    idaYVuelta(plan, metaDe(plan));
  });
});

// ---------------------------------------------------------------------------
// 3 · Al azar
// ---------------------------------------------------------------------------

describe('plan compacto · propiedades sobre planes al azar', () => {
  it(`ida y vuelta exacta en ${SEMILLAS} planes generados (semillas 1…${SEMILLAS})`, () => {
    for (let semilla = 1; semilla <= SEMILLAS; semilla++) {
      const plan = planAleatorio(semilla);
      const meta = metaDe(plan);
      try {
        idaYVuelta(plan, meta);
      } catch (e) {
        throw new Error(`semilla ${semilla}: ${(e as Error).message}`);
      }
    }
  });

  it('el binario es determinista: mismo plan y cabecera, mismos bytes', () => {
    const plan = planAleatorio(7);
    const meta = metaDe(plan);
    expect([...codificarSesion(plan, meta)]).toEqual([...codificarSesion(plan, meta)]);
  });

  it('el binario no depende de los ids de la interfaz ni de las claves de ejercicio', () => {
    const plan = planAleatorio(11);
    const otros = { ...plan, pasos: plan.pasos.map((p, i) => ({ ...p, id: `otro-${i * 7}`, fuerza: p.fuerza ? { ...p.fuerza, ejercicio: `${p.fuerza.ejercicio}-renombrado` } : undefined })) };
    const meta = metaDe(plan);
    expect([...codificarSesion(otros, meta)]).toEqual([...codificarSesion(plan, meta)]);
  });
});

// ---------------------------------------------------------------------------
// 4 · Transporte y rechazos
// ---------------------------------------------------------------------------

describe('plan compacto · transporte', () => {
  it('los varints de los bordes viajan: 0, 127, 128, 16383, 16384 y el máximo de 31 bits', () => {
    const f: Flujo = { version: VERSION_ESQUEMA, cadenas: ['añ·′'], tokens: [0, 1, 127, 128, 255, 16383, 16384, 2097151, 2097152, MAX_NUM] };
    expect(deBinario(aBinario(f))).toStrictEqual(f);
  });

  it('el sobre JSON lleva el binario en base64 y vuelve idéntico', () => {
    const c = TODOS[3]!;
    const bytes = codificarSesion(c.caso.plan, c.meta);
    expect([...desenvolver(envolver(bytes, VERSION_ESQUEMA))]).toEqual([...bytes]);
    expect(decodificarSobre(envolver(bytes, VERSION_ESQUEMA)).plan).toStrictEqual(canonico(c.caso.plan));
  });

  it('el presupuesto de 6 KB de binario son exactamente 8 192 caracteres de base64', () => {
    expect(aBase64(new Uint8Array(PRESUPUESTO_BYTES)).length).toBe(CLAVE_STORAGE_MAX_BYTES);
  });

  it('rechaza una versión de esquema que no conoce', () => {
    const c = TODOS[0]!;
    const bytes = codificarSesion(c.caso.plan, c.meta);
    bytes[0] = VERSION_ESQUEMA + 1;
    expect(() => decodificarSesion(bytes)).toThrowError(/versión/);
  });

  it('rechaza un plan cortado y uno con valores de más', () => {
    const c = TODOS[3]!;
    const bytes = codificarSesion(c.caso.plan, c.meta);
    expect(() => decodificarSesion(bytes.slice(0, bytes.length - 3))).toThrow(ErrorPlanCompacto);
    expect(() => decodificarSesion(Uint8Array.from([...bytes, 1, 2]))).toThrowError(/sobran/);
  });

  it('rechaza un número que no cabe en 31 bits', () => {
    const plan = planDe([{ id: 'a', clase: 'rodaje', rol: 'trabajo', fase: 'principal', medida: { tipo: 'tiempo', prescrito: MAX_NUM, mide: 'reloj' }, objetivos: [], cierre: 'medida' }]);
    expect(() => codificarSesion(plan, metaDe(plan))).toThrowError(/fuera de/);
  });
});

describe('plan compacto · lo que el formato no acepta', () => {
  const paso0 = (): PasoBase => ({ id: 'a', clase: 'rodaje', rol: 'trabajo', fase: 'principal', medida: { tipo: 'tiempo', prescrito: 60, mide: 'reloj' }, objetivos: [], cierre: 'medida' });
  const falla = (p: PasoBase, codigo: string) => {
    const plan = planDe([p]);
    let error: unknown = null;
    try {
      codificarSesion(plan, metaDe(plan));
    } catch (e) {
      error = e;
    }
    expect((error as ErrorPlanCompacto | null)?.codigo).toBe(codigo);
  };

  it('una clave del modelo que el formato no lleva (el modelo creció): clave-desconocida', () => {
    falla({ ...paso0(), intensidadPercibida: 7 } as unknown as PasoBase, 'clave-desconocida');
    falla({ ...paso0(), siguiente: null } as unknown as PasoBase, 'clave-desconocida');
  });

  it('un decimal que no cabe exacto en su escala no se redondea: no-entero', () => {
    falla({ ...paso0(), carga: { kg: 12.345 } }, 'no-entero');
    falla({ ...paso0(), objetivos: [{ eje: 'rpe', min: 7.25, max: 8, papel: 'principal' }] }, 'no-entero');
  });

  it('un nombre de catálogo de más de 40 caracteres no se trunca: cadena-larga', () => {
    falla({ ...paso0(), nombre: 'x'.repeat(LIMITE_CADENA + 1) }, 'cadena-larga');
  });

  it('un cue de más de 120 caracteres SÍ se trunca, con «…» y dejando constancia', () => {
    const cue = 'a'.repeat(LIMITE_CUE + 30);
    const plan = planDe([{ ...paso0(), cue }]);
    const { cadenas } = flujoDeSesion(plan, metaDe(plan));
    const registro = cadenas.find((c) => c.tipo === 'cue')!;
    expect(registro.truncada).toBe(true);
    expect(registro.largoOriginal).toBe(LIMITE_CUE + 30);
    const d = decodificarSesion(codificarSesion(plan, metaDe(plan)));
    expect([...d.plan.pasos[0]!.cue!]).toHaveLength(LIMITE_CUE);
    expect(d.plan.pasos[0]!.cue!.endsWith('…')).toBe(true);
  });

  it('más de dos objetivos por paso: fuera-de-limites (M1)', () => {
    const o = { eje: 'ritmo', min: 240, max: 250, papel: 'principal' } as const;
    falla({ ...paso0(), objetivos: [o, o, o] }, 'fuera-de-limites');
  });

  it('una palabra de RPE en otro eje: fuera-de-limites', () => {
    falla({ ...paso0(), objetivos: [{ eje: 'zona', min: 2, max: 2, papel: 'principal', palabra: 'fuerte' }] }, 'fuera-de-limites');
  });

  it('un slot que no es letra + número: fuera-de-limites', () => {
    falla({ ...paso0(), posicion: { slot: 'principal' } }, 'fuera-de-limites');
  });

  it('un EMOM cuya tarea no está en su ciclo: fuera-de-limites', () => {
    const t = { nombre: 'Row', dosis: null, mide: 'ergo' as const };
    falla({ ...paso0(), clase: 'emom', wod: { formato: 'emom', tarea: t, ciclo: [{ ...t, nombre: 'Otra' }], ventanas: 4, ventanaS: 60 } }, 'fuera-de-limites');
  });

  it('un vocabulario al que le falta una clase que la sesión usa: vocabulario-incompleto', () => {
    const plan = planDe([paso0()]);
    const sinClase = { ...plan, vocabulario: { ...plan.vocabulario!, clases: {} } };
    expect(() => codificarSesion(sinClase, metaDe(plan))).toThrowError(/vocabulario/);
    const corta = { ...plan, vocabulario: { ...plan.vocabulario!, rpe: ['nada'] } };
    expect(() => codificarSesion(corta, metaDe(plan))).toThrowError(new RegExp(`${NUM_PALABRAS_RPE}`));
  });

  it('un plan sin vocabulario o sin método (no servido, sin defectos del servidor): el reloj no inventa', () => {
    const plan = planDe([paso0()]);
    const sinVocabulario = { ...plan, vocabulario: undefined };
    const sinMetodo = { ...plan, metodo: undefined };
    expect(() => codificarSesion(sinVocabulario, metaDe(plan))).toThrowError(/vocabulario/);
    expect(() => codificarSesion(sinMetodo, metaDe(plan))).toThrowError(/metodo-ausente/);
  });

  it('zonas de pulso sin decir si son estimadas o medidas: fuera-de-limites', () => {
    const plan = planDe([paso0()]);
    const sin = { ...plan, zonas: { techos: plan.zonas!.techos } };
    expect(() => codificarSesion(sin, metaDe(plan))).toThrowError(/procedencia/);
  });

  it('dobles: un pacto en texto libre o una pareja por estación se rechazan (fuera-de-limites)', () => {
    const est = (dobles: NonNullable<PasoBase['dobles']>): PasoBase => ({ ...paso0(), clase: 'estacion', nombre: 'Sled Push', dobles });
    falla(est({ turno: 'reparto', pctTuyo: 50, nota: 'alterna 25' }), 'fuera-de-limites');
    falla(est({ turno: 'tuyo', pctTuyo: 100, pareja: 'Marta' }), 'fuera-de-limites');
  });
});

// ---------------------------------------------------------------------------
// 5 · Huecos del modelo (lo que NO se arregla en el codificador)
// ---------------------------------------------------------------------------

describe('plan compacto · huecos del modelo que el examen encontró', () => {
  it('B3 · dobles sin texto libre: la pareja es del plan, la estación se deriva y el pacto es un dato', () => {
    const plan = hyroxDobles();
    const cadenas = flujoDeSesion(plan, metaDe(plan)).cadenas;
    expect(cadenas.filter((c) => c.tipo === 'pareja').map((c) => c.texto)).toEqual(['Marta']);
    expect(cadenas.every((c) => CADENAS_ADMITIDAS.has(c.tipo))).toBe(true);
    const d = decodificarPlan(codificarSesion(plan, metaDe(plan)));
    const reparto = d.pasos[2]!.dobles!;
    expect(reparto.alternaCada).toEqual({ tipo: 'reps', n: 25 });
    expect(reparto.pareja).toBe('Marta');
    expect(reparto.estacion?.replace(/\u00A0/g, ' ')).toBe('Wall Balls 100 reps');
    expect(pactoDe(reparto)).toBe('Tú 60 · Marta 40 · alterna 25');
  });

  it('B2 · formatoDe ya no escribe texto fuera del vocabulario: «Series», «Fuerza» y «Continuo» son del coach', () => {
    // Con nombres centinela, todo lo que sale debe salir con centinela.
    const centinela = Object.fromEntries(Object.keys(NOMBRE_FORMATO_DEFECTO).map((k) => [k, `«${k}»`])) as NombresFormato;
    const paso = (p: Partial<PasoBase>): PasoBase => ({ id: 'x', clase: 'series', rol: 'trabajo', fase: 'principal', medida: { tipo: 'tiempo', prescrito: 60, mide: 'reloj' }, objetivos: [], cierre: 'medida', ...p });
    const literales = [
      formatoDe(paso({ clase: 'series' }), centinela),
      formatoDe(paso({ clase: 'fuerza' }), centinela),
      formatoDe(paso({ clase: 'ergo', maquina: { tipo: 'remo' } }), centinela),
      formatoDe(paso({ clase: 'ergo', maquina: { tipo: 'remo' }, posicion: { serie: { n: 1, de: 4 } } }), centinela),
    ];
    expect(literales).toEqual(['«series»', '«fuerza»', '«continuo»', '«series»']);
  });

  it('H-538: la sesión 538 solo existe partida en dos planes (correr y fuerza), nunca entera', () => {
    const de538 = casosReales().filter((c) => c.numero === '538');
    expect(de538.map((c) => c.clave).sort()).toEqual(['538-correr', '538-fuerza']);
    // Cada mitad lleva un tramo de Run distinto: no hay un plan que sea la sesión completa.
    expect(de538.every((c) => c.plan.pasos.some((p) => p.clase === 'series' || p.fase === 'calentamiento'))).toBe(true);
  });

  it('B4/B5 · la procedencia de las zonas y las bandas de ritmo viajan EN EL PLAN, y la escala de una zona es dato', () => {
    const c = TODOS.find((x) => x.caso.clave === '491')!;
    expect(c.caso.plan.zonas!.procedencia).toBe('estimada');
    expect(c.caso.plan.bandasRitmo![0]!.zonas).toHaveLength(6);
    const plan = planDe([{ id: 'a', clase: 'ergo', rol: 'trabajo', fase: 'principal', medida: { tipo: 'tiempo', prescrito: 600, mide: 'ergo' }, objetivos: [{ eje: 'zona', min: 3, max: 3, papel: 'principal', escala: 'ritmo' }], cierre: 'medida' }]);
    const d = decodificarPlan(codificarSesion({ ...plan, zonas: { ...plan.zonas!, procedencia: 'medida' } }, metaDe(plan)));
    expect(d.zonas!.procedencia).toBe('medida');
    expect(d.pasos[0]!.objetivos[0]!.escala).toBe('ritmo');
  });

  it('B6 · el grupo del coach viaja como dato y la estructura lo usa; sin él, la heurística de siempre', () => {
    const c = TODOS.find((x) => x.caso.clave === 'modelo-6x1000')!;
    expect(filasDePasos(c.caso.plan.pasos).map((g) => g.veces)).toContain(6);
    // Con el grupo puesto en cada serie, el cable lo lleva y las veces son las que él dice.
    const grupo = { id: 1, veces: 6 };
    const conGrupo = { ...c.caso.plan, pasos: c.caso.plan.pasos.map((p) => (p.posicion?.serie ? { ...p, grupo } : p)) };
    const d = decodificarPlan(codificarSesion(conGrupo, c.meta));
    expect(d.pasos.filter((p) => p.grupo).every((p) => p.grupo!.id === 1 && p.grupo!.veces === 6)).toBe(true);
    expect(filasDePasos(d.pasos).map((g) => g.veces)).toContain(6);
    const cambiado = d.pasos.map((p) => (p.grupo ? { ...p, grupo: { id: 1, veces: 9 } } : p));
    expect(filasDePasos(cambiado).some((g) => g.veces === 9)).toBe(true);
  });

  it('B8 · el cable no lleva `PasoBase.id` ni la clave de ejercicio (índice y ordinal) y sube de versión', () => {
    expect(VERSION_ESQUEMA).toBe(2);
    const c = TODOS.find((x) => x.caso.clave === '488')!;
    expect(decodificarPlan(codificarSesion(c.caso.plan, c.meta)).pasos.map((p) => p.id)).toEqual(c.caso.plan.pasos.map((_, i) => String(i)));
  });
});

// La cabecera de una sesión ilustrativa es estable entre ejecuciones (los vectores de oro dependen de ello).
describe('plan compacto · la cabecera por defecto', () => {
  it('es estable entre ejecuciones y no depende de los ids de los pasos', () => {
    const a = metaDeCaso(casosReales()[0]!, 0);
    const b = metaDeCaso(casosReales()[0]!, 0);
    expect(a).toStrictEqual(b);
    expect(a.huella).toBeGreaterThan(0);
    expect(a.huella).toBeLessThanOrEqual(MAX_NUM);
  });

  it('las claves reales de las sesiones no se cuelan en los vectores de las ilustrativas', () => {
    expect(TODOS.filter(({ caso }) => CLAVES_REALES.has(caso.clave)).every(({ caso }) => caso.numero !== null)).toBe(true);
  });
});
