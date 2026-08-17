// Entrevista «Cómo entrenas». Fuente: docs/metodologia-coach.html.
// Mecanismo (código): las preguntas y las casillas. Método (dato): las respuestas.
// Cero nombres de escuela. Si otro coach lo haría distinto, no es const.

export const INTERVIEW_NOTE_MAX = 280;
export const INTERVIEW_MIRROR_MAX = 4_000;

export const CHAPTER_IDS = [
  'craft',
  'time',
  'week',
  'session',
  'numbers',
  'progress',
  'voice',
] as const;

export type ChapterId = (typeof CHAPTER_IDS)[number];

export type QuestionKind = 'single' | 'multi';
export type QuestionLayout = 'stack' | 'row';

export interface InterviewOption {
  id: string;
  label: string;
}

export interface InterviewQuestionDef {
  id: string;
  chapter_id: ChapterId;
  kind: QuestionKind;
  title: string;
  prompt: string | null;
  options: readonly InterviewOption[];
  layout: QuestionLayout;
  note_id?: string;
  note_hint?: string;
}

export interface InterviewChapterDef {
  id: ChapterId;
  number: number;
  title: string;
  scene: string;
}

export const INTERVIEW_CHAPTERS: readonly InterviewChapterDef[] = [
  {
    id: 'craft',
    number: 1,
    title: 'A qué te dedicas',
    scene:
      'Si no sabemos para qué entrenas gente, el resto de preguntas mienten. No es tu nicho de marketing. Es lo que hay en el calendario de tus atletas.',
  },
  {
    id: 'time',
    number: 2,
    title: 'Cómo partes el tiempo',
    scene:
      'Estás a 16 semanas de algo que importa, o no hay fecha. Tienes que decidir si construyes hacia atrás desde el día, o si vives de semana en semana.',
  },
  {
    id: 'week',
    number: 3,
    title: 'La semana',
    scene: 'Domingo noche. Vas a publicar. Esto es lo que un atleta tuyo ve siete días.',
  },
  {
    id: 'session',
    number: 4,
    title: 'Qué se ve en una sesión',
    scene:
      'Abres el editor. El atleta va a leer esto en el móvil. Aquí se ve si programas como tú o como cualquiera.',
  },
  {
    id: 'numbers',
    number: 5,
    title: 'De dónde salen los números',
    scene: 'Lunes. Hay que publicar ritmos y cargas. O no.',
  },
  {
    id: 'progress',
    number: 6,
    title: 'Cómo avanza',
    scene: 'Tres semanas buenas. O tres planas. Alguien tiene que decidir qué hace la cuarta.',
  },
  {
    id: 'voice',
    number: 7,
    title: 'Cómo se lo dices',
    scene: 'El plan en el móvil y el chat. La IA va a escribir con tu tono.',
  },
] as const;

export const MAJORITY_WORK = ['dated_race', 'several_races', 'get_stronger', 'mix'] as const;
export const TYPICAL_DAY = [
  'run_endure',
  'run_stations',
  'heavy_lifts',
  'multi_sport',
  'depends',
] as const;
export const TYPICAL_ATHLETE = ['beginner', 'trains_no_plan', 'experienced', 'no_profile'] as const;
export const VENUE = ['box', 'track', 'home', 'whatever'] as const;
export const START_FROM = [
  'from_race_back',
  'from_gaps_forward',
  'template_block',
  'first_week',
] as const;
export const BLOCK_LENGTH = ['weeks_2_3', 'weeks_4_6', 'weeks_8_plus', 'weeks_not_blocks'] as const;
export const WITHIN_BLOCK = [
  'same_dearer',
  'same_family_character',
  'general_to_specific',
  'no_two_mondays',
] as const;
export const IF_DATE_CROWDED = [
  'race_time',
  'worst_now',
  'what_i_develop',
  'most_specific',
] as const;
export const EASY_WEEK = [
  'every_3_4',
  'when_body_asks',
  'just_before_race',
  'no_easy_weeks',
] as const;
export const TRAINING_DAYS = ['d3', 'd4', 'd5', 'd6', 'no_habitual'] as const;
export const SAVE_THREE = [
  'easy_intense_strength',
  'specific_strength_easy',
  'strength_strength_cond',
  'long_intervals_easy',
] as const;
export const HARD_DAY_PLACE = ['start', 'mid', 'weekend', 'life_calendar'] as const;
export const TWO_HARD = ['never', 'if_different_plus_night', 'like_race_day', 'case_by_case'] as const;
export const SAME_DAY_TWO = [
  'strength_first',
  'technical_first',
  'aerobic_first',
  'never_together',
  'depends_week',
] as const;
export const THINGS_PER_DAY = ['one', 'two_blocks', 'three', 'long_circuit'] as const;
export const SESSION_MENU = [
  'types_combine',
  'model_sessions',
  'write_new',
  'fixed_catalog',
] as const;
export const MUST_WRITE = [
  'measure_target_rest',
  'stimulus_ceiling',
  'task_and_time',
  'depends_easy_vs_hard',
] as const;
export const PRESCRIBE_HARD = [
  'zones_from_test',
  'pct_of_mark',
  'watch_power_pace',
  'rpe',
  'mix',
] as const;
export const RACE_LIKE_WHEN = [
  'early',
  'after_base',
  'near_date',
  'never_whole_session',
  'no_race_day',
] as const;
export const NEVER_PROGRAMS = [
  'not_in_race',
  'nothing_forbidden',
  'cant_measure',
  'athlete_cant_do_well',
] as const;
export const STRENGTH_ROLE = ['pillar', 'support', 'specific', 'almost_none'] as const;
export const EASY_ROLE = ['real_volume', 'active_recovery', 'technique_slot', 'almost_none'] as const;
export const NUMBER_SOURCE = ['tests', 'watch', 'feel', 'all_three'] as const;
export const TESTS_USED = [
  'time_distance',
  'strength_mark',
  'threshold',
  'simulation',
  'almost_no_tests',
] as const;
export const NO_RECENT_NUMBER = [
  'publish_without',
  'use_old',
  'this_week_is_test',
  'write_from_observation',
] as const;
export const MEASURE_FOR_MEASURE = ['dont_ask', 'ask_to_talk', 'ask_athlete_likes'] as const;
export const IF_GOING_WELL = [
  'same_dearer',
  'more_race_like',
  'follow_arc',
  'look_no_recipe',
] as const;
export const RAISE_VARIABLE = [
  'minutes_or_sets',
  'intensity',
  'less_rest',
  'more_specific',
] as const;
export const IF_FLAT = [
  'dont_raise_talk',
  'change_stimulus',
  'more_recovery',
  'ask_test',
  'raise_anyway',
] as const;
export const BAD_SLEEP_HARD = [
  'shorter_same',
  'empty_easy',
  'cancel',
  'move',
  'depends_date',
] as const;
export const SKIPPED_DAY = ['lost', 'move_next', 'weekend', 'depends_session'] as const;
export const PUBLISHED_VOICE = ['numbers', 'numbers_plus_why', 'explain_block'] as const;
export const IS_THIS_OK = ['yes_no_short', 'question_back', 'cheer_and_tune'] as const;
export const BOX_STOPS = ['less_volume', 'less_load', 'change_exercise', 'continue'] as const;

export const SINGLE_FIELDS = [
  'majority_work',
  'typical_day',
  'typical_athlete',
  'venue',
  'start_from',
  'block_length',
  'within_block',
  'if_date_crowded',
  'easy_week',
  'training_days',
  'save_three',
  'hard_day_place',
  'two_hard',
  'same_day_two',
  'things_per_day',
  'session_menu',
  'must_write',
  'prescribe_hard',
  'race_like_when',
  'never_programs',
  'strength_role',
  'easy_role',
  'number_source',
  'no_recent_number',
  'measure_for_measure',
  'if_going_well',
  'raise_variable',
  'if_flat',
  'bad_sleep_hard',
  'skipped_day',
  'published_voice',
  'is_this_ok',
  'box_stops',
] as const;

export const MULTI_FIELDS = ['tests_used'] as const;

export const NOTE_FIELDS = [
  'typical_day_other',
  'save_three_other',
  'never_programs_named',
  'box_stops_phrase',
] as const;

export type SingleField = (typeof SINGLE_FIELDS)[number];
export type MultiField = (typeof MULTI_FIELDS)[number];
export type NoteField = (typeof NOTE_FIELDS)[number];

export const OPTION_IDS: Record<SingleField | MultiField, readonly string[]> = {
  majority_work: MAJORITY_WORK,
  typical_day: TYPICAL_DAY,
  typical_athlete: TYPICAL_ATHLETE,
  venue: VENUE,
  start_from: START_FROM,
  block_length: BLOCK_LENGTH,
  within_block: WITHIN_BLOCK,
  if_date_crowded: IF_DATE_CROWDED,
  easy_week: EASY_WEEK,
  training_days: TRAINING_DAYS,
  save_three: SAVE_THREE,
  hard_day_place: HARD_DAY_PLACE,
  two_hard: TWO_HARD,
  same_day_two: SAME_DAY_TWO,
  things_per_day: THINGS_PER_DAY,
  session_menu: SESSION_MENU,
  must_write: MUST_WRITE,
  prescribe_hard: PRESCRIBE_HARD,
  race_like_when: RACE_LIKE_WHEN,
  never_programs: NEVER_PROGRAMS,
  strength_role: STRENGTH_ROLE,
  easy_role: EASY_ROLE,
  number_source: NUMBER_SOURCE,
  tests_used: TESTS_USED,
  no_recent_number: NO_RECENT_NUMBER,
  measure_for_measure: MEASURE_FOR_MEASURE,
  if_going_well: IF_GOING_WELL,
  raise_variable: RAISE_VARIABLE,
  if_flat: IF_FLAT,
  bad_sleep_hard: BAD_SLEEP_HARD,
  skipped_day: SKIPPED_DAY,
  published_voice: PUBLISHED_VOICE,
  is_this_ok: IS_THIS_OK,
  box_stops: BOX_STOPS,
};

export const INTERVIEW_QUESTIONS: readonly InterviewQuestionDef[] = [
  {
    id: 'majority_work',
    chapter_id: 'craft',
    kind: 'single',
    title: 'El trabajo de la mayoría',
    prompt: 'Si miras los próximos tres meses de tu gente, ¿qué hay más?',
    layout: 'stack',
    options: [
      { id: 'dated_race', label: 'Una carrera o prueba con fecha y reglamento' },
      { id: 'several_races', label: 'Varias pruebas en la temporada, no un solo pico' },
      { id: 'get_stronger', label: 'Estar más fuerte / más capaz, sin fecha' },
      { id: 'mix', label: 'Mezcla: unos con fecha, otros no' },
    ],
  },
  {
    id: 'typical_day',
    chapter_id: 'craft',
    kind: 'single',
    title: 'Qué se ve el día de la verdad',
    prompt: 'El día que “cuenta”, tu atleta típico tiene que…',
    layout: 'stack',
    note_id: 'typical_day_other',
    note_hint: 'Si ninguna te cubre: una línea. Qué es ese día.',
    options: [
      { id: 'run_endure', label: 'Correr mucho, y aguantar' },
      { id: 'run_stations', label: 'Alternar carrera con estaciones o trabajo de gimnasio, sin parar' },
      { id: 'heavy_lifts', label: 'Mover cargas altas, bien' },
      { id: 'multi_sport', label: 'Encadenar varios deportes el mismo día' },
      { id: 'depends', label: 'Depende tanto del atleta que no hay un “típico”' },
    ],
  },
  {
    id: 'typical_athlete',
    chapter_id: 'craft',
    kind: 'single',
    title: 'Con quién sueles trabajar',
    prompt: 'El cuerpo y la cabeza con los que programas de verdad.',
    layout: 'stack',
    options: [
      { id: 'beginner', label: 'Gente que empieza o vuelve' },
      { id: 'trains_no_plan', label: 'Gente que ya entrena, sin un plan claro' },
      { id: 'experienced', label: 'Gente con años encima que quiere bajar un tiempo o subir una marca' },
      { id: 'no_profile', label: 'No hay un perfil. Cada uno es un caso' },
    ],
  },
  {
    id: 'venue',
    chapter_id: 'craft',
    kind: 'single',
    title: 'Dónde entrenan',
    prompt: 'Esto decide qué sesiones puedes escribir.',
    layout: 'row',
    options: [
      { id: 'box', label: 'Box / sala' },
      { id: 'track', label: 'Pista o asfalto' },
      { id: 'home', label: 'Casa, poco material' },
      { id: 'whatever', label: 'Lo que haya esa semana' },
    ],
  },
  {
    id: 'start_from',
    chapter_id: 'time',
    kind: 'single',
    title: 'Por dónde empiezas a pensar',
    prompt: 'Cuando te sientas a planear a alguien nuevo.',
    layout: 'stack',
    options: [
      { id: 'from_race_back', label: 'Desde el día de la prueba, hacia atrás' },
      { id: 'from_gaps_forward', label: 'Desde lo que le falta ahora, hacia delante' },
      { id: 'template_block', label: 'Una plantilla de bloque que ya uso, y la recorto' },
      { id: 'first_week', label: 'La primera semana, y luego ya veremos' },
    ],
  },
  {
    id: 'block_length',
    chapter_id: 'time',
    kind: 'single',
    title: 'El trozo con el que trabajas',
    prompt: 'Cuando dices “este bloque”, ¿cuánto dura en tu cabeza?',
    layout: 'row',
    options: [
      { id: 'weeks_2_3', label: '2–3 semanas' },
      { id: 'weeks_4_6', label: '4–6' },
      { id: 'weeks_8_plus', label: '8 o más' },
      { id: 'weeks_not_blocks', label: 'No trabajo por bloques. Trabajo por semanas' },
    ],
  },
  {
    id: 'within_block',
    chapter_id: 'time',
    kind: 'single',
    title: 'Dentro de un bloque, el trabajo',
    prompt: '¿Cómo se parece el lunes de la semana 1 al lunes de la semana 3?',
    layout: 'stack',
    options: [
      { id: 'same_dearer', label: 'Casi la misma sesión, un poco más cara' },
      { id: 'same_family_character', label: 'Misma familia, pero cambia el carácter (más largo, más intenso, más específico)' },
      { id: 'general_to_specific', label: 'Cambia de verdad: al principio general, al final parece el día de la prueba' },
      { id: 'no_two_mondays', label: 'No hay dos lunes iguales a propósito' },
    ],
  },
  {
    id: 'if_date_crowded',
    chapter_id: 'time',
    kind: 'single',
    title: 'Si hay fecha y sobran cualidades',
    prompt: 'No da tiempo a desarrollarlo todo. ¿Qué gana?',
    layout: 'stack',
    options: [
      { id: 'race_time', label: 'Lo que más tiempo pide en el día de la prueba' },
      { id: 'worst_now', label: 'Lo que peor tiene él ahora' },
      { id: 'what_i_develop', label: 'Lo que yo sé desarrollar mejor' },
      { id: 'most_specific', label: 'Lo más específico. Lo general se queda como mantenimiento' },
    ],
  },
  {
    id: 'easy_week',
    chapter_id: 'time',
    kind: 'single',
    title: 'La semana más floja',
    prompt: '¿Cada cuánto existe, a propósito?',
    layout: 'stack',
    options: [
      { id: 'every_3_4', label: 'Cada 3ª o 4ª' },
      { id: 'when_body_asks', label: 'Cuando el cuerpo lo pide, no en el calendario' },
      { id: 'just_before_race', label: 'Justo antes de la prueba, y casi nunca antes' },
      { id: 'no_easy_weeks', label: 'No programo semanas flojas. Bajo una sesión si hace falta' },
    ],
  },
  {
    id: 'training_days',
    chapter_id: 'week',
    kind: 'single',
    title: 'Días que entrena',
    prompt: 'Lo habitual, no el techo.',
    layout: 'row',
    options: [
      { id: 'd3', label: '3' },
      { id: 'd4', label: '4' },
      { id: 'd5', label: '5' },
      { id: 'd6', label: '6' },
      { id: 'no_habitual', label: 'Cambia tanto que no hay habitual' },
    ],
  },
  {
    id: 'save_three',
    chapter_id: 'week',
    kind: 'single',
    title: 'Lo que no falta casi nunca',
    prompt: 'Si la semana se queda en tres días, ¿qué tres familias intentas salvar?',
    layout: 'stack',
    note_id: 'save_three_other',
    note_hint: 'Si tu trío es otro: escríbelo con tus palabras. Tres piezas.',
    options: [
      { id: 'easy_intense_strength', label: 'Aeróbico fácil + algo intenso + fuerza' },
      { id: 'specific_strength_easy', label: 'Específico de la prueba + fuerza + un fácil' },
      { id: 'strength_strength_cond', label: 'Fuerza + fuerza + un condicional' },
      { id: 'long_intervals_easy', label: 'Largo + series + un fácil' },
    ],
  },
  {
    id: 'hard_day_place',
    chapter_id: 'week',
    kind: 'single',
    title: 'El día caro',
    prompt: 'El que más deja rastro, ¿dónde lo pones?',
    layout: 'stack',
    options: [
      { id: 'start', label: 'Al principio de la semana, fresco' },
      { id: 'mid', label: 'A mitad' },
      { id: 'weekend', label: 'Cerca del fin de semana' },
      { id: 'life_calendar', label: 'Donde su vida lo aguante. El método se adapta al calendario laboral' },
    ],
  },
  {
    id: 'two_hard',
    chapter_id: 'week',
    kind: 'single',
    title: 'Dos caros',
    prompt: '¿Pueden tocarse?',
    layout: 'stack',
    options: [
      { id: 'never', label: 'No. Aunque pida más volumen' },
      { id: 'if_different_plus_night', label: 'Sí, si son cualidades distintas y hay una noche larga en medio' },
      { id: 'like_race_day', label: 'Sí, es cómo se parece al día de la prueba' },
      { id: 'case_by_case', label: 'No es una regla. Se mira el caso' },
    ],
  },
  {
    id: 'same_day_two',
    chapter_id: 'week',
    kind: 'single',
    title: 'El mismo día, dos cualidades',
    prompt: 'Fuerza y carrera (o específico) el mismo día.',
    layout: 'stack',
    options: [
      { id: 'strength_first', label: 'Fuerza primero' },
      { id: 'technical_first', label: 'Lo más técnico / rápido primero' },
      { id: 'aerobic_first', label: 'Lo aeróbico primero' },
      { id: 'never_together', label: 'No los junto. Cada cualidad, su día' },
      { id: 'depends_week', label: 'Según qué esté construyendo esa semana' },
    ],
  },
  {
    id: 'things_per_day',
    chapter_id: 'week',
    kind: 'single',
    title: 'Cuántas cosas distintas en un día',
    prompt: 'Un martes tuyo publicado suele ser…',
    layout: 'stack',
    options: [
      { id: 'one', label: 'Una sola cosa, bien hecha' },
      { id: 'two_blocks', label: 'Dos bloques (por ejemplo fuerza + un fácil)' },
      { id: 'three', label: 'Tres, como entrena esta gente de verdad' },
      { id: 'long_circuit', label: 'Un circuito largo que ya mezcla todo' },
    ],
  },
  {
    id: 'session_menu',
    chapter_id: 'session',
    kind: 'single',
    title: 'El menú con el que escribes',
    prompt: 'Cuando montas semanas, ¿de dónde salen las sesiones?',
    layout: 'stack',
    options: [
      { id: 'types_combine', label: 'Tengo tipos claros (rodaje, series, fuerza, específico…) y los combino' },
      { id: 'model_sessions', label: 'Tengo sesiones modelo que voy mutando' },
      { id: 'write_new', label: 'Cada sesión se escribe nueva, a partir de lo que necesita esa semana' },
      { id: 'fixed_catalog', label: 'Parte de un catálogo fijo. Casi no invento' },
    ],
  },
  {
    id: 'must_write',
    chapter_id: 'session',
    kind: 'single',
    title: 'Qué tiene que llevar escrita',
    prompt: 'Para que tú la des por buena.',
    layout: 'stack',
    options: [
      { id: 'measure_target_rest', label: 'Medida, objetivo y descanso. Si falta uno, no se publica' },
      { id: 'stimulus_ceiling', label: 'El estímulo y el techo. El resto lo ajusta él' },
      { id: 'task_and_time', label: 'Una tarea y un rato. Odio el sobreescribir' },
      { id: 'depends_easy_vs_hard', label: 'Depende: el día fácil puede ir suelto; el caro, no' },
    ],
  },
  {
    id: 'prescribe_hard',
    chapter_id: 'session',
    kind: 'single',
    title: 'Cómo se prescribe lo caro',
    prompt: 'Series, ritmos, cargas. ¿En qué idioma?',
    layout: 'stack',
    options: [
      { id: 'zones_from_test', label: 'Zonas o ritmos salidos de un test' },
      { id: 'pct_of_mark', label: 'Porcentaje de una marca (1RM, mejor serie…)' },
      { id: 'watch_power_pace', label: 'Potencia / ritmo de reloj, actualizado' },
      { id: 'rpe', label: 'RPE o sensación, y ya está' },
      { id: 'mix', label: 'Mezclo: test para lo clave, sensación para lo demás' },
    ],
  },
  {
    id: 'race_like_when',
    chapter_id: 'session',
    kind: 'single',
    title: 'El trabajo que parece la prueba',
    prompt: 'Estaciones, tramos, simulacros, series al ritmo de carrera… ¿cuándo entra?',
    layout: 'stack',
    options: [
      { id: 'early', label: 'Pronto. Si no lo toca, no lo está preparando' },
      { id: 'after_base', label: 'Cuando ya hay base. Antes sería teatro' },
      { id: 'near_date', label: 'Casi solo cerca de la fecha' },
      { id: 'never_whole_session', label: 'Casi nunca como sesión entera. Va dentro de otros días' },
      { id: 'no_race_day', label: 'No tengo un “día de la prueba”. No aplica' },
    ],
  },
  {
    id: 'never_programs',
    chapter_id: 'session',
    kind: 'single',
    title: 'Lo que no entra en tus planes',
    prompt: 'No por moda: porque no te sirve para lo que entrenas.',
    layout: 'stack',
    note_id: 'never_programs_named',
    note_hint: 'Si hay una cosa concreta que nunca programas: nómbrala. Una.',
    options: [
      { id: 'not_in_race', label: 'Cosas que no están en la prueba / el objetivo' },
      { id: 'nothing_forbidden', label: 'Nada está prohibido si construye lo que necesito' },
      { id: 'cant_measure', label: 'Lo que no puedo medir después' },
      { id: 'athlete_cant_do_well', label: 'Lo que el atleta no va a hacer bien con lo que tiene' },
    ],
  },
  {
    id: 'strength_role',
    chapter_id: 'session',
    kind: 'single',
    title: 'Fuerza, si la hay',
    prompt: 'En tus semanas, la fuerza es…',
    layout: 'stack',
    options: [
      { id: 'pillar', label: 'Un pilar. Tiene sus días y no se regala' },
      { id: 'support', label: 'Soporte. Que no estorbe a lo demás' },
      { id: 'specific', label: 'Específica: solo lo que luego se usa' },
      { id: 'almost_none', label: 'Casi no programo fuerza' },
    ],
  },
  {
    id: 'easy_role',
    chapter_id: 'session',
    kind: 'single',
    title: 'El fácil',
    prompt: 'Los días suaves, para ti, son…',
    layout: 'stack',
    options: [
      { id: 'real_volume', label: 'El volumen de verdad. Ahí se hace el motor' },
      { id: 'active_recovery', label: 'Recuperación activa. Que no dejen rastro' },
      { id: 'technique_slot', label: 'Sitio para técnica o cosas que no caben en el caro' },
      { id: 'almost_none', label: 'Casi no existen. Prefiero menos días, todos con intención' },
    ],
  },
  {
    id: 'number_source',
    chapter_id: 'numbers',
    kind: 'single',
    title: 'La fuente',
    prompt: 'Los números de esta semana salen sobre todo de…',
    layout: 'stack',
    options: [
      { id: 'tests', label: 'Tests que yo pongo, con protocolo' },
      { id: 'watch', label: 'Lo que trae el reloj / las últimas sesiones' },
      { id: 'feel', label: 'Lo que él nota, y yo lo traduzco' },
      { id: 'all_three', label: 'Las tres, y decido cuál manda esa semana' },
    ],
  },
  {
    id: 'tests_used',
    chapter_id: 'numbers',
    kind: 'multi',
    title: 'Qué tests existen en tu mundo',
    prompt: 'Los que de verdad te cambian una prescripción. Marca los que usas.',
    layout: 'row',
    options: [
      { id: 'time_distance', label: 'Un tiempo en distancia (5K, 2K…)' },
      { id: 'strength_mark', label: 'Una marca de fuerza' },
      { id: 'threshold', label: 'Un umbral / FTP / CSS' },
      { id: 'simulation', label: 'Una simulación o un trozo de la prueba' },
      { id: 'almost_no_tests', label: 'Casi no testeo. Miro entrenos' },
    ],
  },
  {
    id: 'no_recent_number',
    chapter_id: 'numbers',
    kind: 'single',
    title: 'Sin número reciente',
    prompt: 'El test es viejo o no existe. El lunes sale igual.',
    layout: 'stack',
    options: [
      { id: 'publish_without', label: 'Publico la semana sin ritmos / sin %' },
      { id: 'use_old', label: 'Uso el último, aunque esté viejo' },
      { id: 'this_week_is_test', label: 'Esta semana es el test' },
      { id: 'write_from_observation', label: 'Escribo por cómo le he visto' },
    ],
  },
  {
    id: 'measure_for_measure',
    chapter_id: 'numbers',
    kind: 'single',
    title: 'Medir por medir',
    prompt: 'Si un número no te cambia una serie la semana que viene…',
    layout: 'stack',
    options: [
      { id: 'dont_ask', label: 'No lo pido' },
      { id: 'ask_to_talk', label: 'Lo pido igual, para hablar' },
      { id: 'ask_athlete_likes', label: 'Lo pido porque al atleta le gusta verse' },
    ],
  },
  {
    id: 'if_going_well',
    chapter_id: 'progress',
    kind: 'single',
    title: 'Si va bien',
    prompt: 'La siguiente semana, lo normal es…',
    layout: 'stack',
    options: [
      { id: 'same_dearer', label: 'La misma, un poco más cara. Una sola variable' },
      { id: 'more_race_like', label: 'Más parecida a la prueba' },
      { id: 'follow_arc', label: 'Lo que toque en el arco que ya tenía escrito' },
      { id: 'look_no_recipe', label: 'Lo miro. No hay receta' },
    ],
  },
  {
    id: 'raise_variable',
    chapter_id: 'progress',
    kind: 'single',
    title: 'La variable que sueles subir',
    prompt: 'Cuando subes una sola cosa.',
    layout: 'stack',
    options: [
      { id: 'minutes_or_sets', label: 'Minutos o series' },
      { id: 'intensity', label: 'Intensidad (ritmo, %, RPE)' },
      { id: 'less_rest', label: 'Menos descanso' },
      { id: 'more_specific', label: 'Más parecido al gesto o al reglamento' },
    ],
  },
  {
    id: 'if_flat',
    chapter_id: 'progress',
    kind: 'single',
    title: 'Si está plano',
    prompt: 'No lesionado. No ha viajado. Los números no se mueven. Pide apretar.',
    layout: 'stack',
    options: [
      { id: 'dont_raise_talk', label: 'No subo. Primero hablo' },
      { id: 'change_stimulus', label: 'Cambio el estímulo, no la cantidad' },
      { id: 'more_recovery', label: 'Meto más recuperación' },
      { id: 'ask_test', label: 'Pido un test' },
      { id: 'raise_anyway', label: 'Subo igual. A veces el plano es el trabajo haciendo efecto' },
    ],
  },
  {
    id: 'bad_sleep_hard',
    chapter_id: 'progress',
    kind: 'single',
    title: 'Una sesión cara, mal dormido',
    prompt: 'Mensaje a las 7. El sábado hay algo que importa, o no.',
    layout: 'stack',
    options: [
      { id: 'shorter_same', label: 'Se hace más corta, mismo carácter' },
      { id: 'empty_easy', label: 'Se vacía: fácil o técnico' },
      { id: 'cancel', label: 'Se cancela' },
      { id: 'move', label: 'Se mueve, y mañana pierde lo suyo' },
      { id: 'depends_date', label: 'Depende de si hay fecha cerca' },
    ],
  },
  {
    id: 'skipped_day',
    chapter_id: 'progress',
    kind: 'single',
    title: 'Se ha saltado un día',
    prompt: 'Jueves no entrenó. El viernes ya está escrito.',
    layout: 'stack',
    options: [
      { id: 'lost', label: 'Se pierde. No se recupera' },
      { id: 'move_next', label: 'Lo muevo al siguiente hueco' },
      { id: 'weekend', label: 'Algo entra el fin de semana' },
      { id: 'depends_session', label: 'Depende de qué sesión era' },
    ],
  },
  {
    id: 'published_voice',
    chapter_id: 'voice',
    kind: 'single',
    title: 'En la sesión publicada',
    prompt: null,
    layout: 'stack',
    options: [
      { id: 'numbers', label: 'Números. Si pregunta, hablo' },
      { id: 'numbers_plus_why', label: 'Números y una frase de por qué hoy' },
      { id: 'explain_block', label: 'Le explico el bloque, no solo la serie' },
    ],
  },
  {
    id: 'is_this_ok',
    chapter_id: 'voice',
    kind: 'single',
    title: 'Te escribe “¿esto va bien?”',
    prompt: null,
    layout: 'stack',
    options: [
      { id: 'yes_no_short', label: 'Sí o no, corto' },
      { id: 'question_back', label: 'Una pregunta para que lo vea él' },
      { id: 'cheer_and_tune', label: 'Animo y afino' },
    ],
  },
  {
    id: 'box_stops',
    chapter_id: 'voice',
    kind: 'single',
    title: 'En el box se le para, ya empezó',
    prompt: 'Diez segundos. Hay más gente.',
    layout: 'stack',
    note_id: 'box_stops_phrase',
    note_hint: 'Si tienes una frase tuya para ese momento: escríbela tal cual.',
    options: [
      { id: 'less_volume', label: 'Menos volumen, mismo ejercicio' },
      { id: 'less_load', label: 'Menos carga, mismo esquema' },
      { id: 'change_exercise', label: 'Cambio a algo que pueda hacer bien' },
      { id: 'continue', label: 'Sigue. Si se para otra vez, corto' },
    ],
  },
];

export function questionById(id: string): InterviewQuestionDef | undefined {
  return INTERVIEW_QUESTIONS.find((q) => q.id === id);
}

export function questionsForChapter(chapter_id: ChapterId): InterviewQuestionDef[] {
  return INTERVIEW_QUESTIONS.filter((q) => q.chapter_id === chapter_id);
}

export function isOptionId(field: SingleField | MultiField, value: string): boolean {
  return (OPTION_IDS[field] as readonly string[]).includes(value);
}
