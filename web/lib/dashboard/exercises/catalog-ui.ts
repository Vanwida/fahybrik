import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { modalitySchema, type Modality } from '@fahybrid/shared/domain/prescription';
import { detectCardioModality } from '@fahybrid/shared/domain/exercises/classify';
import {
  COACH_OVERRIDE_FIELDS,
  type CoachExerciseRow,
  type CoachOverrideField,
  type ExerciseOrigin,
} from '@/lib/exercises/coach-override';
import { EXERCISE_CATEGORY_LABELS } from '@/lib/dashboard/exercises/filter-chips';

/**
 * El vocabulario COACH-FACING del catálogo de ejercicios — lo que comparten el
 * panel de Biblioteca y su editor. Aquí sólo hay DATOS (etiquetas + nombres de
 * token) y funciones puras: ni un color literal, ni JSX.
 *
 * Las etiquetas de categoría NO se redefinen aquí: salen de
 * EXERCISE_CATEGORY_LABELS, que ya existía. Este módulo sólo les pone ORDEN — un
 * Record no lo tiene y el <select> de crear necesita uno estable.
 */

/**
 * El orden en que se ofrecen las categorías, ESPEJO del que ya usa el catálogo en
 * SQL (`exerciseCatalogOrder` en lib/exercises/coach-override.ts: estaciones
 * primero … movilidad al final). Se repite la prioridad a propósito y sólo aquí:
 * el orden de un desplegable no puede salir de un fragmento de SQL. Es el único
 * sitio del cliente que lo sabe — si allí cambia, cambia aquí.
 */
export const EXERCISE_CATEGORY_ORDER: readonly ExerciseCategory[] = [
  'hyrox_station',
  'strength',
  'cardio',
  'skill',
  'plyometric',
  'core',
  'mobility',
];

/** Las categorías como opciones ordenadas (crear / editar). */
export const EXERCISE_CATEGORY_OPTIONS: ReadonlyArray<{
  value: ExerciseCategory;
  label: string;
}> = EXERCISE_CATEGORY_ORDER.map((value) => ({ value, label: EXERCISE_CATEGORY_LABELS[value] }));

/**
 * LAS NUEVE MODALIDADES, en vocabulario de gimnasio. Es lo que el coach DECLARA al
 * crear un movimiento: las analíticas enrutan por aquí, así que un "Remo 500m" que
 * entra como `other` rompe en silencio. Por eso `createExerciseSchema` la exige y ya
 * no la deriva del nombre (ver lib/dashboard/exercises/create-exercise.ts).
 *
 * OJO, ESTO NO ES `MODALITY_META` (components/v2/constants.ts). Aquélla tiene CINCO
 * claves porque es el eje de COLOR: remo, ski y bici caen las tres en "ergo" — un
 * punto naranja no distingue máquinas y no tiene por qué. Aquí hacen falta las nueve
 * REALES, que es lo que guarda la columna y con lo que se compara. Dos espacios de
 * claves distintos para dos trabajos distintos, no una copia.
 */
export const MODALITY_LABELS: Record<Modality, string> = {
  run: 'Carrera',
  row: 'Remo',
  ski: 'SkiErg',
  bike: 'BikeErg',
  strength: 'Fuerza',
  functional: 'Funcional',
  core: 'Core',
  mobility: 'Movilidad',
  other: 'Otro',
};

/**
 * Las opciones del selector, GENERADAS del enum canónico (`modalitySchema.options`)
 * en vez de escritas a mano: si el dominio gana una modalidad, el desplegable la
 * ofrece solo y el Record de arriba obliga a ponerle nombre — o no compila. El orden
 * del enum ya sirve tal cual: el cardio primero (que es donde el coach duda), luego
 * fuerza y funcional, y `other` al final, que es la salida y no la primera opción.
 */
export const MODALITY_OPTIONS: ReadonlyArray<{ value: Modality; label: string }> =
  modalitySchema.options.map((value) => ({ value, label: MODALITY_LABELS[value] }));

/** Cuando el nombre no dice nada, lo dice la categoría. */
const CATEGORY_MODALITY: Record<ExerciseCategory, Modality> = {
  cardio: 'run',
  hyrox_station: 'functional',
  strength: 'strength',
  plyometric: 'functional',
  skill: 'functional',
  core: 'core',
  mobility: 'mobility',
};

/**
 * En estas TRES la categoría ya ES la disciplina, así que el nombre no se mira: en
 * `strength`, "Remo con barra" es fuerza — ahí "remo" nombra el movimiento, no la
 * máquina. Es el falso positivo clásico, y mirar la categoría antes que el nombre lo
 * mata sin necesidad de una lista de excepciones que nunca acabaría.
 */
const CATEGORY_IS_THE_DISCIPLINE: ReadonlySet<ExerciseCategory> = new Set<ExerciseCategory>([
  'strength',
  'core',
  'mobility',
]);

/**
 * La modalidad que el formulario PRE-SELECCIONA. Sugiere, nunca decide: el coach la
 * ve y la confirma o la cambia antes de que se mande nada.
 *
 * El nombre sólo desempata QUÉ cardio es ("Remo 500m" → row, no el `other` que daba
 * la regla vieja). Todo lo demás lo dice la categoría. Deliberadamente corta: una
 * heurística que acierta el 90% y se ve es útil; una que acierta el 99% y no se ve es
 * la que nos trajo hasta aquí.
 *
 * QUÉ sabe el nombre lo dice `detectCardioModality` (shared/domain/exercises/
 * classify.ts) — la MISMA tabla que usa `guessMovement` para el alta en bloque
 * desde una foto. Antes vivía duplicada aquí con su propia lista de palabras,
 * ligeramente distinta; una sola tabla es la que este módulo lleva todo el día
 * defendiendo. Lo que NO se comparte es el fallback: cuando el nombre no dice
 * nada, `guessMovement` prefiere `null` (mejor preguntar que adivinar mal), pero
 * este formulario SIEMPRE tiene que ofrecer algo — por eso cae a la categoría
 * (`CATEGORY_MODALITY`), nunca a `null`. Comportamiento observable sin cambios.
 */
export function suggestModality(name: string, category: ExerciseCategory): Modality {
  const fallback = CATEGORY_MODALITY[category];
  if (CATEGORY_IS_THE_DISCIPLINE.has(category)) return fallback;
  return detectCardioModality(name) ?? fallback;
}

/**
 * Lo que enseña el campo de modalidad: lo del coach si ya eligió, y si no la
 * sugerencia — que se recalcula MIENTRAS escribe el nombre.
 *
 * En cuanto elige, `picked` deja de ser null y la sugerencia no puede volver a
 * pisarle lo suyo. Sin eso, poner "Remo", elegir Fuerza y seguir escribiendo
 * ("Remo con barra") devolvería el campo a Remo solo: un campo que se descambia
 * mientras terminas de escribir es un campo roto, y el coach no volvería a fiarse
 * de ninguno.
 */
export function resolveModality(
  picked: Modality | null,
  name: string,
  category: ExerciseCategory,
): { value: Modality; suggested: boolean } {
  if (picked !== null) return { value: picked, suggested: false };
  return { value: suggestModality(name, category), suggested: true };
}

export interface OriginMeta {
  /** Cómo lo llama el coach en la fila y en el filtro. */
  label: string;
  /** Token del texto de la etiqueta. */
  fgVar: string;
  /** Token del fondo de la etiqueta. */
  bgVar: string;
}

/**
 * Los TRES orígenes, con la etiqueta y los tokens de su chip.
 *
 * POR QUÉ `own` lleva texto `--v2-fg` y no `--v2-accent`: el naranja de marca
 * sobre su propio tinte da ~2.8:1 en el tema CLARO (falla AA 4.5:1 para texto
 * pequeño). El resto de ejes del sistema tienen variante oscurecida para claro
 * (--v2-ok / --v2-warn / --v2-info / --v2-mod-*), pero el acento no la tiene —
 * sólo existe como RELLENO con --v2-accent-fg encima (así lo usa el CTA). Así que
 * el naranja aquí lo pone el TINTE de fondo y el texto va en tinta: mismo
 * significado, AA en los dos temas, y sin competir con el naranja sólido del CTA
 * "Nuevo ejercicio" que vive en la misma barra.
 */
export const EXERCISE_ORIGIN_META: Record<ExerciseOrigin, OriginMeta> = {
  base: { label: 'Base', fgVar: '--v2-muted', bgVar: '--v2-surface-2' },
  customized: { label: 'Personalizado', fgVar: '--v2-info', bgVar: '--v2-info-soft' },
  own: { label: 'Mío', fgVar: '--v2-fg', bgVar: '--v2-accent-soft' },
};

/** El eje del filtro: los tres orígenes + "todos" (que no filtra). */
export type OriginFacet = 'todos' | ExerciseOrigin;

/**
 * Las pestañas del filtro. En plural de coach ("Míos", "Personalizados") aunque el
 * chip de la fila vaya en singular ("Mío") — un filtro cuenta cosas, una etiqueta
 * califica una.
 */
export const ORIGIN_FACET_OPTIONS: ReadonlyArray<{ value: OriginFacet; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'base', label: 'Base' },
  { value: 'own', label: 'Míos' },
  { value: 'customized', label: 'Personalizados' },
];

/** Cómo llama el coach a cada campo forkeable cuando ya es SUYO. */
const OVERRIDE_FIELD_NOUN: Record<CoachOverrideField, string> = {
  name: 'tu nombre',
  cues: 'tus claves',
  description: 'tu descripción',
  video_url: 'tu vídeo',
};

/** Y cómo lo llama cuando es sólo una etiqueta de formulario. */
export const OVERRIDE_FIELD_LABEL: Record<CoachOverrideField, string> = {
  name: 'Nombre',
  cues: 'Claves',
  description: 'Descripción',
  video_url: 'Vídeo',
};

/** Los campos que este coach ha forkeado de verdad, en el orden del contrato. */
export function forkedFields(ex: CoachExerciseRow): CoachOverrideField[] {
  return COACH_OVERRIDE_FIELDS.filter((f) => ex[`override_${f}`] != null);
}

/**
 * "tu vídeo y tus claves" — QUÉ ha tocado el coach, para que el fork sea legible
 * en la propia fila y no haya que abrir el editor para saberlo. Null cuando no hay
 * fork (una fila Base no dice nada de más).
 */
export function forkedSummary(ex: CoachExerciseRow): string | null {
  const nouns = forkedFields(ex).map((f) => OVERRIDE_FIELD_NOUN[f]);
  if (nouns.length === 0) return null;
  if (nouns.length === 1) return nouns[0]!;
  return `${nouns.slice(0, -1).join(', ')} y ${nouns[nouns.length - 1]}`;
}

/**
 * MATERIAL y MÚSCULOS, en cristiano. `exercises.equipment` /
 * `primary_muscle_groups` guardan tokens en inglés y con guión bajo
 * (`wall_ball`, `atlas_stone`, `full_body`): son la CLAVE de máquina, y enseñarlos
 * tal cual delante del coach ("Fuerza · atlas_stone · glutes") es soltarle el
 * volcado de la base de datos.
 *
 * Vocabulario de gimnasio real, no traducción literal: `kettlebell` se dice
 * kettlebell y `barbell` se dice barra. Cubre los 27+25 valores que hay hoy en el
 * catálogo Base; lo que no esté cae en `humanizeToken`, que sólo quita los guiones
 * bajos. Eso es lo que salva al ejercicio PROPIO: ahí el coach escribe su material
 * en español ("barra, banco") y tiene que salir tal como lo escribió.
 *
 * `quads`/`quadriceps` y `erectors`/`lower back` conviven en los datos reales
 * (semilla inconsistente): las dos claves apuntan al mismo término y se acabó.
 */
const EQUIPMENT_ES: Record<string, string> = {
  ab_wheel: 'rueda abdominal',
  assault_bike: 'assault bike',
  atlas_stone: 'piedra de Atlas',
  band: 'goma',
  barbell: 'barra',
  bench: 'banco',
  bike_erg: 'BikeErg',
  bodyweight: 'peso corporal',
  box: 'cajón',
  cable: 'polea',
  dip_belt: 'cinturón de lastre',
  dumbbell: 'mancuerna',
  foam_roller: 'foam roller',
  jump_rope: 'comba',
  kettlebell: 'kettlebell',
  parallel_bars: 'paralelas',
  plate: 'disco',
  pull_up_bar: 'barra de dominadas',
  rack: 'rack',
  resistance_band: 'goma elástica',
  rope: 'cuerda',
  rower: 'remo',
  running: 'correr',
  sandbag: 'saco',
  ski_erg: 'SkiErg',
  sled: 'trineo',
  wall_ball: 'balón medicinal',
};

const MUSCLE_ES: Record<string, string> = {
  adductors: 'aductores',
  biceps: 'bíceps',
  calves: 'gemelos',
  chest: 'pecho',
  core: 'core',
  erectors: 'lumbares',
  forearms: 'antebrazos',
  full_body: 'cuerpo entero',
  glutes: 'glúteos',
  hamstrings: 'isquios',
  hip_flexors: 'flexores de cadera',
  hips: 'cadera',
  it_band: 'cintilla iliotibial',
  lats: 'dorsales',
  'lower back': 'lumbares',
  'middle back': 'espalda media',
  obliques: 'oblicuos',
  quadriceps: 'cuádriceps',
  quads: 'cuádriceps',
  rotator_cuff: 'manguito rotador',
  shoulders: 'hombros',
  thoracic_spine: 'columna torácica',
  traps: 'trapecios',
  triceps: 'tríceps',
  upper_back: 'espalda alta',
};

/** Lo que no está en el diccionario: al menos, sin guiones bajos. */
function humanizeToken(token: string): string {
  return token.replace(/_/g, ' ').trim();
}

export const equipmentLabel = (token: string): string =>
  EQUIPMENT_ES[token.toLowerCase()] ?? humanizeToken(token);

export const muscleLabel = (token: string): string =>
  MUSCLE_ES[token.toLowerCase()] ?? humanizeToken(token);

/**
 * La línea de debajo del nombre: qué ES el movimiento, en el idioma del coach.
 * Categoría · material · músculos, recortado — la fila informa, no inventaria.
 */
export function exerciseSubtitle(ex: CoachExerciseRow): string {
  return [
    EXERCISE_CATEGORY_LABELS[ex.category],
    ex.equipment[0] ? equipmentLabel(ex.equipment[0]) : undefined,
    ex.primary_muscle_groups.slice(0, 2).map(muscleLabel).join(', '),
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

/**
 * El buscador del panel, ESPEJO del `where` del servidor (nombre fusionado + slug,
 * insensible a mayúsculas). Se filtra en cliente porque el catálogo entero ya está
 * en memoria — pero la semántica tiene que ser la MISMA que la de la API, o buscar
 * daría un resultado distinto según por dónde entre la búsqueda.
 */
export function matchesExerciseQuery(ex: CoachExerciseRow, q: string): boolean {
  if (!q) return true;
  return ex.name.toLowerCase().includes(q) || ex.slug.toLowerCase().includes(q);
}
