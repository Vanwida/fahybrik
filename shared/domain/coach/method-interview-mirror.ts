// Espejo determinista de «Cómo entrenas».
// Misma respuesta → mismo párrafo. Vacío → cadena vacía (la IA no imita).
// Fuente de tono: docs/metodologia-coach.html («Después · el sistema, en voz alta»).

import {
  INTERVIEW_MIRROR_MAX,
  questionById,
  type MultiField,
  type NoteField,
  type SingleField,
} from './method-interview-catalog';

type Answers = Record<SingleField, string | null> &
  Record<MultiField, readonly string[] | null> &
  Record<NoteField, string | null>;

const TYPICAL_DAY: Record<string, string> = {
  run_endure: 'un día que pide correr mucho y aguantar',
  run_stations: 'un día que mezcla carrera y estaciones',
  heavy_lifts: 'un día de mover cargas altas, bien',
  multi_sport: 'un día que encadena varios deportes',
  depends: 'días que dependen tanto del atleta que no hay un típico',
};

const MAJORITY: Record<string, string> = {
  dated_race: 'Preparas gente para una prueba con fecha.',
  several_races: 'Preparas gente para varias pruebas en la temporada, no un solo pico.',
  get_stronger: 'Preparas gente para estar más fuerte, sin fecha.',
  mix: 'Preparas gente con y sin fecha, según el caso.',
};

const START: Record<string, string> = {
  from_race_back: 'Partes del día de la prueba, hacia atrás',
  from_gaps_forward: 'Partes de lo que le falta',
  template_block: 'Partes de una plantilla de bloque que ya usas',
  first_week: 'Empiezas por la primera semana y luego ya verás',
};

const BLOCK: Record<string, string> = {
  weeks_2_3: 'en bloques de 2–3 semanas',
  weeks_4_6: 'en bloques de 4–6 semanas',
  weeks_8_plus: 'en bloques de 8 semanas o más',
  weeks_not_blocks: 'sin bloques: trabajas por semanas',
};

const WITHIN: Record<string, string> = {
  same_dearer: 'que se vuelven un poco más caros',
  same_family_character: 'que cambian de carácter dentro de la misma familia',
  general_to_specific: 'que se vuelven más específicos',
  no_two_mondays: 'sin dos lunes iguales a propósito',
};

const DAYS: Record<string, string> = {
  d3: 'Semana de 3 días',
  d4: 'Semana de 4 días',
  d5: 'Semana de 5 días',
  d6: 'Semana de 6 días',
  no_habitual: 'La semana no tiene un número habitual de días',
};

const TWO_HARD: Record<string, string> = {
  never: 'el caro no se toca con otro caro',
  if_different_plus_night:
    'dos caros pueden tocarse si son cualidades distintas y hay una noche larga',
  like_race_day: 'dos caros pueden tocarse: así se parece al día de la prueba',
  case_by_case: 'si dos caros se tocan se mira el caso',
};

const STRENGTH: Record<string, string> = {
  pillar: 'Fuerza es pilar.',
  support: 'Fuerza es soporte: que no estorbe.',
  specific: 'Fuerza es específica: solo lo que luego se usa.',
  almost_none: 'Casi no programas fuerza.',
};

const EASY: Record<string, string> = {
  real_volume: 'El fácil es el motor.',
  active_recovery: 'El fácil es recuperación activa.',
  technique_slot: 'El fácil es sitio para técnica.',
  almost_none: 'Casi no hay días fáciles.',
};

const PRESCRIBE: Record<string, string> = {
  zones_from_test: 'Escribes con ritmos de test',
  pct_of_mark: 'Escribes con porcentaje de una marca',
  watch_power_pace: 'Escribes con potencia o ritmo de reloj',
  rpe: 'Escribes en RPE',
  mix: 'Mezclas test para lo clave y sensación para lo demás',
};

const NO_NUMBER: Record<string, string> = {
  publish_without: 'si no hay test, publicas sin ritmos',
  use_old: 'si no hay test reciente, usas el último aunque esté viejo',
  this_week_is_test: 'si no hay test, esa semana es el test',
  write_from_observation: 'si no hay test, escribes por cómo le has visto',
};

const GOING_WELL: Record<string, string> = {
  same_dearer: 'Si va bien, subes una variable.',
  more_race_like: 'Si va bien, la semana se parece más a la prueba.',
  follow_arc: 'Si va bien, sigues el arco que ya tenías escrito.',
  look_no_recipe: 'Si va bien, lo miras. No hay receta.',
};

const RAISE: Record<string, string> = {
  minutes_or_sets: 'Si va bien, subes minutos o series.',
  intensity: 'Si va bien, subes intensidad (ritmo, %, RPE).',
  less_rest: 'Si va bien, bajas el descanso.',
  more_specific: 'Si va bien, lo haces más parecido al gesto o al reglamento.',
};

const FLAT: Record<string, string> = {
  dont_raise_talk: 'Si está plano, hablas.',
  change_stimulus: 'Si está plano, cambias el estímulo, no la cantidad.',
  more_recovery: 'Si está plano, metes más recuperación.',
  ask_test: 'Si está plano, pides un test.',
  raise_anyway: 'Si está plano, subes igual.',
};

const VOICE: Record<string, string> = {
  numbers: 'En el móvil: números.',
  numbers_plus_why: 'En el móvil: números y el porqué.',
  explain_block: 'En el móvil: le explicas el bloque, no solo la serie.',
};

const ATHLETE: Record<string, string> = {
  beginner: 'Sueles trabajar con quien empieza o vuelve.',
  trains_no_plan: 'Sueles trabajar con quien ya entrena, sin un plan claro.',
  experienced: 'Sueles trabajar con gente con años que quiere bajar un tiempo.',
  no_profile: 'No hay un perfil: cada uno es un caso.',
};

const VENUE: Record<string, string> = {
  box: 'Entrenan en box o sala.',
  track: 'Entrenan en pista o asfalto.',
  home: 'Entrenan en casa, con poco material.',
  whatever: 'Entrenan con lo que haya esa semana.',
};

const CROWDED: Record<string, string> = {
  race_time: 'Si hay fecha y sobra, gana lo que más tiempo pide el día de la prueba.',
  worst_now: 'Si hay fecha y sobra, gana lo que peor tiene ahora.',
  what_i_develop: 'Si hay fecha y sobra, gana lo que tú sabes desarrollar mejor.',
  most_specific: 'Si hay fecha y sobra, gana lo más específico.',
};

const EASY_WEEK: Record<string, string> = {
  every_3_4: 'Hay una semana floja cada 3ª o 4ª.',
  when_body_asks: 'La semana floja entra cuando el cuerpo la pide.',
  just_before_race: 'La semana floja es casi solo justo antes de la prueba.',
  no_easy_weeks: 'No programas semanas flojas: bajas una sesión si hace falta.',
};

const SAVE_THREE: Record<string, string> = {
  easy_intense_strength: 'Si la semana se queda en tres: fácil, intenso y fuerza.',
  specific_strength_easy: 'Si la semana se queda en tres: específico, fuerza y un fácil.',
  strength_strength_cond: 'Si la semana se queda en tres: fuerza, fuerza y un condicional.',
  long_intervals_easy: 'Si la semana se queda en tres: largo, series y un fácil.',
};

const HARD_PLACE: Record<string, string> = {
  start: 'El caro va al principio, fresco.',
  mid: 'El caro va a mitad de semana.',
  weekend: 'El caro va cerca del fin de semana.',
  life_calendar: 'El caro va donde su vida lo aguante.',
};

const SAME_DAY: Record<string, string> = {
  strength_first: 'El mismo día, fuerza primero.',
  technical_first: 'El mismo día, lo técnico o rápido primero.',
  aerobic_first: 'El mismo día, lo aeróbico primero.',
  never_together: 'No juntas fuerza y específico el mismo día.',
  depends_week: 'Juntar dos cualidades depende de qué esté construyendo esa semana.',
};

const THINGS: Record<string, string> = {
  one: 'Un día publicado es una sola cosa, bien hecha.',
  two_blocks: 'Un día publicado suele ser dos bloques.',
  three: 'Un día publicado suele llevar tres cosas.',
  long_circuit: 'Un día publicado es un circuito largo que ya mezcla todo.',
};

const MENU: Record<string, string> = {
  types_combine: 'Escribes combinando tipos claros.',
  model_sessions: 'Mutas sesiones modelo.',
  write_new: 'Cada sesión se escribe nueva para esa semana.',
  fixed_catalog: 'Partes de un catálogo fijo. Casi no inventas.',
};

const MUST_WRITE: Record<string, string> = {
  measure_target_rest: 'Una sesión buena lleva medida, objetivo y descanso.',
  stimulus_ceiling: 'Una sesión buena lleva el estímulo y el techo.',
  task_and_time: 'Una sesión buena es una tarea y un rato.',
  depends_easy_vs_hard: 'El día fácil puede ir suelto; el caro, no.',
};

const RACE_LIKE: Record<string, string> = {
  early: 'El trabajo que parece la prueba entra pronto.',
  after_base: 'El trabajo que parece la prueba entra cuando ya hay base.',
  near_date: 'El trabajo que parece la prueba entra casi solo cerca de la fecha.',
  never_whole_session: 'Casi nunca programas la prueba como sesión entera.',
  no_race_day: 'No tienes un día de la prueba.',
};

const NEVER: Record<string, string> = {
  not_in_race: 'No entra lo que no está en la prueba.',
  nothing_forbidden: 'Nada está prohibido si construye lo que necesitas.',
  cant_measure: 'No entra lo que no puedes medir después.',
  athlete_cant_do_well: 'No entra lo que el atleta no va a hacer bien con lo que tiene.',
};

const NUMBER_SOURCE: Record<string, string> = {
  tests: 'Los números salen de tests con protocolo.',
  watch: 'Los números salen del reloj y de las últimas sesiones.',
  feel: 'Los números salen de lo que él nota, y tú lo traduces.',
  all_three: 'Los números salen de test, reloj y sensación: decides cuál manda.',
};

const TESTS: Record<string, string> = {
  time_distance: 'tiempo en distancia',
  strength_mark: 'marca de fuerza',
  threshold: 'umbral / FTP / CSS',
  simulation: 'simulación o trozo de la prueba',
};

const MEASURE: Record<string, string> = {
  dont_ask: 'Si un número no te cambia una serie, no lo pides.',
  ask_to_talk: 'Si un número no te cambia una serie, lo pides igual, para hablar.',
  ask_athlete_likes: 'Si un número no te cambia una serie, lo pides porque a él le gusta verse.',
};

const BAD_SLEEP: Record<string, string> = {
  shorter_same: 'Cara y mal dormido: se hace más corta, mismo carácter.',
  empty_easy: 'Cara y mal dormido: se vacía, fácil o técnico.',
  cancel: 'Cara y mal dormido: se cancela.',
  move: 'Cara y mal dormido: se mueve, y mañana pierde lo suyo.',
  depends_date: 'Cara y mal dormido: depende de si hay fecha cerca.',
};

const SKIPPED: Record<string, string> = {
  lost: 'Un día saltado se pierde. No se recupera.',
  move_next: 'Un día saltado se mueve al siguiente hueco.',
  weekend: 'Un día saltado deja algo el fin de semana.',
  depends_session: 'Un día saltado se mira según qué sesión era.',
};

const IS_OK: Record<string, string> = {
  yes_no_short: 'Si pregunta si va bien: sí o no, corto.',
  question_back: 'Si pregunta si va bien: una pregunta para que lo vea él.',
  cheer_and_tune: 'Si pregunta si va bien: animo y afino.',
};

const BOX: Record<string, string> = {
  less_volume: 'Si se para en el box: menos volumen, mismo ejercicio.',
  less_load: 'Si se para en el box: menos carga, mismo esquema.',
  change_exercise: 'Si se para en el box: cambio a algo que pueda hacer bien.',
  continue: 'Si se para en el box: sigue. Si se para otra vez, corto.',
};

function pick(map: Record<string, string>, id: string | null): string | null {
  if (id == null) return null;
  return map[id] ?? null;
}

function note(answers: Answers, field: NoteField): string | null {
  return answers[field];
}

function single(answers: Answers, field: SingleField): string | null {
  return answers[field];
}

function joinClause(parts: Array<string | null | undefined>, sep: string): string | null {
  const present = parts.filter((p): p is string => Boolean(p && p.length > 0));
  if (present.length === 0) return null;
  return present.join(sep);
}

function craftOpen(answers: Answers): string | null {
  const other = note(answers, 'typical_day_other');
  const day = single(answers, 'typical_day');
  if (other) return `Preparas gente para ${other.replace(/\.$/, '')}.`;
  const dayClause = pick(TYPICAL_DAY, day);
  if (dayClause) return `Preparas gente para ${dayClause}.`;
  return pick(MAJORITY, single(answers, 'majority_work'));
}

function timeSentence(answers: Answers): string | null {
  const start = pick(START, single(answers, 'start_from'));
  const block = pick(BLOCK, single(answers, 'block_length'));
  const within = pick(WITHIN, single(answers, 'within_block'));
  if (!start && !block && !within) return null;
  if (start && block && within) return `${start}, ${block} ${within}.`;
  if (start && block) return `${start}, ${block}.`;
  if (start && within) return `${start}, ${within}.`;
  if (block && within) return `Trabajas ${block} ${within}.`;
  if (start) return `${start}.`;
  if (block) return `Trabajas ${block}.`;
  return `${within}.`;
}

function weekCore(answers: Answers): string | null {
  const days = pick(DAYS, single(answers, 'training_days'));
  const two = pick(TWO_HARD, single(answers, 'two_hard'));
  if (days && two) return `${days}: ${two}.`;
  if (days) return `${days}.`;
  if (two) return `En la semana, ${two}.`;
  return null;
}

function numbersSentence(answers: Answers): string | null {
  const prescribe = pick(PRESCRIBE, single(answers, 'prescribe_hard'));
  const missing = pick(NO_NUMBER, single(answers, 'no_recent_number'));
  if (prescribe && missing) return `${prescribe}; ${missing}.`;
  if (prescribe) return `${prescribe}.`;
  if (missing) return `Sin número reciente, ${missing}.`;
  return null;
}

function goingWellSentence(answers: Answers): string | null {
  const well = single(answers, 'if_going_well');
  const raise = single(answers, 'raise_variable');
  if (well === 'same_dearer' && raise) return pick(RAISE, raise);
  return pick(GOING_WELL, well);
}

function testsSentence(answers: Answers): string | null {
  const used = answers.tests_used;
  if (!used || used.length === 0) return null;
  if (used.includes('almost_no_tests')) return 'Casi no testeas: miras entrenos.';
  const labels = used
    .map((id) => TESTS[id])
    .filter((label): label is string => Boolean(label));
  if (labels.length === 0) return null;
  if (labels.length === 1) return `Testeas ${labels[0]}.`;
  return `Testeas ${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}.`;
}

function neverSentence(answers: Answers): string | null {
  const named = note(answers, 'never_programs_named');
  const base = pick(NEVER, single(answers, 'never_programs'));
  if (named && base) return `${base} Nunca programas ${named}.`;
  if (named) return `Nunca programas ${named}.`;
  return base;
}

function saveThreeSentence(answers: Answers): string | null {
  const other = note(answers, 'save_three_other');
  if (other) return `Si la semana se queda en tres: ${other.replace(/\.$/, '')}.`;
  return pick(SAVE_THREE, single(answers, 'save_three'));
}

function boxSentence(answers: Answers): string | null {
  const phrase = note(answers, 'box_stops_phrase');
  const base = pick(BOX, single(answers, 'box_stops'));
  if (phrase && base) return `${base} Lo dices así: «${phrase}».`;
  if (phrase) return `Si se para en el box, lo dices así: «${phrase}».`;
  return base;
}

function push(out: string[], sentence: string | null): void {
  if (sentence) out.push(sentence);
}

/**
 * Párrafo del sistema. Orden fijo por capítulo. Una cláusula por respuesta
 * contestada; las que faltan no se inventan. El ejemplo de la spec es un
 * subconjunto: esas trece casillas producen exactamente ese texto.
 */
export function generateMirror(answers: Answers): string {
  const out: string[] = [];

  push(out, craftOpen(answers));
  // Si ya abrimos con el día de la verdad, majority_work solo aporta si no
  // hubo typical_day (craftOpen ya eligió). El perfil y el sitio van detrás.
  if (single(answers, 'typical_day') != null || note(answers, 'typical_day_other')) {
    push(out, pick(MAJORITY, single(answers, 'majority_work')));
  }
  push(out, pick(ATHLETE, single(answers, 'typical_athlete')));
  push(out, pick(VENUE, single(answers, 'venue')));

  push(out, timeSentence(answers));
  push(out, pick(CROWDED, single(answers, 'if_date_crowded')));
  push(out, pick(EASY_WEEK, single(answers, 'easy_week')));

  push(out, weekCore(answers));
  push(out, saveThreeSentence(answers));
  push(out, pick(HARD_PLACE, single(answers, 'hard_day_place')));
  push(out, pick(SAME_DAY, single(answers, 'same_day_two')));
  push(out, pick(THINGS, single(answers, 'things_per_day')));

  push(out, pick(MENU, single(answers, 'session_menu')));
  push(out, pick(MUST_WRITE, single(answers, 'must_write')));
  push(out, neverSentence(answers));
  push(out, pick(RACE_LIKE, single(answers, 'race_like_when')));
  push(out, pick(STRENGTH, single(answers, 'strength_role')));
  push(out, pick(EASY, single(answers, 'easy_role')));

  push(out, pick(NUMBER_SOURCE, single(answers, 'number_source')));
  push(out, testsSentence(answers));
  push(out, numbersSentence(answers));
  push(out, pick(MEASURE, single(answers, 'measure_for_measure')));

  push(out, goingWellSentence(answers));
  // raise_variable solo habla solo si if_going_well no es «misma más cara»
  // (ahí ya se fundió en goingWellSentence).
  if (single(answers, 'if_going_well') !== 'same_dearer') {
    const raise = pick(RAISE, single(answers, 'raise_variable'));
    if (raise) out.push(raise.replace('Si va bien, ', 'La variable que sueles subir: ').replace(/\.$/, '.'));
  }
  push(out, pick(FLAT, single(answers, 'if_flat')));
  push(out, pick(BAD_SLEEP, single(answers, 'bad_sleep_hard')));
  push(out, pick(SKIPPED, single(answers, 'skipped_day')));

  push(out, pick(VOICE, single(answers, 'published_voice')));
  push(out, pick(IS_OK, single(answers, 'is_this_ok')));
  push(out, boxSentence(answers));

  const text = out.join(' ').trim();
  return text.slice(0, INTERVIEW_MIRROR_MAX);
}

/** El texto que leen plan / chat / MCP: el editado, o el generado si no hay edición. */
export function effectiveMirror(input: {
  generated_mirror?: string | null;
  mirror_text?: string | null;
}): string {
  const edited = input.mirror_text?.trim() ?? '';
  if (edited.length > 0) return edited.slice(0, INTERVIEW_MIRROR_MAX);
  const generated = input.generated_mirror?.trim() ?? '';
  return generated.slice(0, INTERVIEW_MIRROR_MAX);
}

/** Las trece casillas del párrafo de la spec. */
export function specExampleAnswers(): Partial<
  Record<SingleField, string | null> &
    Record<MultiField, readonly string[] | null> &
    Record<NoteField, string | null>
> {
  return {
    typical_day: 'run_stations',
    start_from: 'from_gaps_forward',
    block_length: 'weeks_4_6',
    within_block: 'general_to_specific',
    training_days: 'd5',
    two_hard: 'never',
    strength_role: 'pillar',
    easy_role: 'real_volume',
    prescribe_hard: 'zones_from_test',
    no_recent_number: 'publish_without',
    if_going_well: 'same_dearer',
    if_flat: 'dont_raise_talk',
    published_voice: 'numbers_plus_why',
  };
}

export const SPEC_EXAMPLE_MIRROR =
  'Preparas gente para un día que mezcla carrera y estaciones. Partes de lo que le falta, en bloques de 4–6 semanas que se vuelven más específicos. Semana de 5 días: el caro no se toca con otro caro. Fuerza es pilar. El fácil es el motor. Escribes con ritmos de test; si no hay test, publicas sin ritmos. Si va bien, subes una variable. Si está plano, hablas. En el móvil: números y el porqué.';

/** Cada opción del catálogo tiene cláusula. Si falta una, el espejo miente. */
export function mirrorCoversCatalog(): string[] {
  const missing: string[] = [];
  const maps: Array<[string, Record<string, string>]> = [
    ['typical_day', TYPICAL_DAY],
    ['majority_work', MAJORITY],
    ['start_from', START],
    ['block_length', BLOCK],
    ['within_block', WITHIN],
    ['training_days', DAYS],
    ['two_hard', TWO_HARD],
    ['strength_role', STRENGTH],
    ['easy_role', EASY],
    ['prescribe_hard', PRESCRIBE],
    ['no_recent_number', NO_NUMBER],
    ['if_going_well', GOING_WELL],
    ['raise_variable', RAISE],
    ['if_flat', FLAT],
    ['published_voice', VOICE],
  ];
  for (const [id, map] of maps) {
    const q = questionById(id);
    if (!q) {
      missing.push(id);
      continue;
    }
    for (const opt of q.options) {
      if (id === 'tests_used') continue;
      if (!(opt.id in map) && id !== 'tests_used') {
        if (map[opt.id] == null) missing.push(`${id}.${opt.id}`);
      }
    }
  }
  return missing;
}

export { joinClause };
