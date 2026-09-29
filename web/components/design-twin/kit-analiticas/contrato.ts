// EL CONTRATO DE LAS ANALÍTICAS REHECHAS — la forma del JSON que sirven
// `GET /api/athlete/analytics/panel?ventana=` y su gemelo del coach
// (docs/analiticas/modelo.md §5): la `Lectura` de `shared/domain/analytics`
// AMPLIADA con lo que el modelo añade — el ancla de la procedencia, la
// comparación, las series de plan y hecho en el MISMO eje, la familia, el
// bloque y los ejes reales. Puro: tipos, vocabulario y constructores.
//
// Es un contrato de PROPUESTA: lo que las dos superficies necesitan para
// pintar. Cuando se construya el motor (§10.1), lo que aquí está marcado
// «AMPLÍA» pasa a `shared/domain/analytics/lectura.ts` tal cual; lo demás ya
// existe allí y se importa, no se repite.
//
// LAS TRES REGLAS QUE EL CONTRATO HACE IMPOSIBLE ROMPER
//   A2 · toda cifra dice de dónde sale: `procedencia.ancla` es obligatoria.
//   A3 · toda cifra contra algo: `dato.comparacion` existe siempre; `null`
//        significa «no hay contra qué», nunca «se olvidó».
//   A10 · todo bloque resuelve sus cuatro estados: `estadoDeBloque()` los
//        deriva de la cobertura, no de un flag que alguien tenga que acordarse
//        de poner.

import type {
  Cobertura as CoberturaBase,
  EstadoLectura,
  Procedencia as ProcedenciaBase,
  PuntoSerie,
  Unidad as UnidadBase,
} from '@fahybrid/shared/domain/analytics';
import type { Falta } from '@fahybrid/shared/domain/running/progress';

export type { EstadoLectura, Falta, PuntoSerie };

// ---------------------------------------------------------------------------
// LA VENTANA (A4) — una para toda la pestaña
// ---------------------------------------------------------------------------

export type Ventana = '7d' | '4s' | '12s' | '6m' | '1a' | 'todo';

export const VENTANAS: readonly Ventana[] = ['7d', '4s', '12s', '6m', '1a', 'todo'];

/** Cómo se escribe cada ventana en el selector: corto, sin siglas raras. */
export const VENTANA_ETIQUETA: Record<Ventana, string> = {
  '7d': '7 d',
  '4s': '4 sem',
  '12s': '12 sem',
  '6m': '6 m',
  '1a': '1 a',
  todo: 'Todo',
};

/** Días que abarca cada ventana; `todo` los decide la historia del atleta. */
export const VENTANA_DIAS: Record<Exclude<Ventana, 'todo'>, number> = {
  '7d': 7,
  '4s': 28,
  '12s': 84,
  '6m': 182,
  '1a': 364,
};

export interface RangoVentana {
  ventana: Ventana;
  /** ISO `YYYY-MM-DD`, cortado en el día LOCAL del atleta. */
  desde: string;
  hasta: string;
  dias: number;
  /** A qué se agregan las series: por día en 7 d, por semana en el resto. */
  paso: 'dia' | 'semana';
  /** El periodo anterior de igual longitud, contra el que se compara todo. */
  anterior: { desde: string; hasta: string };
  /** True cuando la ventana rebasa la primera sesión: permiso para «desde que empezaste». */
  cubre_todo: boolean;
}

// ---------------------------------------------------------------------------
// FAMILIAS Y BLOQUES
// ---------------------------------------------------------------------------

export type Familia = 'correr' | 'remo' | 'ski' | 'bici' | 'fuerza' | 'estaciones' | 'wod';

/** Las cuatro familias GRANDES: las que caben en una barra apilada (≤ 4 series). */
export type FamiliaGrande = 'correr' | 'ergo' | 'fuerza' | 'estaciones-wod';

export const FAMILIAS: readonly Familia[] = ['correr', 'remo', 'ski', 'bici', 'fuerza', 'estaciones', 'wod'];
export const FAMILIAS_GRANDES: readonly FamiliaGrande[] = ['correr', 'ergo', 'fuerza', 'estaciones-wod'];

export const FAMILIA_GRANDE: Record<Familia, FamiliaGrande> = {
  correr: 'correr',
  remo: 'ergo',
  ski: 'ergo',
  bici: 'ergo',
  fuerza: 'fuerza',
  estaciones: 'estaciones-wod',
  wod: 'estaciones-wod',
};

export const FAMILIA_NOMBRE: Record<Familia, string> = {
  correr: 'Correr',
  remo: 'Remo',
  ski: 'SkiErg',
  bici: 'BikeErg',
  fuerza: 'Fuerza',
  estaciones: 'Estaciones',
  wod: 'WOD',
};

export const FAMILIA_GRANDE_NOMBRE: Record<FamiliaGrande, string> = {
  correr: 'Correr',
  ergo: 'Ergo',
  fuerza: 'Fuerza',
  'estaciones-wod': 'Estaciones y WOD',
};

/** Los ocho bloques del panel (§3). El orden es el de la portada. */
export type Bloque = 'estado' | 'forma' | 'semanas' | 'intensidad' | 'progreso' | 'records' | 'carrera' | 'recuperacion';

export const BLOQUES: readonly Bloque[] = ['estado', 'forma', 'semanas', 'intensidad', 'progreso', 'records', 'carrera', 'recuperacion'];

export const BLOQUE_TITULO: Record<Bloque, string> = {
  estado: 'Estado',
  forma: 'Forma y fatiga',
  semanas: 'Semana a semana',
  intensidad: 'Intensidad',
  progreso: 'Progreso',
  records: 'Récords',
  carrera: 'Carrera',
  recuperacion: 'Recuperación',
};

/** La pregunta que responde cada bloque (§3): es el subtítulo, no un adorno. */
export const BLOQUE_PREGUNTA: Record<Bloque, string> = {
  estado: '¿Cómo estoy hoy?',
  forma: '¿Gano forma o me paso? ¿Llego fresco?',
  semanas: '¿Hago lo que toca?',
  intensidad: '¿Entreno a la intensidad que toca?',
  progreso: '¿Mejoro?',
  records: '¿Qué marcas tengo?',
  carrera: '¿Llego a mi carrera?',
  recuperacion: '¿Asimilo?',
};

// ---------------------------------------------------------------------------
// EL DATO — AMPLÍA `Dato`: la unidad crece y la referencia pasa a comparación
// ---------------------------------------------------------------------------

/** AMPLÍA `Unidad`: lo que las siete familias necesitan y el contrato viejo (solo correr) no tenía. */
export type UnidadPanel =
  | UnidadBase
  | 'w' // vatios (ergo)
  | 's_1000m' // la bici se lee por 1000 m
  | 'reps'
  | 'rir'
  | 'rpm' // BikeErg
  | 'spm' // paladas por minuto
  | 'dias'
  | 'semanas'
  | 'tss_dia'; // la carga diaria de una serie

/**
 * Contra qué se lee el número (A3). El delta va en la MISMA unidad que el
 * umbral que lo juzga (arregla P1): `significativo` lo decide el método.
 */
export interface Comparacion {
  contra: 'periodo_anterior' | 'basal' | 'objetivo' | 'plan';
  /** El valor de referencia (el periodo anterior, la basal, el objetivo). */
  valor: number;
  /** `dato.valor − valor`, precalculado para que nadie lo reste al revés. */
  delta: number;
  /** Porcentaje del delta sobre la referencia; null si la referencia es cero. */
  delta_pct: number | null;
  /** ¿Supera el umbral de cambio del coach para esta métrica? */
  significativo: boolean;
  /** «vs 12 sem antes», «vs tu basal», «vs objetivo». */
  etiqueta_es: string;
  /**
   * En qué dirección es mejor, cuando la unidad no lo dice sola: un desacople
   * en % baja para mejorar; un tonelaje en kg sube. Ausente = lo decide la
   * unidad (menos segundos es mejor; más de lo demás, mejor).
   */
  menos_es_mejor?: boolean;
}

export interface DatoPanel {
  valor: number;
  unidad: UnidadPanel;
  comparacion: Comparacion | null;
}

// ---------------------------------------------------------------------------
// LA SERIE — AMPLÍA `Serie`: plan y hecho en el mismo eje, y la proyección
// ---------------------------------------------------------------------------

export interface SeriePanel {
  unidad: UnidadPanel;
  paso: 'dia' | 'semana';
  /** Lo hecho. `v` a null es un hueco real: no se interpola ni se rellena con cero. */
  hecho: PuntoSerie[];
  /** Lo planificado, mismo eje y mismas fechas. Null si no hay plan. */
  plan: PuntoSerie[] | null;
  /** El futuro: de hoy a la carrera, calculado desde la carga planificada (A7). */
  proyeccion: PuntoSerie[] | null;
  /** La franja normal (la basal de la recuperación). */
  banda: { lo: number; hi: number } | null;
}

// ---------------------------------------------------------------------------
// EL REPARTO — con familia o zona para que el cliente pinte sin adivinar
// ---------------------------------------------------------------------------

export interface ParteReparto {
  code: string;
  etiqueta_es: string;
  valor: number;
  /** Porcentaje sobre el total. Null si el total es cero. */
  pct: number | null;
  familia?: FamiliaGrande;
  zona?: number;
}

export interface RepartoPanel {
  unidad: UnidadPanel;
  total: number;
  partes: ParteReparto[];
  /** El objetivo del coach (la polarización que considera buena), por parte. */
  objetivo: Array<{ code: string; pct: number }> | null;
}

// ---------------------------------------------------------------------------
// COBERTURA Y PROCEDENCIA — AMPLÍAN las de shared con el ancla y la edad del dato
// ---------------------------------------------------------------------------

/**
 * La escalera de anclas (DECISIONS 07-28, §4 del modelo): cuentan para la
 * carga las tres primeras; la poblacional se enseña marcada y no cuenta.
 *
 * LA REGLA QUE DECIDE EL ANCLA DE UNA MARCA: es la del DATO del que sale.
 *   medida      sale de un entreno o test REGISTRADO — un split del remo, un
 *               test de umbral, y también un 1RM ESTIMADO desde las series
 *               hechas (kg × reps anotados en la sesión): la estimación es
 *               mecanismo (la fórmula del coach), el dato es medido.
 *   declarada   el atleta o el coach lo ESCRIBIERON directamente: un 1RM en
 *               el perfil, un umbral tecleado, un RPE.
 *   estimada    derivado de otra cosa por una fórmula poblacional (0,88 × FC
 *               máx; el ritmo umbral desde el VDOT de una marca).
 *   poblacional por edad o por tabla, sin nada del atleta detrás.
 * «Estimado» en el TÍTULO de una marca (1RM est.) habla del cálculo; el chip
 * de ancla habla del dato. No se confunden.
 */
export type Ancla = 'medida' | 'declarada' | 'estimada' | 'poblacional';

export const ANCLA_ETIQUETA: Record<Ancla, string> = {
  medida: 'medido',
  declarada: 'declarado',
  estimada: 'estimado',
  poblacional: 'por edad',
};

export const ANCLAS_QUE_CUENTAN: readonly Ancla[] = ['medida', 'declarada', 'estimada'];

export interface ProcedenciaPanel extends ProcedenciaBase {
  ancla: Ancla;
}

export interface CoberturaPanel extends CoberturaBase {
  /** % de la carga cubierta con ancla ESTIMADA. El veredicto lo dice (§4). */
  estimada_pct: number | null;
  /** ISO del último dato que sostiene la lectura. Con él se decide «dato viejo». */
  ultimo_dato: string | null;
}

// ---------------------------------------------------------------------------
// LA LECTURA (§5)
// ---------------------------------------------------------------------------

export interface LecturaPanel {
  id: string;
  bloque: Bloque;
  familia: Familia | 'todas';
  titulo_es: string;
  estado: EstadoLectura;
  dato: DatoPanel | null;
  serie: SeriePanel | null;
  reparto: RepartoPanel | null;
  cobertura: CoberturaPanel;
  procedencia: ProcedenciaPanel;
}

/** Los cuatro estados de un bloque (A10). Derivados, nunca escritos a mano. */
export type EstadoBloque = 'vacio' | 'poco' | 'lleno' | 'viejo';

// ---------------------------------------------------------------------------
// LO QUE UNA LISTA DE LECTURAS NO PUEDE LLEVAR — tipado, jamás texto libre
// ---------------------------------------------------------------------------

export type Cumplimiento = 'dentro' | 'por-encima' | 'por-debajo' | 'no-hecha' | 'sin-plan';

export const CUMPLIMIENTO_PALABRA: Record<Cumplimiento, string> = {
  dentro: 'dentro',
  'por-encima': 'más de lo pedido',
  'por-debajo': 'menos de lo pedido',
  'no-hecha': 'no hecha',
  'sin-plan': 'sin plan',
};

/** Una sesión de la ventana, para la lista de cumplimiento (§3, pregunta 3). */
export interface SesionResumen {
  id: string;
  fecha: string;
  titulo_es: string;
  familia: Familia;
  /** Carga planificada, desde la prescripción (A7). Null sin plan o sin intensidad prescrita. */
  plan_tss: number | null;
  /** Carga hecha. Null si no se hizo o no se sabe. */
  hecho_tss: number | null;
  ancla: Ancla | null;
  cumplimiento: Cumplimiento;
  /** «5 de 6 series dentro», «RIR 2 pedido, 1 hecho». */
  detalle_es: string | null;
}

export interface RecordPanel {
  id: string;
  familia: Familia;
  /** «5 km», «2000 m», «Sentadilla · 1RM est.», «Sled push 50 m». */
  prueba_es: string;
  valor: number;
  unidad: UnidadPanel;
  fecha: string;
  ancla: Ancla;
  /** Conseguido dentro de la ventana. */
  nuevo: boolean;
  /** El anterior mejor, para leer cuánto se ganó. */
  anterior: { valor: number; fecha: string } | null;
}

export type TramoCarrera =
  | 'run1' | 'ski' | 'run2' | 'sled_push' | 'run3' | 'sled_pull' | 'run4' | 'burpee_broad_jump'
  | 'run5' | 'row' | 'run6' | 'farmers' | 'run7' | 'lunges' | 'run8' | 'wall_balls' | 'roxzone';

export const TRAMOS_CARRERA: readonly TramoCarrera[] = [
  'run1', 'ski', 'run2', 'sled_push', 'run3', 'sled_pull', 'run4', 'burpee_broad_jump',
  'run5', 'row', 'run6', 'farmers', 'run7', 'lunges', 'run8', 'wall_balls', 'roxzone',
];

export const TRAMO_CARRERA_NOMBRE: Record<TramoCarrera, string> = {
  run1: 'Carrera 1',
  ski: 'SkiErg',
  run2: 'Carrera 2',
  sled_push: 'Sled push',
  run3: 'Carrera 3',
  sled_pull: 'Sled pull',
  run4: 'Carrera 4',
  burpee_broad_jump: 'Burpee broad jump',
  run5: 'Carrera 5',
  row: 'Remo',
  run6: 'Carrera 6',
  farmers: 'Farmers carry',
  run7: 'Carrera 7',
  lunges: 'Zancadas',
  run8: 'Carrera 8',
  wall_balls: 'Wall balls',
  roxzone: 'Roxzone',
};

export interface PrevisionTramo {
  tramo: TramoCarrera;
  /** Null cuando no hay ninguna marca que sostenga este tramo. */
  previsto_s: number | null;
  /** Del reparto del objetivo del atleta; null si no hay objetivo. */
  objetivo_s: number | null;
  /** `previsto_s − objetivo_s`; positivo = te falta. */
  hueco_s: number | null;
  ancla: Ancla;
  /** De qué sale la previsión de ESTE tramo: «tu 1000 m de remo (12 sep)». */
  de_es: string;
}

export interface PrevisionCarrera {
  nombre_es: string;
  fecha: string;
  dias: number;
  /** Suma de los 17 tramos. Null mientras falte alguno: una previsión parcial no es un tiempo. */
  previsto_s: number | null;
  objetivo_s: number | null;
  hueco_s: number | null;
  /** Cómo ha ido moviéndose la previsión, semana a semana (menos es mejor). */
  tendencia: PuntoSerie[];
  tramos: PrevisionTramo[];
  /** Cuántos tramos tienen previsión con ancla que cuenta. */
  cobertura: { con_dato: number; de: number };
}

export type ClaseVeredicto = 'a-mas' | 'te-pasas' | 'mantiene' | 'sin-veredicto';

export interface VeredictoForma {
  clase: ClaseVeredicto;
  frase_es: string;
  /** % de la carga de la ventana que se ha podido calcular. */
  cobertura_pct: number | null;
  estimada_pct: number | null;
  /** Por qué no hay veredicto, cuando no lo hay. */
  retirado_es: string | null;
}

// ---------------------------------------------------------------------------
// EL PANEL ENTERO — lo que devuelven las dos rutas para el mismo atleta
// ---------------------------------------------------------------------------

export interface HistoriaPanel {
  semanas: number | null;
  desde: string | null;
  cubre_todo: boolean;
}

export interface PanelAnaliticas {
  atleta: { nombre: string; hoy: string; carrera: { nombre_es: string; fecha: string } | null };
  ventana: RangoVentana;
  historia: HistoriaPanel;
  /** La palabra la pone el servidor con las bandas del coach: iOS pinta, no calcula. */
  estado: { clave: EstadoFrescuraClave | null; palabra_es: string | null; lecturas: LecturaPanel[] };
  forma: { lecturas: LecturaPanel[]; veredicto: VeredictoForma | null };
  semanas: { lecturas: LecturaPanel[]; sesiones: SesionResumen[] };
  intensidad: { lecturas: LecturaPanel[]; polarizacion: RepartoPanel | null };
  progreso: LecturaPanel[];
  records: RecordPanel[];
  carrera: PrevisionCarrera | null;
  recuperacion: LecturaPanel[];
}

export type EstadoFrescuraClave = 'sobrecarga' | 'optimo' | 'mantener' | 'fresco' | 'recargando';

// ---------------------------------------------------------------------------
// CONSTRUCTORES — para que ninguna lectura nazca incoherente
// ---------------------------------------------------------------------------

export interface ArgsMedida {
  id: string;
  bloque: Bloque;
  familia?: Familia | 'todas';
  titulo_es: string;
  dato: DatoPanel;
  serie?: SeriePanel | null;
  reparto?: RepartoPanel | null;
  cobertura: Omit<CoberturaPanel, 'falta'> & { falta?: Falta | null };
  procedencia: ProcedenciaPanel;
}

/** Una lectura que se sostiene: exige el dato y el ancla. */
export function medida(a: ArgsMedida): LecturaPanel {
  return {
    id: a.id,
    bloque: a.bloque,
    familia: a.familia ?? 'todas',
    titulo_es: a.titulo_es,
    estado: 'medida',
    dato: a.dato,
    serie: a.serie ?? null,
    reparto: a.reparto ?? null,
    cobertura: { ...a.cobertura, falta: a.cobertura.falta ?? null },
    procedencia: a.procedencia,
  };
}

export interface ArgsSinDato {
  id: string;
  bloque: Bloque;
  familia?: Familia | 'todas';
  titulo_es: string;
  falta: Falta;
  cobertura?: Partial<Omit<CoberturaPanel, 'falta'>>;
  procedencia: ProcedenciaPanel;
}

/** Una lectura que no se puede dar: exige la falta, así el motivo viaja siempre. */
export function sinDato(a: ArgsSinDato): LecturaPanel {
  return {
    id: a.id,
    bloque: a.bloque,
    familia: a.familia ?? 'todas',
    titulo_es: a.titulo_es,
    estado: 'sin_dato',
    dato: null,
    serie: null,
    reparto: null,
    cobertura: {
      muestras: a.cobertura?.muestras ?? 0,
      dias_ventana: a.cobertura?.dias_ventana ?? 0,
      dias_con_dato: a.cobertura?.dias_con_dato ?? 0,
      pct: a.cobertura?.pct ?? null,
      estimada_pct: a.cobertura?.estimada_pct ?? null,
      ultimo_dato: a.cobertura?.ultimo_dato ?? null,
      falta: a.falta,
    },
    procedencia: a.procedencia,
  };
}

/** Una serie con plan y hecho alineados por fecha, sin escribir dos veces las fechas. */
export function serie(
  unidad: UnidadPanel,
  paso: 'dia' | 'semana',
  puntos: Array<{ t: string; hecho: number | null; plan?: number | null }>,
  extra?: { proyeccion?: PuntoSerie[] | null; banda?: { lo: number; hi: number } | null },
): SeriePanel {
  const hayPlan = puntos.some((p) => p.plan !== undefined);
  return {
    unidad,
    paso,
    hecho: puntos.map((p) => ({ t: p.t, v: p.hecho })),
    plan: hayPlan ? puntos.map((p) => ({ t: p.t, v: p.plan ?? null })) : null,
    proyeccion: extra?.proyeccion ?? null,
    banda: extra?.banda ?? null,
  };
}
