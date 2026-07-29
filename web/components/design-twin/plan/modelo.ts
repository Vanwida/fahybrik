// EL PLAN — un solo modelo, leído a tres distancias.
//
// Las tres vistas del plan (`plan-ciclo`, `plan-semana`, `plan-dia`) no son tres
// pantallas con datos distintos: son tres preguntas sobre el MISMO objeto.
//
//   · ciclo  → ¿hacia dónde voy y cuánto queda?
//   · semana → ¿qué me toca y qué llevo?
//   · día    → ¿qué hay, en qué orden y con qué dosis?
//
// Vive aquí y no dentro de una pantalla por la regla 0 del CONTRATO-UI: si otro
// fichero puede necesitarlo, va al sitio compartido. Tres vistas construidas
// cada una con su modelo es exactamente cómo nacieron las tres grafías de la
// dosis del 29-jul.
//
// ---------------------------------------------------------------------------
// LA LEY QUE ESTE MODELO HACE ESTRUCTURAL
// ---------------------------------------------------------------------------
//
// El plan futuro tiene dos mitades y solo una se sabe:
//
//   · La ESTRUCTURA está DECIDIDA, así que es un hecho y se pinta con seguridad:
//     qué microciclos hay, en qué orden, cuántas semanas dura cada uno, cómo los
//     llamó el coach, dónde estás hoy, qué tests están marcados y cuándo es la
//     carrera. Nada de eso depende de lo que el atleta haga.
//
//   · El RESULTADO MEDIDO del futuro NO se sabe: carga, volumen, TSS, ritmos,
//     adherencia, cómo va a responder. Depende de lo que haga, y por eso una
//     barra de volumen previsto para dentro de tres semanas MIENTE.
//
// Por eso este modelo **no tiene ningún campo donde quepa un volumen futuro**.
// No es una omisión: es la ley del §7 hecha tipo. Si mañana alguien quiere
// dibujar una rampa de carga previsible, tendrá que añadir el campo y toparse
// con este comentario primero.
//
// La única estimación admitida es `previstoMin`, y va marcada en su sitio: sale
// de la prescripción (metros ÷ ritmo, rondas × trabajo, `total_s`), se pinta
// SIEMPRE con «unos» y es `null` cuando la prescripción no trae dosis, que pasa
// de verdad (el «Metcon» del coach llega con los dos ítems vacíos).
//
// ---------------------------------------------------------------------------
// AGNÓSTICO — la etiqueta de fase SALE DEL DATO
// ---------------------------------------------------------------------------
//
// Verificado contra el esquema, no supuesto: la **migración 0064 borró la
// entidad «fase»** (`drop table methodology_phases`, `drop column phase_id` de
// `program_month_templates`, `program_week_templates` y `program_sequence_items`).
// Lo dejó escrito `docs/DECISIONS.md`: «el ORDEN de los microciclos ES la
// periodización; una fase es el nombre y la duración de una plantilla mensual
// más su posición en la secuencia».
//
// En consecuencia, `Tramo.nombre` es `program_month_templates.name` TAL CUAL lo
// escribió el coach («Acumulación», «Adaptación»). El sistema no bautiza fases,
// no asume un orden de fases y no tiene catálogo. Un tramo sin nombre no tiene
// etiqueta y se pinta sin ella.

import type { Modalidad, SesionReal } from '../datos-reales';

// ---------------------------------------------------------------------------
// EL CICLO — la secuencia de microciclos y el cursor de hoy
// ---------------------------------------------------------------------------

/**
 * Un hito DECIDIDO: existe porque alguien lo puso en el calendario, así que se
 * pinta con seguridad aunque caiga en el futuro.
 *
 * Dos procedencias reales, y la diferencia importa porque cambia lo que se
 * puede decir:
 *
 *   · Ya materializado → tiene FECHA. Es una asignación con
 *     `workout_assignments.calibration_test_id`, o una fila de `races`.
 *   · Aún no materializado → solo tiene POSICIÓN. Sale de la cadencia del coach
 *     (`coach_test_schedule`: `week_offset` + `day_of_week`), que dice «en la
 *     semana 1, el miércoles» de cada microciclo. Eso también está decidido.
 *
 * Nunca se inventa una fecha desde una posición: «el miércoles de la semana 1»
 * es lo que se sabe, y es lo que se dice.
 */
export interface Hito {
  clase: 'test' | 'carrera';
  /** `coach_calibration_tests.name` o `races.name`. No se reescribe. */
  nombre: string;
  /** Días desde hoy. Negativo = ya pasó. `null` = aún no tiene fecha. */
  enDias: number | null;
  /** Semana del tramo, 1-based. Solo cuando no hay fecha todavía. */
  semanaDelTramo: number | null;
  /** Inicial del día de la semana («X»). Solo cuando no hay fecha todavía. */
  diaInicial: string | null;
}

/** Dónde cae un tramo respecto a hoy. Lo deriva `estadoDeTramo`, no se escribe. */
export type EstadoTramo = 'pasado' | 'actual' | 'proximo';

/**
 * Un microciclo de la secuencia — `program_month_templates` ordenada por
 * `program_sequence_items.position`.
 *
 * No lleva volumen, ni carga, ni intensidad prevista: ver la ley de arriba.
 */
export interface Tramo {
  /** `program_month_templates.name`. LA etiqueta del coach; el sistema no la escribe. */
  nombre: string;
  /** Semanas del tramo (`program_month_weeks`, o `microcycle_ids[]` al materializar). */
  semanas: number;
  /** `athlete_levels.label`. `null` = el tramo no declara nivel. */
  nivel: string | null;
  /** Los hitos decididos que caen dentro. Vacío = ninguno. */
  hitos: Hito[];
}

/** Qué pasa al acabar el último tramo (`program_sequences.end_policy`). */
export type AlAcabar = 'repite' | 'sube-nivel' | 'termina';

export interface Carrera {
  /** `races.name`. */
  nombre: string;
  /** Días desde hoy. */
  enDias: number;
  /** `races.goal_time_seconds`. `null` = el atleta no se ha puesto objetivo. */
  objetivoS: number | null;
}

export interface Ciclo {
  /**
   * Los tramos EN ORDEN. El orden ES la periodización (migración 0064).
   * Vacío = el atleta no tiene ninguna estructura publicada.
   */
  tramos: Tramo[];
  /**
   * Índice del tramo en el que cae hoy. `-1` = hoy no cae en ninguno, y eso
   * pasa de verdad: en producción el plan del atleta 67 acabó el 26-jul y no
   * hay ni una asignación posterior a hoy en TODA la base.
   */
  indiceActual: number;
  /** Semana dentro del tramo actual, 1-based. `null` cuando `indiceActual` es -1. */
  semanaEnTramo: number | null;
  /**
   * `program_sequences.end_policy`. `null` = el atleta no camina ninguna
   * secuencia, así que **no se sabe** qué viene después y se dice.
   */
  alAcabar: AlAcabar | null;
  /** La carrera objetivo (`races` con `priority='target'`). `null` = no hay. */
  carrera: Carrera | null;
  /** Qué filas de producción son. Se publica en el panel del doble. */
  procedencia: string;
}

// ---------------------------------------------------------------------------
// LA SEMANA Y EL DÍA
// ---------------------------------------------------------------------------

/**
 * Una unidad de trabajo de un día. Puede venir del coach o ser un entreno libre
 * del atleta, y las dos cosas conviven en el mismo día: es el caso REAL del
 * atleta 64, que el 28-jul tiene cuatro libres y un test del coach.
 */
export interface Trabajo {
  /** `templates.name`. No se reescribe ni se traduce. */
  titulo: string;
  /** `workout_assignments.origin`: lo manda el coach o te lo montas tú. */
  origen: 'coach' | 'libre';
  /**
   * Es un test de calibración (`workout_assignments.calibration_test_id`).
   * Importa porque un test no es una sesión más: mide, y su resultado recalibra.
   */
  esTest: boolean;
  /**
   * Las modalidades que MANDAN, como mucho dos — el mismo criterio que el
   * carril de `plan-bloque`: con tres puntos en una ficha de 46 pt ya no se
   * distingue ninguno. Se declaran, no se cuentan de los ítems: si se contaran,
   * `mobility` ganaría siempre porque está en todos los calentamientos.
   */
  modalidades: Modalidad[];
  /**
   * La sesión entera cuando la tenemos modelada (bloques e ítems con su dosis).
   * `null` = solo sabemos el titular; la vista de día lo dice en vez de fingir.
   */
  ref: SesionReal | null;
  /**
   * Minutos MEDIDOS de la ejecución (`total_duration_seconds`).
   * `null` = no hay ejecución, y entonces no hay ningún tiempo que enseñar.
   */
  medidoMin: number | null;
  /**
   * Estimación desde la prescripción. Se pinta SIEMPRE con «unos» y jamás se
   * mezcla con `medidoMin`.
   *
   * `null` cuando la prescripción no trae dosis y por tanto no hay nada de lo
   * que estimar. Es el caso del «Metcon» del coach (plantillas 439 y 444): sus
   * dos ítems de trabajo llegan con `{"scheme":"sets"}` y nada más.
   */
  previstoMin: number | null;
}

export interface Dia {
  /** Inicial («L») y nombre («lunes») — el vocabulario, en un solo sitio. */
  inicial: string;
  nombre: string;
  /** Día del mes. */
  numero: number;
  /** Todo lo que hay ese día, en el orden en que toca. Vacío = descanso. */
  trabajos: Trabajo[];
}

export interface Semana {
  /** Siempre siete, de lunes a domingo. */
  dias: Dia[];
  /** Índice de hoy. `-1` = la semana que miras no es la de hoy. */
  indiceHoy: number;
  /**
   * Lo que el coach escribió para esta semana (`program_week_templates.focus`
   * / `coach_notes`). `null` = no escribió nada, y entonces no hay línea: el
   * sistema no rellena la voz del coach.
   */
  intencion: string | null;
  /**
   * Dónde cae la semana dentro del ciclo. `null` = fuera de todo tramo (entre
   * planes, o plan terminado). El nombre sale del dato, nunca de una constante.
   */
  enTramo: { nombre: string; semana: number; de: number } | null;
}

// ---------------------------------------------------------------------------
// LECTURAS — todo lo derivado se calcula aquí, una sola vez
// ---------------------------------------------------------------------------

/** Los cuatro estados de un día. `esHoy` va aparte: es otra dimensión. */
export type EstadoDia = 'hecha' | 'saltada' | 'pendiente' | 'descanso';

/**
 * El estado de un día.
 *
 * Manda la EJECUCIÓN, no `workout_assignments.status`: en producción la
 * asignación 244 (Simulación HYROX del 24-jul) sigue en `scheduled` mientras su
 * ejecución 59 existe y marcó 1:13:00. El estado guardado se queda viejo; lo
 * que se midió, no.
 */
export function estadoDia(dia: Dia, indice: number, indiceHoy: number): EstadoDia {
  if (dia.trabajos.length === 0) return 'descanso';
  if (dia.trabajos.some((t) => t.medidoMin !== null)) return 'hecha';
  // Una semana que no es la de hoy (indiceHoy = -1) no tiene días «saltados»:
  // si es pasada están todos juzgados por su ejecución, y si es futura no hay
  // nada que juzgar todavía.
  if (indiceHoy < 0) return 'pendiente';
  return indice < indiceHoy ? 'saltada' : 'pendiente';
}

export function estadoDeTramo(indice: number, indiceActual: number): EstadoTramo {
  if (indiceActual < 0) return indice === 0 ? 'proximo' : 'proximo';
  if (indice === indiceActual) return 'actual';
  return indice < indiceActual ? 'pasado' : 'proximo';
}

/** Un contador se pinta en cero (§6.2 bis): «0 de 5» es información. */
export function cuentaSesiones(semana: Semana): { hechas: number; total: number } {
  const total = semana.dias.reduce((n, d) => n + d.trabajos.length, 0);
  const hechas = semana.dias.reduce(
    (n, d) => n + d.trabajos.filter((t) => t.medidoMin !== null).length,
    0,
  );
  return { hechas, total };
}

/**
 * Los minutos que YA se han medido esta semana. Es una medida del pasado, así
 * que existe o no existe: `null` cuando todavía no se ha medido nada, nunca 0.
 */
export function minutosMedidos(semana: Semana): number | null {
  const total = semana.dias.reduce(
    (n, d) => n + d.trabajos.reduce((m, t) => m + (t.medidoMin ?? 0), 0),
    0,
  );
  return total > 0 ? total : null;
}

export interface RepartoModalidad {
  modalidad: Modalidad;
  sesiones: number;
}

/**
 * El reparto de la semana por modalidad — **en sesiones, no en minutos**.
 *
 * Los minutos por modalidad no se saben: una sesión medida trae su duración
 * total, no repartida por ejercicio (`workout_executions` no tiene columna de
 * modalidad; la tiene `segment_executions`, y 3 de cada 10 ejecuciones de
 * producción no traen ni un segmento). Contar sesiones sí es un hecho, y es la
 * pregunta que trae el atleta: «¿esta semana es de correr o de hierro?».
 */
export function repartoSemana(semana: Semana): RepartoModalidad[] {
  const cuenta = new Map<Modalidad, number>();
  for (const dia of semana.dias) {
    for (const trabajo of dia.trabajos) {
      for (const m of trabajo.modalidades) {
        cuenta.set(m, (cuenta.get(m) ?? 0) + 1);
      }
    }
  }
  return [...cuenta.entries()]
    .map(([modalidad, sesiones]) => ({ modalidad, sesiones }))
    .sort((a, b) => b.sesiones - a.sesiones);
}

/** Las horas de una semana: «3,5». Sale del canónico, no de un `toFixed` suelto. */
export function horas(minutos: number): string {
  return (minutos / 60).toFixed(1).replace('.', ',');
}

/** El primer día con trabajo a partir de `desde` (incluido). `null` = no queda ninguno. */
export function proximoDiaConTrabajo(semana: Semana, desde: number): { dia: Dia; indice: number } | null {
  for (let i = Math.max(0, desde); i < semana.dias.length; i += 1) {
    if (semana.dias[i].trabajos.length > 0) return { dia: semana.dias[i], indice: i };
  }
  return null;
}

/** El último día con trabajo antes de `antes`. `null` = no hay ninguno detrás. */
export function ultimoDiaConTrabajo(semana: Semana, antes: number): { dia: Dia; indice: number } | null {
  for (let i = Math.min(antes, semana.dias.length) - 1; i >= 0; i -= 1) {
    if (semana.dias[i].trabajos.length > 0) return { dia: semana.dias[i], indice: i };
  }
  return null;
}

/** Semanas totales del ciclo — la suma de sus tramos. */
export function semanasDelCiclo(ciclo: Ciclo): number {
  return ciclo.tramos.reduce((n, t) => n + t.semanas, 0);
}

/**
 * En qué semana del CICLO entero estás, 1-based. `null` cuando hoy no cae en
 * ningún tramo. No se extrapola: sin cursor no hay posición.
 */
export function semanaDelCiclo(ciclo: Ciclo): number | null {
  if (ciclo.indiceActual < 0 || ciclo.semanaEnTramo === null) return null;
  const antes = ciclo.tramos.slice(0, ciclo.indiceActual).reduce((n, t) => n + t.semanas, 0);
  return antes + ciclo.semanaEnTramo;
}

/**
 * Las semanas que quedan de estructura publicada. `null` cuando hoy no cae en
 * ningún tramo — que no es lo mismo que cero: cero sería «acabas hoy».
 */
export function semanasQueQuedan(ciclo: Ciclo): number | null {
  const actual = semanaDelCiclo(ciclo);
  if (actual === null) return null;
  return Math.max(0, semanasDelCiclo(ciclo) - actual);
}

/** Todos los hitos del ciclo con el tramo al que pertenecen, en orden de tramo. */
export function hitosDelCiclo(ciclo: Ciclo): Array<{ hito: Hito; indiceTramo: number }> {
  return ciclo.tramos.flatMap((t, indiceTramo) => t.hitos.map((hito) => ({ hito, indiceTramo })));
}

/**
 * El siguiente hito por venir. `null` = no queda ninguno.
 *
 * Ordena por lo que se sabe: primero los que tienen fecha (por cercanía), luego
 * los que solo tienen posición (por orden de tramo). Un hito sin fecha nunca
 * adelanta a uno con fecha, porque no sabemos si cae antes.
 */
export function proximoHito(ciclo: Ciclo): { hito: Hito; indiceTramo: number } | null {
  const todos = hitosDelCiclo(ciclo);
  const conFecha = todos
    .filter((h) => h.hito.enDias !== null && h.hito.enDias >= 0)
    .sort((a, b) => (a.hito.enDias as number) - (b.hito.enDias as number));
  if (conFecha.length > 0) return conFecha[0];
  const sinFecha = todos.filter(
    (h) => h.hito.enDias === null && h.indiceTramo >= Math.max(0, ciclo.indiceActual),
  );
  return sinFecha[0] ?? null;
}

/**
 * Cuándo cae un hito, en palabras. Nunca inventa una fecha desde una posición.
 *
 * Con fecha: «en 12 días». Sin fecha: «semana 1 · miércoles», que es
 * exactamente lo que la cadencia del coach sabe y ni un día más.
 */
export function cuandoElHito(hito: Hito): string {
  if (hito.enDias !== null) {
    if (hito.enDias < 0) return 'ya pasó';
    if (hito.enDias === 0) return 'hoy';
    if (hito.enDias === 1) return 'mañana';
    if (hito.enDias < 14) return `en ${hito.enDias} días`;
    const semanas = Math.round(hito.enDias / 7);
    return `en ${semanas} semanas`;
  }
  if (hito.semanaDelTramo === null) return 'sin fecha';
  const dia = hito.diaInicial ? ` · ${NOMBRE_DIA[hito.diaInicial] ?? hito.diaInicial}` : '';
  return `semana ${hito.semanaDelTramo}${dia}`;
}

const NOMBRE_DIA: Record<string, string> = {
  L: 'lunes',
  M: 'martes',
  X: 'miércoles',
  J: 'jueves',
  V: 'viernes',
  S: 'sábado',
  D: 'domingo',
};

/** Qué pasa al acabar, en la voz del atleta. `null` = no se sabe, y se dice fuera. */
export const TEXTO_AL_ACABAR: Record<AlAcabar, string> = {
  repite: 'Al acabar, el ciclo vuelve a empezar con más carga.',
  'sube-nivel': 'Al acabar, subes de nivel.',
  termina: 'Al acabar, el plan estructurado se cierra.',
};

/** Plural en un solo sitio: «1 sesión» / «3 sesiones». */
export function plural(n: number, singular: string, formaPlural: string): string {
  return `${n} ${n === 1 ? singular : formaPlural}`;
}
