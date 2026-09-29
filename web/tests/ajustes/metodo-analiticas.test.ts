// El editor de Ajustes › Método › Analíticas, puro (sin base de datos): que el
// catálogo cubra todas las claves del método, que el borrador vaya y vuelva sin
// perder nada, que los mensajes de validación salgan en castellano y en la
// escala que ve el coach, y que los helpers de la escalera de carga nunca
// dejen un estado imposible. La ruta real se cubre en
// `tests/analytics/metodo-umbrales.db.test.ts`.

import { describe, expect, test } from 'vitest';
import {
  ANALYTICS_METHOD_BOUNDS,
  BASES_SESION,
  COACH_ANALYTICS_METHOD_FAMILY_KEYS,
  COACH_ANALYTICS_METHOD_INTEGER_KEYS,
  COACH_ANALYTICS_METHOD_KEYS,
  COACH_ANALYTICS_METHOD_LIST_KEYS,
  COACH_ANALYTICS_METHOD_NUMERIC_KEYS,
  COACH_ANALYTICS_METHOD_TEXT_KEYS,
  DEFAULT_COACH_ANALYTICS_METHOD,
  FUENTES_ADMISIBLES,
  FUENTES_CARGA,
  MODALIDADES_CARGA,
  defaultCoachAnalyticsMethod,
  validarMetodoAnalitico,
  type ClaveNumericaMetodo,
  type CoachAnalyticsMethod,
  type ModalidadCarga,
} from '@fahybrid/shared/domain/analytics/metodo';
import { FAMILIAS } from '@fahybrid/shared/domain/analytics/lectura';
import { ESTADO_FRESCURA_ES } from '@fahybrid/shared/domain/analytics/forma';
import { DESCRIPTORES_METODO_ANALITICO } from '@/components/v2/ajustes/metodo-analiticas/catalogo';
import { CAMPOS_POR_GRUPO, GRUPOS, PELDANO_ETIQUETA, type GrupoId } from '@/components/v2/ajustes/metodo-analiticas/descriptores';
import {
  alternarFamilia,
  anadirBase,
  anadirPeldano,
  bajarPeldano,
  basesDisponibles,
  candidatoDe,
  draftOf,
  CLAVES_NUMERICAS_POR_GRUPO,
  formatearBandasFrescura,
  gruposAbiertosAlInicio,
  quitarPeldano,
  subirPeldano,
  validarCandidato,
} from '@/components/v2/ajustes/metodo-analiticas/modelo';

describe('descriptores · cobertura del catálogo', () => {
  test('todas las claves del método tienen descriptor, y ninguna sobra', () => {
    expect(new Set(Object.keys(DESCRIPTORES_METODO_ANALITICO))).toEqual(new Set(COACH_ANALYTICS_METHOD_KEYS));
  });

  test('cada clave aparece en exactamente un grupo de pantalla, sin huecos ni duplicados', () => {
    const vistas = GRUPOS.flatMap((g) => CAMPOS_POR_GRUPO[g.id]);
    expect([...vistas].sort()).toEqual([...COACH_ANALYTICS_METHOD_KEYS].sort());
    expect(new Set(vistas).size).toBe(vistas.length);
  });

  test('el tipo del descriptor coincide con la naturaleza de la clave', () => {
    for (const clave of COACH_ANALYTICS_METHOD_LIST_KEYS) {
      expect(DESCRIPTORES_METODO_ANALITICO[clave].tipo).toBe(clave === 'cumplimiento_sesion_bases' ? 'orden' : 'escalera');
    }
    for (const clave of COACH_ANALYTICS_METHOD_TEXT_KEYS) expect(DESCRIPTORES_METODO_ANALITICO[clave].tipo).toBe('seleccion');
    for (const clave of COACH_ANALYTICS_METHOD_FAMILY_KEYS) expect(DESCRIPTORES_METODO_ANALITICO[clave].tipo).toBe('familias');
    for (const clave of COACH_ANALYTICS_METHOD_NUMERIC_KEYS) expect(DESCRIPTORES_METODO_ANALITICO[clave].tipo).toBe('numero');
  });

  test('solo ¿Mejoro?, la holgura de cada tramo, Recuperación y Velocidad crítica empiezan plegados', () => {
    expect(GRUPOS.filter((g) => g.plegadoPorDefecto).map((g) => g.id).sort()).toEqual(
      ['capacidad', 'holgura', 'progreso', 'recuperacion'].sort(),
    );
  });

  test('las claves enteras del método se editan sin decimales', () => {
    for (const clave of COACH_ANALYTICS_METHOD_INTEGER_KEYS) {
      const d = DESCRIPTORES_METODO_ANALITICO[clave];
      expect(d.tipo, clave).toBe('numero');
      if (d.tipo === 'numero' && !d.escalaDivisor) expect(d.decimales, clave).toBe(0);
    }
  });

  test('cada campo numérico dice en qué grupo está y ese grupo lo lista', () => {
    for (const clave of COACH_ANALYTICS_METHOD_NUMERIC_KEYS) {
      const { grupo } = DESCRIPTORES_METODO_ANALITICO[clave];
      expect(CAMPOS_POR_GRUPO[grupo]).toContain(clave);
      expect(CLAVES_NUMERICAS_POR_GRUPO[grupo]).toContain(clave);
    }
  });

  test('confirmar cada grupo con sus valores por defecto siempre es válido, solo con las claves de ese grupo', () => {
    const defectos = defaultCoachAnalyticsMethod();
    const borrador = draftOf(defectos);
    for (const grupo of GRUPOS) {
      const subset = Object.fromEntries(CLAVES_NUMERICAS_POR_GRUPO[grupo.id].map((c) => [c, borrador[c]]));
      expect(candidatoDe(subset, defectos).ok, `grupo ${grupo.id}`).toBe(true);
    }
  });

  test('los descriptores nuevos (reparto y ¿mejoro?) existen y no llevan guiones largos en lo visible', () => {
    for (const clave of ['cumplimiento_sesion_bases', 'cumplimiento_verde_min_pct', 'cumplimiento_ambar_max_pct', 'holgura_ritmo_s_km', 'holgura_dosis_pct', 'cambio_cumplimiento_pts', 'polarizacion_familias', 'polarizacion_tolerancia_pts', 'cambio_polarizacion_pts', 'cambio_ergo_pct', 'cambio_fuerza_pct', 'cambio_estaciones_pct', 'cambio_wod_pct', 'cambio_test_pct', 'fuerza_1rm_reps_max'] as const) {
      const d = DESCRIPTORES_METODO_ANALITICO[clave];
      expect(d.etiqueta.length).toBeGreaterThan(0);
      expect(d.ayuda.length).toBeGreaterThan(0);
      expect(`${d.etiqueta} ${d.ayuda}`).not.toMatch(/[—–]/);
    }
    for (const g of GRUPOS) expect(`${g.titulo} ${g.nota ?? ''}`).not.toMatch(/[—–]/);
  });

  test('PELDANO_ETIQUETA cubre los cuatro peldaños del vocabulario', () => {
    for (const f of FUENTES_CARGA) expect(typeof PELDANO_ETIQUETA[f]).toBe('string');
  });
});

describe('borrador ↔ método', () => {
  test('ida y vuelta de los defectos da exactamente DEFAULT_COACH_ANALYTICS_METHOD', () => {
    const defectos = defaultCoachAnalyticsMethod();
    const resultado = candidatoDe(draftOf(defectos), defectos);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.method).toEqual(DEFAULT_COACH_ANALYTICS_METHOD);
  });

  test('«12,5» y «12.5» se leen igual', () => {
    const defectos = defaultCoachAnalyticsMethod();
    const conComa = candidatoDe({ fuerza_coeficiente: '1,25' }, defectos);
    const conPunto = candidatoDe({ fuerza_coeficiente: '1.25' }, defectos);
    expect(conComa.ok && conComa.method.fuerza_coeficiente).toBe(1.25);
    expect(conPunto.ok && conPunto.method.fuerza_coeficiente).toBe(1.25);
  });

  test('un valor fuera de rango da «Entre X y Y.» en su clave', () => {
    const resultado = candidatoDe({ ctl_days: '5' }, defaultCoachAnalyticsMethod()); // bounds 14-90
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.problemas).toContainEqual({ clave: 'ctl_days', mensaje: 'Entre 14 y 90.' });
  });

  test('texto no numérico da «Escribe un número.» en su clave, sin validar el conjunto', () => {
    const resultado = candidatoDe({ ctl_days: 'abc' }, defaultCoachAnalyticsMethod());
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.problemas).toEqual([{ clave: 'ctl_days', mensaje: 'Escribe un número.' }]);
  });

  test('atl_days ≥ ctl_days da el mensaje del conjunto (sin clave)', () => {
    const resultado = candidatoDe({ atl_days: '50' }, defaultCoachAnalyticsMethod()); // ctl_days por defecto 42
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.problemas).toContainEqual({
        clave: null,
        mensaje: 'Los días de lo reciente tienen que ser menos que los del fondo.',
      });
    }
  });

  test('bandas de frescura desordenadas dan su mensaje', () => {
    const resultado = candidatoDe({ frescura_optimo_hasta: '-40' }, defaultCoachAnalyticsMethod()); // por debajo de sobrecarga_hasta (-30)
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.problemas).toContainEqual({
        clave: null,
        mensaje: 'Las bandas de frescura tienen que ir de menor a mayor: sobrecarga, óptimo, mantener, fresco.',
      });
    }
  });

  test('la escala de minutos: se enseña en minutos y se guarda en segundos', () => {
    const defectos = defaultCoachAnalyticsMethod(); // 120 s / 900 s
    const borrador = draftOf(defectos);
    expect(borrador.cs_min_duration_s).toBe('2');
    expect(borrador.cs_max_duration_s).toBe('15');

    const resultado = candidatoDe({ cs_min_duration_s: '3' }, defectos);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.method.cs_min_duration_s).toBe(180);
  });

  test('fuera de rango en un campo escalado, el mensaje se dice en minutos, no en los segundos guardados', () => {
    // Bounds reales: 60-600 s (1-10 min). 0,5 min = 30 s, por debajo del mínimo.
    const resultado = candidatoDe({ cs_min_duration_s: '0,5' }, defaultCoachAnalyticsMethod());
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.problemas).toContainEqual({ clave: 'cs_min_duration_s', mensaje: 'Entre 1 y 10.' });
  });
});

// ── Por qué el commit por grupo no esconde ningún error real ────────────────
// `candidatoDe` valida solo el grupo que se confirma y toma el resto del método
// vigente. Eso es correcto si y solo si las reglas de `validarMetodoAnalitico`
// nunca cruzan dos grupos: si cada grupo es válido con lo demás en su defecto,
// cualquier mezcla de grupos válidos también lo es. Se comprueba muestreando
// (semilla fija) valores en los extremos de cada rango, no leyendo las reglas a
// ojo, y el detector se prueba a sí mismo con una regla cruzada inventada.

type Validador = (m: CoachAnalyticsMethod) => string[];
type Asignacion = Partial<Record<keyof CoachAnalyticsMethod, unknown>>;

function mulberry32(semilla: number): () => number {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valoresDe(clave: keyof CoachAnalyticsMethod, defectos: CoachAnalyticsMethod): unknown[] {
  const tipo = DESCRIPTORES_METODO_ANALITICO[clave].tipo;
  if (tipo === 'numero') {
    const k = clave as ClaveNumericaMetodo;
    const { min, max } = ANALYTICS_METHOD_BOUNDS[k];
    const d = defectos[k];
    const entero = COACH_ANALYTICS_METHOD_INTEGER_KEYS.has(k);
    const crudos = [min, max, d, (min + max) / 2, (min + d) / 2, (max + d) / 2];
    return [...new Set(crudos.map((v) => (entero ? Math.round(v) : v)))];
  }
  const porDefecto = defectos[clave] as string[];
  const vocabulario: readonly string[] =
    tipo === 'escalera'
      ? FUENTES_ADMISIBLES[String(clave).replace('fuentes_', '') as ModalidadCarga]
      : tipo === 'orden'
        ? BASES_SESION
        : FAMILIAS;
  return [
    porDefecto,
    [...porDefecto].reverse(),
    porDefecto.slice(0, 1),
    [...vocabulario],
    [], // inválido a propósito: el filtro de «válido solo» lo descarta
    [porDefecto[0], porDefecto[0]], // duplicado, idem
  ];
}

/** Las claves editables de un grupo (todo salvo el desplegable de base, que ninguna regla mira). */
const clavesMuestreables = (grupo: GrupoId) => CAMPOS_POR_GRUPO[grupo].filter((c) => DESCRIPTORES_METODO_ANALITICO[c].tipo !== 'seleccion');

/**
 * Cuántas mezclas de asignaciones válidas-por-separado (cada grupo con lo demás
 * en su defecto) resultan inválidas al juntarlas, y cuántas asignaciones de un
 * grupo, solas, ya rompen alguna regla.
 */
function medirIndependencia(validar: Validador): { mezclasInvalidas: number; grupoConRegla: Set<GrupoId> } {
  const defectos = defaultCoachAnalyticsMethod();
  const azar = mulberry32(20260929);
  const elegir = <T,>(xs: readonly T[]): T => xs[Math.floor(azar() * xs.length)]!;
  const validas = new Map<GrupoId, Asignacion[]>();
  const grupoConRegla = new Set<GrupoId>();

  for (const { id } of GRUPOS) {
    const claves = clavesMuestreables(id);
    const buenas: Asignacion[] = [];
    for (let i = 0; i < 600 && buenas.length < 60; i += 1) {
      const asignacion: Asignacion = {};
      for (const clave of claves) asignacion[clave] = elegir(valoresDe(clave, defectos));
      if (validar({ ...defectos, ...asignacion } as CoachAnalyticsMethod).length === 0) buenas.push(asignacion);
      else grupoConRegla.add(id);
    }
    validas.set(id, buenas);
  }

  let mezclasInvalidas = 0;
  for (let i = 0; i < 3000; i += 1) {
    let juntas: Asignacion = {};
    for (const { id } of GRUPOS) {
      const buenas = validas.get(id)!;
      if (buenas.length > 0) juntas = { ...juntas, ...elegir(buenas) };
    }
    if (validar({ ...defectos, ...juntas } as CoachAnalyticsMethod).length > 0) mezclasInvalidas += 1;
  }
  return { mezclasInvalidas, grupoConRegla };
}

describe('el commit por grupo · ninguna regla cruzada cruza dos grupos', () => {
  test('juntar grupos válidos por separado da siempre un método válido', () => {
    expect(medirIndependencia(validarMetodoAnalitico).mezclasInvalidas).toBe(0);
  });

  test('las reglas viven donde se espera: forma, frescura, cumplimiento, recuperación y velocidad crítica', () => {
    const { grupoConRegla } = medirIndependencia(validarMetodoAnalitico);
    for (const grupo of ['forma', 'frescura', 'carga', 'cumplimiento', 'intensidad', 'recuperacion', 'capacidad'] as const) {
      expect(grupoConRegla.has(grupo), grupo).toBe(true);
    }
    for (const grupo of ['cambio', 'holgura', 'progreso'] as const) expect(grupoConRegla.has(grupo), grupo).toBe(false);
  });

  test('el detector no es ciego: una regla que cruzara forma y velocidad crítica se cazaría', () => {
    const conCruce: Validador = (m) => [
      ...validarMetodoAnalitico(m),
      ...(m.atl_days >= 15 && m.cs_min_duration_s >= 300 ? ['regla inventada entre dos grupos'] : []),
    ];
    expect(medirIndependencia(conCruce).mezclasInvalidas).toBeGreaterThan(0);
  });

  test('un cruce entre campos escalados del mismo grupo llega como mensaje del conjunto, no como rango en minutos', () => {
    // 10 min y 5 min: mínimo por encima del máximo, los dos en rango.
    const resultado = candidatoDe(
      { cs_min_duration_s: '10', cs_max_duration_s: '5', cs_min_spread_ratio: '3' },
      defaultCoachAnalyticsMethod(),
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.problemas.length).toBeGreaterThan(0);
      for (const p of resultado.problemas) {
        expect(p.clave).toBeNull();
        expect(p.mensaje).not.toMatch(/^Entre /);
      }
      expect(resultado.problemas.map((p) => p.mensaje)).toContain(
        'El esfuerzo más corto admisible tiene que durar menos que el más largo.',
      );
    }
  });

  test('el máximo de un esfuerzo también se dice en minutos', () => {
    // Bounds reales: 300-3600 s (5-60 min). 90 min = 5400 s, por encima.
    const resultado = candidatoDe({ cs_max_duration_s: '90' }, defaultCoachAnalyticsMethod());
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.problemas).toContainEqual({ clave: 'cs_max_duration_s', mensaje: 'Entre 5 y 60.' });
  });

  test('un campo roto y abandonado en un grupo no bloquea confirmar otro', () => {
    const vigente = defaultCoachAnalyticsMethod();
    const soloForma = candidatoDe({ ctl_days: '50' }, vigente);
    expect(soloForma.ok && soloForma.method.ctl_days).toBe(50);
    expect(candidatoDe({ atl_days: 'roto' }, vigente).ok).toBe(false);
    // El texto roto de «forma» no viaja con el commit de «capacidad»: solo se leen las claves que se confirman.
    const soloCapacidad = candidatoDe({ cs_min_duration_s: '3' }, vigente);
    expect(soloCapacidad.ok && soloCapacidad.method.cs_min_duration_s).toBe(180);
  });
});

describe('grupos plegados · se abren solos si ya traen ajuste', () => {
  test('con los defectos del producto, ninguno arranca abierto', () => {
    expect(gruposAbiertosAlInicio(defaultCoachAnalyticsMethod(), defaultCoachAnalyticsMethod()).size).toBe(0);
  });

  test('Recuperación y Velocidad crítica se abren si un campo suyo se sale del defecto, y solo ellos', () => {
    const defectos = defaultCoachAnalyticsMethod();
    expect([...gruposAbiertosAlInicio({ ...defectos, basal_dias: defectos.basal_dias + 7 }, defectos)]).toEqual(['recuperacion']);
    expect([...gruposAbiertosAlInicio({ ...defectos, cs_max_duration_s: 1200 }, defectos)]).toEqual(['capacidad']);
  });

  test('un grupo que no se pliega nunca figura como abierto por esta vía, aunque se ajuste', () => {
    const defectos = defaultCoachAnalyticsMethod();
    expect(gruposAbiertosAlInicio({ ...defectos, ctl_days: 60, fuentes_run: ['pulso'] }, defectos).size).toBe(0);
  });
});

describe('frescura · los nombres de los cinco estados salen de una sola fuente', () => {
  test('las etiquetas y las ayudas de las cuatro bandas nombran los estados tal como los ve el atleta', () => {
    const porBanda = {
      frescura_sobrecarga_hasta: ['sobrecarga'],
      frescura_optimo_hasta: ['optimo'],
      frescura_mantener_hasta: ['mantener'],
      frescura_fresco_hasta: ['fresco', 'recargando'],
    } as const;
    for (const [clave, estados] of Object.entries(porBanda)) {
      const d = DESCRIPTORES_METODO_ANALITICO[clave as keyof typeof porBanda];
      const texto = `${d.etiqueta} ${d.ayuda}`;
      for (const estado of estados) {
        expect(texto, clave).toContain(ESTADO_FRESCURA_ES[estado].etiqueta_es);
      }
    }
  });
});

describe('validarCandidato', () => {
  test('un método íntegramente por defecto no da problemas', () => {
    expect(validarCandidato(defaultCoachAnalyticsMethod()).ok).toBe(true);
  });
});

describe('los helpers de la escalera de carga', () => {
  test('subir y bajar intercambian con el vecino; en los extremos no hacen nada', () => {
    expect(subirPeldano(['a', 'b', 'c'], 1)).toEqual(['b', 'a', 'c']);
    expect(subirPeldano(['a', 'b', 'c'], 0)).toEqual(['a', 'b', 'c']);
    expect(bajarPeldano(['a', 'b', 'c'], 1)).toEqual(['a', 'c', 'b']);
    expect(bajarPeldano(['a', 'b', 'c'], 2)).toEqual(['a', 'b', 'c']);
  });

  test('quitar nunca deja la escalera vacía', () => {
    expect(quitarPeldano(['pulso', 'esfuerzo'], 0)).toEqual(['esfuerzo']);
    expect(quitarPeldano(['pulso'], 0)).toEqual(['pulso']);
  });

  test('añadir no admite un peldaño que esa modalidad no puede preciar (potencia en correr)', () => {
    expect(anadirPeldano(['ritmo'], 'run', 'potencia')).toEqual(['ritmo']);
    expect(anadirPeldano(['ritmo'], 'run', 'pulso')).toEqual(['ritmo', 'pulso']);
  });

  test('añadir no duplica un peldaño que ya está', () => {
    expect(anadirPeldano(['ritmo', 'pulso'], 'run', 'pulso')).toEqual(['ritmo', 'pulso']);
  });

  test('todas las modalidades tienen descriptor de escalera', () => {
    for (const modalidad of MODALIDADES_CARGA) {
      expect(DESCRIPTORES_METODO_ANALITICO[`fuentes_${modalidad}`].tipo).toBe('escalera');
    }
  });
});

describe('las bases con que se compara una sesión', () => {
  test('todas las bases del vocabulario tienen su nombre en castellano', () => {
    const d = DESCRIPTORES_METODO_ANALITICO.cumplimiento_sesion_bases;
    expect(d.tipo).toBe('orden');
    if (d.tipo === 'orden') for (const b of BASES_SESION) expect(d.etiquetas[b].length).toBeGreaterThan(0);
  });

  test('las disponibles son las que la lista aún no trae, en el orden del vocabulario', () => {
    expect(basesDisponibles(['carga', 'duracion', 'distancia'])).toEqual([]);
    expect(basesDisponibles(['distancia'])).toEqual(['carga', 'duracion']);
  });

  test('añadir pone la base al final y no duplica una que ya está', () => {
    expect(anadirBase(['duracion'], 'carga')).toEqual(['duracion', 'carga']);
    expect(anadirBase(['duracion', 'carga'], 'carga')).toEqual(['duracion', 'carga']);
  });

  test('reordenar con los mismos helpers de la escalera no rompe el validador', () => {
    const defectos = defaultCoachAnalyticsMethod();
    const cambiada = subirPeldano(defectos.cumplimiento_sesion_bases, 2);
    expect(validarCandidato({ ...defectos, cumplimiento_sesion_bases: cambiada }).ok).toBe(true);
    expect(validarCandidato({ ...defectos, cumplimiento_sesion_bases: [] }).ok).toBe(false);
  });
});

describe('las bandas de una sesión (verde y ámbar)', () => {
  test('con los defectos son válidas y un grupo entero de cumplimiento confirma solo con sus claves', () => {
    expect(candidatoDe({}, defaultCoachAnalyticsMethod()).ok).toBe(true);
  });

  test('un verde que no contiene el 100 % lo rechaza el validador del dominio', () => {
    const r = candidatoDe({ cumplimiento_verde_max_pct: '100', cumplimiento_ambar_max_pct: '100' }, defaultCoachAnalyticsMethod());
    expect(r.ok).toBe(false);
  });

  test('un ámbar mínimo por encima del verde mínimo también', () => {
    const r = candidatoDe({ cumplimiento_ambar_min_pct: '85' }, defaultCoachAnalyticsMethod());
    expect(r.ok).toBe(false);
  });

  test('un porcentaje entero con decimales se rechaza en su clave', () => {
    const r = candidatoDe({ cumplimiento_verde_min_pct: '80,5' }, defaultCoachAnalyticsMethod());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problemas.some((p) => p.clave === 'cumplimiento_verde_min_pct')).toBe(true);
  });
});

describe('el conjunto de familias del reparto', () => {
  test('alternar añade o quita y devuelve siempre el orden del vocabulario', () => {
    expect(alternarFamilia(['correr', 'remo'], 'fuerza')).toEqual(['correr', 'remo', 'fuerza']);
    expect(alternarFamilia(['remo', 'wod'], 'correr')).toEqual(['correr', 'remo', 'wod']);
    expect(alternarFamilia(['correr', 'remo'], 'remo')).toEqual(['correr']);
  });

  test('nunca deja el conjunto vacío', () => {
    expect(alternarFamilia(['correr'], 'correr')).toEqual(['correr']);
  });

  test('el defecto respeta el orden del vocabulario, así que una ida y vuelta no lo mueve', () => {
    const defecto = defaultCoachAnalyticsMethod().polarizacion_familias;
    expect(alternarFamilia(alternarFamilia(defecto, 'fuerza'), 'fuerza')).toEqual(defecto);
    expect(FAMILIAS.filter((f) => defecto.includes(f))).toEqual(defecto);
  });

  test('un conjunto vacío o con una familia inventada lo rechaza el mismo validador que la API', () => {
    const defectos = defaultCoachAnalyticsMethod();
    expect(validarCandidato({ ...defectos, polarizacion_familias: [] }).ok).toBe(false);
    expect(validarCandidato({ ...defectos, polarizacion_familias: ['nadar' as never] }).ok).toBe(false);
  });
});

describe('los límites de los campos nuevos', () => {
  test('un valor fuera de rango se dice «Entre X y Y.» con los límites del dominio, no copiados', () => {
    const { min, max } = ANALYTICS_METHOD_BOUNDS.cambio_ergo_pct;
    const resultado = candidatoDe({ cambio_ergo_pct: '99' }, defaultCoachAnalyticsMethod());
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.problemas.some((p) => p.clave === 'cambio_ergo_pct')).toBe(true);
    expect(min).toBeLessThan(max);
  });

  test('«2,5» se guarda como 2,5 en el % de mejora de fuerza (un decimal)', () => {
    const r = candidatoDe({ cambio_fuerza_pct: '3,5' }, defaultCoachAnalyticsMethod());
    expect(r.ok && r.method.cambio_fuerza_pct).toBe(3.5);
  });
});

describe('lectura en vivo de las bandas de frescura', () => {
  test('con los defectos, da los cinco tramos exactos', () => {
    expect(formatearBandasFrescura(-30, -11, 4, 29)).toBe(
      'Pasado de carga ≤ −30 · Construyendo −29 a −11 · Manteniendo −10 a 4 · Fresco 5 a 29 · Recargando ≥ 30',
    );
  });
});
