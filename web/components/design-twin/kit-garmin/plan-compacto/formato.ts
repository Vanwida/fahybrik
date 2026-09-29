// FORMATO DEL PLAN COMPACTO — el contrato de cable entre el servidor y el reloj
// Garmin (docs/garmin-reloj/plan-compacto.md, modelo.md §8).
//
// El reloj no puede recibir el detalle bruto de la asignación: necesita PASOS
// ya resueltos, en pocos bytes, y que un decodificador de Monkey C pueda leer
// con un cursor y un bucle. Este fichero es la ÚNICA fuente de todo lo que es
// ABI: la versión del esquema, las tablas de códigos de cada enum, cómo se
// empaquetan los campos pequeños y los límites. Cambiar el orden de una tabla
// rompe a todos los relojes instalados: solo se AÑADE al final y se sube la
// versión.
//
// LO QUE ES MECANISMO (constante, va aquí) y LO QUE ES MÉTODO (dato del coach,
// viaja en el plan): aquí solo hay mecanismo. Los nombres de clase y de
// formato, las bandas de zona, las holguras, el preaviso, la vuelta
// automática, las palabras del RPE y los rangos de anotación son DATO y salen
// de la sesión (HARD RULE Nº0). El reloj no trae ni un valor por defecto.
//
// QUÉ NO HACER:
//   · No usar floats: todo va en enteros (décimas, centésimas) porque Monkey C
//     compara y guarda enteros de 32 bits y un float es una fuente de error.
//   · No meter texto de pantalla: solo nombres de catálogo y cue del coach.
//   · No añadir un campo al paso sin añadirlo aquí Y a los tests de cobertura:
//     el codificador rechaza toda clave que no conoce, a propósito.

import type {
  CargaFuerza,
  Clase,
  EjeObjetivo,
  Entorno,
  EsfuerzoFuerza,
  Fase,
  FichaFuerza,
  InfoWod,
  ModoRecupera,
  Objetivo,
  PapelObjetivo,
  Procedencia,
  QuienMide,
  Rol,
  SentidoAviso,
  SentidoRoxzone,
  TipoMedida,
  UnidadRitmo,
} from '../../kit-reloj/paso';
import type { Dobles } from '../../kit-reloj/dobles';
import type { FormatoNombrado } from '../../kit-reloj/metodo';

// ---------------------------------------------------------------------------
// Versión y límites
// ---------------------------------------------------------------------------

/** Versión del esquema, primer valor del cable. Un reloj rechaza una que no conoce y dice «plan de otra versión». */
export const VERSION_ESQUEMA = 2;

/** Techo de todo número del cable: el `Number` de Monkey C es un entero de 32 bits con signo. */
export const MAX_NUM = 2 ** 31 - 1;

/** Presupuesto por sesión: 6 KB de binario = 8 KB de base64, que es la clave máxima de Storage (H8, §8). */
export const PRESUPUESTO_BYTES = 6 * 1024;

/** Tope de pasos por sesión: la memoria del FR255 (512 KB) decodifica una sola sesión en curso (§11.5). */
export const MAX_PASOS = 200;

/** Una clave de Storage admite 8 KB; el base64 de un plan en el presupuesto llena justo ese límite. */
export const CLAVE_STORAGE_MAX_BYTES = 8 * 1024;

/** Caracteres máximos de una cadena de catálogo, de vocabulario o de zona: más largo no cabe en la pantalla más pequeña (218). */
export const LIMITE_CADENA = 40;

/** Caracteres máximos del cue del coach: se TRUNCA con «…», nunca en silencio (informe). */
export const LIMITE_CUE = 120;

/** El remate de una cadena truncada. */
export const REMATE_TRUNCADO = '…';

/** Cuántas palabras de RPE lleva el vocabulario: el RPE de fin de sesión va de 0 a 10 (CR-10). */
export const NUM_PALABRAS_RPE = 11;

/** Tolerancia al comprobar que un valor cabe exacto en décimas o centésimas. */
export const TOLERANCIA_ESCALA = 1e-6;

// ---------------------------------------------------------------------------
// Escalas: todo lo que lleva decimales viaja como entero
// ---------------------------------------------------------------------------

/** Valores de eje (ritmo, pulso, RPE, %RM, inclinación…): décimas. Un RPE de 6,5 es 65. */
export const ESCALA_DECI = 10;

/** Kilos, siempre y en cualquier campo: centésimas. Un disco de 1,25 kg es 125. */
export const ESCALA_CENTI = 100;

/** Porcentaje entero (0–100): una fracción del método (0,9) viaja como 90. */
export const ESCALA_PCT = 100;

// ---------------------------------------------------------------------------
// Empaquetado de campos pequeños en un solo valor (bits, de menos a más significativo)
// ---------------------------------------------------------------------------

/** Junta campos de `anchos[i]` bits en un número; el primero ocupa los bits bajos. */
export function empaquetar(anchos: readonly number[], valores: readonly number[]): number {
  let out = 0;
  let desplazamiento = 0;
  anchos.forEach((ancho, i) => {
    out += (valores[i] ?? 0) * 2 ** desplazamiento;
    desplazamiento += ancho;
  });
  return out;
}

/** Inversa de `empaquetar`. */
export function desempaquetar(anchos: readonly number[], valor: number): number[] {
  let resto = valor;
  return anchos.map((ancho) => {
    const modulo = 2 ** ancho;
    const campo = resto % modulo;
    resto = Math.floor(resto / modulo);
    return campo;
  });
}

// ---------------------------------------------------------------------------
// Tablas de códigos (ABI, solo se añade al final). Cada una se comprueba contra la
// unión del kit: si el kit crece y esto no, `tsc` lo dice.
// ---------------------------------------------------------------------------

type Cubierto<U, T extends readonly unknown[]> = [Exclude<U, T[number]>] extends [never] ? true : { falta: Exclude<U, T[number]> };
/** Si el argumento de tipo no es `true`, la tabla no cubre toda la unión del kit y no compila. */
function cubierto<Cubre extends true>(): Cubre | undefined {
  return undefined;
}

export const CLASES = [
  'calentamiento',
  'vuelta-calma',
  'rodaje',
  'tirada',
  'tempo',
  'series',
  'progresivo',
  'fartlek',
  'cuestas',
  'strides',
  'carrera',
  'test',
  'recuperacion',
  'descanso',
  'descanso-tandas',
  'estacion',
  'roxzone',
  'fuerza',
  'ergo',
  'emom',
  'amrap',
  'fortime',
  'movilidad',
] as const satisfies readonly Clase[];
cubierto<Cubierto<Clase, typeof CLASES>>();

export const ROLES = ['trabajo', 'recuperacion', 'descanso', 'transicion'] as const satisfies readonly Rol[];
cubierto<Cubierto<Rol, typeof ROLES>>();

export const FASES = ['calentamiento', 'principal', 'vuelta'] as const satisfies readonly Fase[];
cubierto<Cubierto<Fase, typeof FASES>>();

export const TIPOS_MEDIDA = ['distancia', 'tiempo', 'reps', 'cal', 'abierta'] as const satisfies readonly TipoMedida[];
cubierto<Cubierto<TipoMedida, typeof TIPOS_MEDIDA>>();

export const QUIEN_MIDE = ['gps', 'cinta', 'ergo', 'sensor', 'atleta', 'reloj'] as const satisfies readonly QuienMide[];
cubierto<Cubierto<QuienMide, typeof QUIEN_MIDE>>();

export const EJES = [
  'ritmo',
  'zona',
  'ppm',
  'rpe',
  'potencia',
  'pctRM',
  'kg',
  'rir',
  'split500',
  'cadencia',
  'inclinacion',
] as const satisfies readonly EjeObjetivo[];
cubierto<Cubierto<EjeObjetivo, typeof EJES>>();

export const PAPELES = ['principal', 'techo', 'secundario'] as const satisfies readonly PapelObjetivo[];
cubierto<Cubierto<PapelObjetivo, typeof PAPELES>>();

/** Sentido de aviso: el código 0 es «sin dato» (undefined), los de la tabla van de 1 a 3. */
export const SENTIDOS_AVISO = ['ambos', 'solo-arriba', 'solo-abajo'] as const satisfies readonly SentidoAviso[];
cubierto<Cubierto<SentidoAviso, typeof SENTIDOS_AVISO>>();

export const MODOS_RECUPERA = ['trote', 'andar', 'parado'] as const satisfies readonly ModoRecupera[];
cubierto<Cubierto<ModoRecupera, typeof MODOS_RECUPERA>>();

export const ENTORNOS = ['calle', 'cinta', 'pista'] as const satisfies readonly Entorno[];
cubierto<Cubierto<Entorno, typeof ENTORNOS>>();

export type TipoMaquina = 'remo' | 'ski' | 'bici' | 'cinta';
export const MAQUINAS = ['remo', 'ski', 'bici', 'cinta'] as const satisfies readonly TipoMaquina[];
cubierto<Cubierto<TipoMaquina, typeof MAQUINAS>>();

export const ROXZONAS = ['entrada', 'salida'] as const satisfies readonly SentidoRoxzone[];
cubierto<Cubierto<SentidoRoxzone, typeof ROXZONAS>>();

export const FORMATOS_WOD = ['emom', 'amrap', 'puntuacion', 'fortime', 'pared', 'deathby'] as const satisfies readonly InfoWod['formato'][];
cubierto<Cubierto<InfoWod['formato'], typeof FORMATOS_WOD>>();

export const TIPOS_CARGA = ['kg', 'rm', 'corporal', 'tuya'] as const satisfies readonly CargaFuerza['tipo'][];
cubierto<Cubierto<CargaFuerza['tipo'], typeof TIPOS_CARGA>>();

export const EJES_ESFUERZO = ['rir', 'rpe'] as const satisfies readonly EsfuerzoFuerza['eje'][];
cubierto<Cubierto<EsfuerzoFuerza['eje'], typeof EJES_ESFUERZO>>();

export const POR_LADO = ['pierna', 'brazo', 'lado'] as const satisfies readonly NonNullable<FichaFuerza['porLado']>[];
cubierto<Cubierto<NonNullable<FichaFuerza['porLado']>, typeof POR_LADO>>();

export const TURNOS_DOBLES = ['tuyo', 'pareja', 'reparto'] as const satisfies readonly Dobles['turno'][];
cubierto<Cubierto<Dobles['turno'], typeof TURNOS_DOBLES>>();

/** De dónde sale una banda de zona: la calculó el sistema (estimada) o el atleta la midió con un test. */
export const PROCEDENCIAS = ['estimada', 'medida'] as const satisfies readonly Procedencia[];
cubierto<Cubierto<Procedencia, typeof PROCEDENCIAS>>();
export type { Procedencia };

/** Unidad de una banda de ritmo: por km (correr) o por 500 m (ergómetro). */
export const UNIDADES_RITMO = ['km', '500m'] as const satisfies readonly UnidadRitmo[];
cubierto<Cubierto<UnidadRitmo, typeof UNIDADES_RITMO>>();
export type { UnidadRitmo };

/** De qué familia es una zona de un objetivo: pulso o ritmo (`Objetivo.escala`; 0 = sin dato en el cable). */
export const ESCALAS_OBJETIVO = ['ppm', 'ritmo'] as const satisfies readonly NonNullable<Objetivo['escala']>[];
cubierto<Cubierto<NonNullable<Objetivo['escala']>, typeof ESCALAS_OBJETIVO>>();

/** Cada cuánto se alternan en una estación repartida (`Dobles.alternaCada.tipo`; 0 = no alternan). */
export const TIPOS_ALTERNA = ['metros', 'reps', 'segundos'] as const satisfies readonly NonNullable<Dobles['alternaCada']>['tipo'][];
cubierto<Cubierto<NonNullable<Dobles['alternaCada']>['tipo'], typeof TIPOS_ALTERNA>>();

/** Los formatos con nombre propio del vocabulario del coach (`NOMBRE_FORMATO_DEFECTO`). */
export type { FormatoNombrado };
export const FORMATOS_NOMBRADOS = ['emom', 'amrap', 'fortime', 'pared', 'deathby', 'circuito', 'test', 'series', 'fuerza', 'continuo'] as const satisfies readonly FormatoNombrado[];
cubierto<Cubierto<FormatoNombrado, typeof FORMATOS_NOMBRADOS>>();

// ---------------------------------------------------------------------------
// Diseño de los valores empaquetados (anchos en bits, de bajo a alto)
// ---------------------------------------------------------------------------

/** rol (2) · fase (2) · cierre por el atleta (1). */
export const ANCHOS_ROL_FASE = [2, 2, 1] as const;

/** tipo de medida (3) · quién mide (3). */
export const ANCHOS_MEDIDA = [3, 3] as const;

/** eje (4) · papel (2) · lleva palabra (1) · sentido de aviso (2, 0 = sin dato) · escala de la zona (2, 0 = sin dato). */
export const ANCHOS_OBJETIVO = [4, 2, 1, 2, 2] as const;

/** modo de recuperación (2, 0 = sin dato) · entorno (2) · máquina (3) · Roxzone (2). */
export const ANCHOS_EXTRAS = [2, 2, 3, 2] as const;

/** Lleva dosis · carga · corporal · corre (1 bit cada uno) y quién la mide (3). */
export const ANCHOS_TAREA = [1, 1, 1, 1, 3] as const;

/** por lado (2, 0 = no) · aproximación (1) · lleva barra vacía (1). */
export const ANCHOS_FICHA = [2, 1, 1] as const;

/** Las banderas de presencia de un paso, en el orden de sus bits tras los 2 del recuento de objetivos. */
export const BANDERAS_PASO = [
  'posicion',
  'bloque',
  'nombre',
  'carga',
  'extras',
  'tempo',
  'cue',
  'vueltaAuto',
  'wod',
  'fuerza',
  'dobles',
  'damper',
  'grupo',
] as const;
export type BanderaPaso = (typeof BANDERAS_PASO)[number];
export const ANCHOS_BANDERAS_PASO = [2, ...BANDERAS_PASO.map(() => 1)] as const;

/** Los dos avisos booleanos de las reglas: calentamiento (1) · recuperación (1). */
export const ANCHOS_FLAGS_REGLAS = [1, 1] as const;

/** Nº máximo de objetivos por paso (M1: principal + techo o secundario). */
export const MAX_OBJETIVOS = 2;

/** Los contadores anidados de una posición, en el orden en que viajan. */
export const CONTADORES = ['tanda', 'serie', 'tramo', 'ronda', 'estacion'] as const;
export const ANCHOS_POSICION = [1, 1, 1, 1, 1, 1] as const;

// ---------------------------------------------------------------------------
// Claves conocidas de cada objeto del modelo: cualquier otra es un hueco
// ---------------------------------------------------------------------------

export const CLAVES_PASO: readonly string[] = [
  'id',
  'clase',
  'rol',
  'fase',
  'medida',
  'objetivos',
  'posicion',
  'nombre',
  'modoRecupera',
  'entorno',
  'carga',
  'maquina',
  'tempo',
  'cue',
  'cierre',
  'vueltaAutoM',
  'bloque',
  'roxzone',
  'wod',
  'fuerza',
  'dobles',
  'grupo',
];
export const CLAVES_MEDIDA: readonly string[] = ['tipo', 'prescrito', 'mide'];
export const CLAVES_OBJETIVO: readonly string[] = ['eje', 'min', 'max', 'papel', 'avisa', 'palabra', 'escala'];
export const CLAVES_POSICION: readonly string[] = [...CONTADORES, 'slot'];
export const CLAVES_CARGA: readonly string[] = ['kg', 'implementos'];
export const CLAVES_MAQUINA: readonly string[] = ['tipo', 'damper'];
export const CLAVES_TEMPO: readonly string[] = ['excentrica', 'pausaAbajo', 'concentrica', 'pausaArriba'];
export const CLAVES_TAREA: readonly string[] = ['nombre', 'dosis', 'carga', 'corporal', 'mide', 'corre'];
export const CLAVES_FICHA: readonly string[] = ['ejercicio', 'carga', 'esfuerzo', 'porLado', 'aproximacion', 'pasoKg', 'vaciaKg'];
export const CLAVES_DOBLES: readonly string[] = ['turno', 'pareja', 'estacion', 'tuyas', 'suyas', 'pctTuyo', 'nota', 'alternaCada'];
export const CLAVES_PLAN: readonly string[] = ['pasos', 'zonas', 'reglas', 'vocabulario', 'metodo', 'bandasRitmo', 'pareja'];
export const CLAVES_ZONAS: readonly string[] = ['techos', 'nombres', 'procedencia'];
export const CLAVES_GRUPO: readonly string[] = ['id', 'veces'];
export const CLAVES_ALTERNA: readonly string[] = ['tipo', 'n'];

/** El slot de una superserie: una letra y un número («A1», «B2»). */
export const PATRON_SLOT = /^([A-Z])(\d{1,3})$/;
/** «A» = 1: el código de la letra de un slot. */
export const CODIGO_LETRA_A = 'A'.charCodeAt(0) - 1;

// ---------------------------------------------------------------------------
// Qué es cada cadena del cable: solo estas seis cosas son texto
// ---------------------------------------------------------------------------

/**
 * `catalogo` = nombre de la biblioteca (ejercicio, estación, tarea, máquina);
 * `cue` = coaching corto del coach; `palabra` = la palabra del coach para un
 * RPE; `vocabulario` = nombre de clase, de formato o palabra de RPE del coach;
 * `zona` = nombre de una zona; `pareja` = el nombre de pila de la pareja de
 * dobles (uno por sesión). Ninguna cadena DERIVADA viaja (la línea del brief,
 * la estación de dobles, el pacto): el reloj las compone del dato.
 */
export type TipoCadena = 'catalogo' | 'cue' | 'palabra' | 'vocabulario' | 'zona' | 'pareja';

/** Cadenas que se truncan (con aviso) en vez de rechazarse. */
export const CADENAS_TRUNCABLES: ReadonlySet<TipoCadena> = new Set<TipoCadena>(['cue']);

/** El texto que un plan sano lleva: todo lo demás es texto libre que se coló. */
export const CADENAS_ADMITIDAS: ReadonlySet<TipoCadena> = new Set<TipoCadena>([
  'catalogo',
  'cue',
  'palabra',
  'vocabulario',
  'zona',
  'pareja',
]);
