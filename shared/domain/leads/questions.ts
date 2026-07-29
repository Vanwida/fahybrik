// FAHYBRID web onboarding — canonical question/flow definition.
//
// SINGLE SOURCE OF TRUTH for the lead funnel, shared by:
//   • the public UI (web/app/[locale]/empieza) — renders these screens,
//   • the API (web/app/api/leads*) — validates codes via shared/schema/leads.ts,
//   • the lead emails (web/lib/leads/email.ts) — maps codes → Spanish labels.
//
// The flow, questions, options, copy and branching are LOCKED to the signed-off
// mockup at docs/superpowers/plans/onboarding-web-mockup.html (verbatim Spanish).
// Answers are keyed by DB COLUMN (e.g. `objetivo`); single-selects store a stable
// snake_case CODE, multi-selects a code[]. Codes never change when copy changes.
//
// Pure data + helpers — no framework imports, safe in both client and server bundles.

export type LeadBlockKey = 'start' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'Z';

export const LEAD_BLOCKS: Record<LeadBlockKey, string> = {
  start: 'Empecemos',
  A: 'Tu objetivo',
  B: 'Tu historial',
  C: 'Tu entrenamiento hoy',
  D: 'Salud y recuperación',
  E: 'Tus números',
  F: 'Para tu llamada',
  Z: 'Ya casi está',
};

export interface LeadOption {
  code: string;
  label: string;
}

/**
 * Closed option sets keyed by the DB column they populate. The Zod schema derives
 * its enums from these; the UI renders `label`, stores/sends `code`; the email maps
 * `code` → `label`. Multi-select columns (text[]) reuse the same shape.
 */
export const LEAD_OPTIONS = {
  // ── Bloque A · objetivo ──
  objetivo: [
    { code: 'primer_hyrox', label: 'Completar mi primer HYROX' },
    { code: 'mejorar_marca', label: 'Mejorar mi marca' },
    { code: 'podio', label: 'Mundial o podio en mi categoría' },
    { code: 'hibrido_general', label: 'Rendimiento híbrido general' },
    { code: 'otro', label: 'Otro' },
  ],
  carrera_mente: [
    { code: 'si_se_cual', label: 'Sí, ya sé cuál' },
    { code: 'si_no_se_cual', label: 'Sí, pero aún no sé cuál' },
    { code: 'todavia_no', label: 'Todavía no' },
  ],
  carrera_cual: [
    { code: 'hyrox_barcelona', label: 'HYROX Barcelona' },
    { code: 'hyrox_madrid', label: 'HYROX Madrid' },
    { code: 'hyrox_valencia', label: 'HYROX Valencia' },
    { code: 'deka', label: 'DEKA' },
    { code: 'otra_fuera', label: 'Otra / fuera de España' },
  ],
  carrera_cuando: [
    { code: 'menos_3m', label: 'En menos de 3 meses' },
    { code: 'de_3_6m', label: '3-6 meses' },
    { code: 'mas_6m', label: 'Más de 6 meses' },
  ],
  plazo: [
    { code: 'menos_3m', label: 'Menos de 3 meses' },
    { code: 'de_3_6m', label: '3-6 meses' },
    { code: 'de_6_12m', label: '6-12 meses' },
    { code: 'largo_plazo', label: 'Largo plazo, sin prisa' },
  ],
  motivo: [
    { code: 'no_progreso', label: 'Entreno solo y no veo progreso' },
    { code: 'preparar_carrera', label: 'Quiero prepararme en serio una carrera' },
    { code: 'recomendado', label: 'Me lo han recomendado' },
    { code: 'visto_resultados', label: 'He visto resultados de otros atletas' },
    { code: 'salto_nivel', label: 'Quiero dar un salto de nivel' },
  ],
  inicio: [
    { code: 'ya_mismo', label: 'Ya mismo' },
    { code: 'este_mes', label: 'Este mes' },
    { code: 'mas_adelante', label: 'Más adelante' },
  ],

  // ── Bloque B · historial ──
  competido: [
    { code: 'nunca', label: 'Nunca' },
    { code: 'una_vez', label: '1 vez' },
    { code: 'dos_tres', label: '2-3 veces' },
    { code: 'mas_tres', label: 'Más de 3' },
  ],
  categorias_competido: [
    { code: 'individual_open', label: 'Individual Open' },
    { code: 'individual_pro', label: 'Individual Pro' },
    { code: 'dobles_open', label: 'Dobles Open' },
    { code: 'dobles_pro', label: 'Dobles Pro' },
    { code: 'mixto', label: 'Mixto' },
    { code: 'deka', label: 'DEKA' },
  ],
  dificultad: [
    { code: 'running', label: 'El running entre estaciones' },
    { code: 'estaciones_fuerza', label: 'Las estaciones de fuerza (sled, wall balls)' },
    { code: 'ergometros', label: 'Los ergómetros' },
    { code: 'gestion_esfuerzo', label: 'La gestión del esfuerzo' },
  ],
  categoria_objetivo: [
    { code: 'individual_open', label: 'Individual Open' },
    { code: 'individual_pro', label: 'Individual Pro' },
    { code: 'dobles_open', label: 'Dobles Open' },
    { code: 'dobles_pro', label: 'Dobles Pro' },
    { code: 'mixto', label: 'Mixto' },
    { code: 'no_lo_se', label: 'Todavía no lo sé' },
  ],
  dobles_pareja: [
    { code: 'si_plan_compartido', label: 'Sí, y queremos plan compartido' },
    { code: 'si_planes_separados', label: 'Sí, pero cada uno su plan' },
    { code: 'sin_pareja', label: 'Aún no tengo pareja' },
  ],

  // ── Bloque C · entrenamiento hoy ──
  anos_entrenando: [
    { code: 'menos_1', label: 'Menos de 1' },
    { code: 'de_1_3', label: '1-3' },
    { code: 'de_3_5', label: '3-5' },
    { code: 'mas_5', label: 'Más de 5' },
  ],
  deportes_origen: [
    { code: 'equipo', label: 'Deportes de equipo' },
    { code: 'running', label: 'Running' },
    { code: 'gym', label: 'Musculación / gym' },
    { code: 'crossfit', label: 'CrossFit' },
    { code: 'natacion', label: 'Natación' },
    { code: 'ciclismo', label: 'Ciclismo' },
    { code: 'artes_marciales', label: 'Artes marciales' },
    { code: 'otro', label: 'Otro' },
  ],
  nivel: [
    { code: 'principiante', label: 'Principiante — llevo poco entrenando' },
    { code: 'intermedio', label: 'Intermedio — regular pero sin estructura' },
    { code: 'avanzado', label: 'Avanzado — con estructura y buena base' },
    { code: 'competidor', label: 'Competidor — compito y busco rendimiento' },
  ],
  punto_fuerte: [
    { code: 'running', label: 'Running' },
    { code: 'fuerza', label: 'Fuerza' },
    { code: 'ergometros', label: 'Ergómetros' },
    { code: 'resistencia', label: 'Resistencia general' },
    { code: 'no_lo_se', label: 'No lo sé todavía' },
  ],
  punto_debil: [
    { code: 'running', label: 'Running' },
    { code: 'fuerza', label: 'Fuerza' },
    { code: 'ergometros', label: 'Ergómetros' },
    { code: 'resistencia', label: 'Resistencia general' },
    { code: 'no_lo_se', label: 'No lo sé todavía' },
  ],
  material: [
    { code: 'box_completo', label: 'Box HYROX con material completo' },
    { code: 'gimnasio', label: 'Gimnasio convencional' },
    { code: 'basico_casa', label: 'Material básico o en casa' },
    { code: 'solo_running', label: 'Solo running de momento' },
  ],
  dias_semana: [
    { code: 'd2_3', label: '2-3' },
    { code: 'd3_4', label: '3-4' },
    { code: 'd4_5', label: '4-5' },
    { code: 'd6_mas', label: '6 o más' },
  ],
  duracion_sesion: [
    { code: 'min_30_45', label: '30-45 min' },
    { code: 'min_45_60', label: '45-60 min' },
    { code: 'min_60_90', label: '60-90 min' },
    { code: 'min_mas_90', label: 'Más de 90' },
  ],
  flexibilidad_horaria: [
    { code: 'cualquier_hora', label: 'Puedo entrenar a cualquier hora' },
    { code: 'mananas', label: 'Solo mañanas' },
    { code: 'tardes_noches', label: 'Solo tardes/noches' },
    { code: 'fines_semana', label: 'Solo fines de semana' },
    { code: 'muy_limitada', label: 'Muy limitada' },
  ],

  // ── Bloque D · salud y recuperación ──
  lesion_actual: [
    { code: 'ninguna', label: 'Ninguna' },
    { code: 'leve', label: 'Leve, no me impide entrenar' },
    { code: 'limita', label: 'Me limita algunos ejercicios' },
    { code: 'recuperandose', label: 'Recuperándome de una reciente' },
  ],
  lesion_zonas: [
    { code: 'rodilla', label: 'Rodilla' },
    { code: 'cadera', label: 'Cadera' },
    { code: 'lumbar', label: 'Lumbar' },
    { code: 'hombro', label: 'Hombro' },
    { code: 'tobillo_pie', label: 'Tobillo / pie' },
    { code: 'otra', label: 'Otra' },
  ],
  lesiones_pasadas: [
    { code: 'ninguna', label: 'Ninguna' },
    { code: 'musculares', label: 'Musculares' },
    { code: 'articulares', label: 'Articulares' },
    { code: 'espalda', label: 'Espalda' },
    { code: 'otra', label: 'Otra' },
  ],
  sueno: [
    { code: 'bien_7_9', label: 'Duermo bien, 7-9 h' },
    { code: 'suficiente', label: 'Suficiente pero no siempre descanso' },
    { code: 'menos_6', label: 'Menos de 6 h' },
    { code: 'problemas', label: 'Problemas frecuentes de sueño' },
  ],
  estres: [
    { code: 'bajo', label: 'Bajo — vida tranquila' },
    { code: 'moderado', label: 'Moderado — trabajo/estudios exigentes' },
    { code: 'alto', label: 'Alto — mucha carga mental' },
    { code: 'muy_alto', label: 'Muy alto — me cuesta desconectar' },
  ],
  alimentacion: [
    { code: 'cuido_mucho', label: 'Cuido mucho lo que como' },
    { code: 'intento', label: 'Intento comer bien, sin plan' },
    { code: 'irregular', label: 'Irregular y poco equilibrada' },
    { code: 'no_atencion', label: 'No le presto atención' },
  ],
  recuperacion: [
    { code: 'bien', label: 'Bien, buena energía' },
    { code: 'fatiga_acumulada', label: 'Noto fatiga acumulada' },
    { code: 'cuesta', label: 'Me cuesta recuperarme' },
    { code: 'siempre_fatigado', label: 'Constantemente fatigado' },
  ],

  // ── Bloque E · tus números ──
  wearable: [
    { code: 'garmin', label: 'Garmin' },
    { code: 'coros', label: 'COROS' },
    { code: 'polar', label: 'Polar' },
    { code: 'whoop', label: 'WHOOP' },
    { code: 'apple_watch', label: 'Apple Watch' },
    { code: 'otro', label: 'Otro' },
    { code: 'no_uso', label: 'No uso' },
  ],
  estaciones_debiles: [
    { code: 'ski', label: 'Ski erg' },
    { code: 'sled_push', label: 'Sled push' },
    { code: 'sled_pull', label: 'Sled pull' },
    { code: 'burpee', label: 'Burpee broad jump' },
    { code: 'row', label: 'Row' },
    { code: 'farmers', label: 'Farmers carry' },
    { code: 'lunges', label: 'Sandbag lunges' },
    { code: 'wall_balls', label: 'Wall balls' },
    { code: 'running', label: 'El running entre estaciones' },
    { code: 'no_lo_se', label: 'No lo sé todavía' },
  ],

  // ── Bloque F · para la llamada ──
  planes_previos: [
    { code: 'nunca', label: 'Nunca' },
    { code: 'internet_apps', label: 'Planes de internet o apps' },
    { code: 'coach', label: 'Con un coach' },
    { code: 'pt_gimnasio', label: 'Con un PT de gimnasio' },
  ],
  planes_fallo: [
    { code: 'generico', label: 'Demasiado genérico' },
    { code: 'sin_seguimiento', label: 'Sin seguimiento real' },
    { code: 'no_adaptado', label: 'No se adaptaba a mi nivel' },
    { code: 'rigido', label: 'Demasiado rígido' },
  ],
  espera_coaching: [
    { code: 'feedback_semanal', label: 'Feedback semanal de verdad' },
    { code: 'disponibilidad', label: 'Disponibilidad para dudas' },
    { code: 'ajustes', label: 'Ajustes constantes del plan' },
    { code: 'plan_medida', label: 'Un plan hecho a mi medida y mis limitaciones' },
  ],
  conocido: [
    { code: 'instagram', label: 'Instagram' },
    { code: 'recomendacion', label: 'Recomendación' },
    { code: 'evento_hyrox', label: 'Evento HYROX' },
    { code: 'fabrik', label: 'Fabrik' },
    { code: 'otro', label: 'Otro' },
  ],

  // ── Cierre · datos ──
  sexo: [
    { code: 'hombre', label: 'Hombre' },
    { code: 'mujer', label: 'Mujer' },
    { code: 'prefiero_no_decir', label: 'Prefiero no decirlo' },
  ],
  ubicacion: [
    { code: 'barcelona', label: 'Barcelona y alrededores' },
    { code: 'resto_espana', label: 'Resto de España' },
    { code: 'fuera_espana', label: 'Fuera de España' },
  ],
} as const satisfies Record<string, readonly LeadOption[]>;

export type LeadColumn = keyof typeof LEAD_OPTIONS;

// ── Answers shape (keyed by DB column) ──────────────────────────────────────────
export type LeadAnswerValue = string | string[] | number | boolean | undefined;
export type LeadAnswers = Record<string, LeadAnswerValue>;

// ── Question flow ───────────────────────────────────────────────────────────────
export type LeadQuestionKind =
  | 'text'
  | 'email'
  | 'tel'
  | 'single'
  | 'multi'
  | 'time'
  | 'textarea'
  | 'composite2'
  | 'numberfields'
  | 'datos'
  | 'contacto';

export interface LeadQuestion {
  id: string;                 // 'q-objetivo' (stable screen id)
  block: LeadBlockKey;
  kind: LeadQuestionKind;
  /** DB column populated (single/multi/text/time/textarea). Composite screens use sub-keys.
   *  Includes the free-text columns that have no option set (not LeadColumn). */
  key?: LeadColumn | 'nombre' | 'email' | 'marca_hyrox' | 'nota_libre';
  title: string | ((nombre: string) => string);
  sub?: string;
  placeholder?: string;
  note?: string;
  optionsKey?: LeadColumn;    // which LEAD_OPTIONS set to render (single/multi)
  exclusive?: string[];       // codes that clear the rest (multi)
  optional?: boolean;
  cta?: string;               // custom primary-button label
  skipLabel?: string;         // ghost skip button (time / numberfields)
  visibleIf?: (a: LeadAnswers) => boolean;
  /** composite2 (q-carrera-cual): two single-select groups, each a DB column. */
  groups?: { key: LeadColumn; label: string }[];
  /** numberfields (q-marcas): free/number fields, each a DB column. */
  fields?: { key: string; label: string; placeholder: string; numeric?: boolean }[];
}

const isDobles = (v: LeadAnswerValue) => /dobles|mixto/.test(String(v ?? '')) && v !== undefined;

export const LEAD_QUESTIONS: LeadQuestion[] = [
  { id: 'q-nombre', block: 'start', kind: 'text', key: 'nombre',
    title: '¿Cómo te llamas?', placeholder: 'Tu nombre', note: 'Con tu nombre basta.' },

  // ── Bloque A ──
  { id: 'q-objetivo', block: 'A', kind: 'single', key: 'objetivo', optionsKey: 'objetivo',
    title: (n) => (n ? `${n}, ¿cuál es tu objetivo principal?` : '¿Cuál es tu objetivo principal?') },
  { id: 'q-carrera-mente', block: 'A', kind: 'single', key: 'carrera_mente', optionsKey: 'carrera_mente',
    title: '¿Tienes carrera en mente?',
    visibleIf: (a) => a.objetivo !== 'hibrido_general' },
  { id: 'q-carrera-cual', block: 'A', kind: 'composite2', title: '¿Cuál?',
    groups: [
      { key: 'carrera_cual', label: 'La carrera' },
      { key: 'carrera_cuando', label: '¿Cuándo?' },
    ],
    visibleIf: (a) => a.carrera_mente === 'si_se_cual' },
  { id: 'q-plazo', block: 'A', kind: 'single', key: 'plazo', optionsKey: 'plazo',
    title: '¿En qué plazo quieres conseguirlo?',
    visibleIf: (a) => a.carrera_mente !== 'si_se_cual' },
  { id: 'q-motivo', block: 'A', kind: 'single', key: 'motivo', optionsKey: 'motivo',
    title: '¿Qué te ha llevado a buscar un plan personalizado ahora?' },
  { id: 'q-inicio', block: 'A', kind: 'single', key: 'inicio', optionsKey: 'inicio',
    title: '¿Cuándo quieres empezar?' },
  { id: 'q-email', block: 'A', kind: 'email', key: 'email',
    title: '¿Tu email?', sub: 'Te enviamos el resumen y tu propuesta.',
    placeholder: 'tu@email.com', note: 'Sin spam. Solo tu proceso.' },

  // ── Bloque B ──
  { id: 'q-competido', block: 'B', kind: 'single', key: 'competido', optionsKey: 'competido',
    title: '¿Has competido alguna vez en HYROX o DEKA?' },
  { id: 'q-categorias', block: 'B', kind: 'multi', key: 'categorias_competido', optionsKey: 'categorias_competido',
    title: '¿En qué categorías has competido?',
    visibleIf: (a) => a.competido !== 'nunca' },
  { id: 'q-marca-hyrox', block: 'B', kind: 'time', key: 'marca_hyrox',
    title: '¿Tu mejor marca en HYROX o DEKA?', placeholder: 'h:mm  ·  ej. 1:12',
    skipLabel: 'No la recuerdo', optional: true,
    visibleIf: (a) => a.competido !== 'nunca' },
  { id: 'q-dificultad', block: 'B', kind: 'single', key: 'dificultad', optionsKey: 'dificultad',
    title: '¿Tu mayor dificultad en carrera?',
    visibleIf: (a) => a.competido !== 'nunca' },
  { id: 'q-categoria-objetivo', block: 'B', kind: 'single', key: 'categoria_objetivo', optionsKey: 'categoria_objetivo',
    title: '¿En qué categoría quieres competir?' },
  { id: 'q-dobles', block: 'B', kind: 'single', key: 'dobles_pareja', optionsKey: 'dobles_pareja',
    title: '¿Tienes pareja para dobles?',
    visibleIf: (a) => isDobles(a.categoria_objetivo) },

  // ── Bloque C ──
  { id: 'q-anos', block: 'C', kind: 'single', key: 'anos_entrenando', optionsKey: 'anos_entrenando',
    title: '¿Cuántos años llevas entrenando de forma regular?' },
  { id: 'q-deportes', block: 'C', kind: 'multi', key: 'deportes_origen', optionsKey: 'deportes_origen',
    title: '¿De dónde vienes?', sub: 'Marca lo que has practicado.' },
  { id: 'q-nivel', block: 'C', kind: 'single', key: 'nivel', optionsKey: 'nivel',
    title: '¿Tu nivel actual?' },
  { id: 'q-fuerte', block: 'C', kind: 'single', key: 'punto_fuerte', optionsKey: 'punto_fuerte',
    title: '¿Tu punto más fuerte?' },
  { id: 'q-debil', block: 'C', kind: 'single', key: 'punto_debil', optionsKey: 'punto_debil',
    title: '¿Y tu punto más débil?' },
  { id: 'q-material', block: 'C', kind: 'single', key: 'material', optionsKey: 'material',
    title: '¿Dónde y con qué entrenarás?' },
  { id: 'q-dias', block: 'C', kind: 'single', key: 'dias_semana', optionsKey: 'dias_semana',
    title: '¿Cuántos días a la semana puedes entrenar?' },
  { id: 'q-duracion', block: 'C', kind: 'single', key: 'duracion_sesion', optionsKey: 'duracion_sesion',
    title: '¿Cuánto tiempo por sesión?' },
  { id: 'q-flex', block: 'C', kind: 'single', key: 'flexibilidad_horaria', optionsKey: 'flexibilidad_horaria',
    title: '¿Tu flexibilidad horaria?' },

  // ── Bloque D ──
  { id: 'q-lesion', block: 'D', kind: 'single', key: 'lesion_actual', optionsKey: 'lesion_actual',
    title: '¿Tienes alguna lesión ahora mismo?' },
  { id: 'q-lesion-zona', block: 'D', kind: 'multi', key: 'lesion_zonas', optionsKey: 'lesion_zonas',
    title: '¿En qué zona?',
    visibleIf: (a) => !!a.lesion_actual && a.lesion_actual !== 'ninguna' },
  { id: 'q-lesion-pasada', block: 'D', kind: 'multi', key: 'lesiones_pasadas', optionsKey: 'lesiones_pasadas',
    title: '¿Lesiones importantes en el pasado?', exclusive: ['ninguna'] },
  { id: 'q-sueno', block: 'D', kind: 'single', key: 'sueno', optionsKey: 'sueno',
    title: '¿Tu sueño?' },
  { id: 'q-estres', block: 'D', kind: 'single', key: 'estres', optionsKey: 'estres',
    title: '¿Tu nivel de estrés diario?' },
  { id: 'q-alimentacion', block: 'D', kind: 'single', key: 'alimentacion', optionsKey: 'alimentacion',
    title: '¿Tu alimentación?' },
  { id: 'q-recuperacion', block: 'D', kind: 'single', key: 'recuperacion', optionsKey: 'recuperacion',
    title: '¿Cómo te recuperas entre sesiones?' },

  // ── Bloque E ──
  { id: 'q-wearable', block: 'E', kind: 'single', key: 'wearable', optionsKey: 'wearable',
    title: '¿Entrenas con reloj o wearable?', sub: 'Si los tienes. Todo se puede saltar.' },
  { id: 'q-marcas', block: 'E', kind: 'numberfields',
    title: 'Tus mejores marcas', sub: 'Opcional. Rellena las que sepas.',
    skipLabel: 'Aún no las tengo',
    fields: [
      { key: 'marca_5k', label: 'Mejor 5K', placeholder: 'mm:ss', numeric: true },
      { key: 'marca_10k', label: 'Mejor 10K', placeholder: 'mm:ss', numeric: true },
      { key: 'marca_hyrox_deka', label: 'Mejor HYROX/DEKA', placeholder: 'h:mm', numeric: true },
      { key: 'fc_maxima', label: 'FC máxima', placeholder: 'ppm', numeric: true },
    ] },
  { id: 'q-estaciones', block: 'E', kind: 'multi', key: 'estaciones_debiles', optionsKey: 'estaciones_debiles',
    title: '¿Dónde sientes que pierdes más tiempo?', exclusive: ['no_lo_se'] },

  // ── Bloque F ──
  { id: 'q-planes', block: 'F', kind: 'single', key: 'planes_previos', optionsKey: 'planes_previos',
    title: '¿Has seguido algún plan antes?' },
  { id: 'q-fallo', block: 'F', kind: 'multi', key: 'planes_fallo', optionsKey: 'planes_fallo',
    title: '¿Qué no funcionó?',
    visibleIf: (a) => !!a.planes_previos && a.planes_previos !== 'nunca' },
  { id: 'q-espera', block: 'F', kind: 'single', key: 'espera_coaching', optionsKey: 'espera_coaching',
    title: '¿Qué es lo que MÁS esperas del coaching?', sub: 'Elige una.' },
  { id: 'q-conocido', block: 'F', kind: 'single', key: 'conocido', optionsKey: 'conocido',
    title: '¿Cómo nos has conocido?' },
  { id: 'q-libre', block: 'F', kind: 'textarea', key: 'nota_libre',
    title: '¿Algo más que debamos saber antes de la llamada?',
    placeholder: 'Opcional — cuéntanos lo que quieras', cta: 'Terminar', optional: true },

  // ── Cierre ──
  { id: 'q-datos', block: 'Z', kind: 'datos', title: 'Un par de datos más' },
  { id: 'q-contacto', block: 'Z', kind: 'contacto', title: 'Tu teléfono' },
];

export const LEAD_QUESTION_BY_ID: Record<string, LeadQuestion> = Object.fromEntries(
  LEAD_QUESTIONS.map((q) => [q.id, q]),
);

/** The email question ends bloque A — the two-phase "draft" capture point. */
export const LEAD_DRAFT_TRIGGER_ID = 'q-email';

// ── Helpers ─────────────────────────────────────────────────────────────────────
export function leadFirstName(nombre: string | undefined | null): string {
  const raw = (nombre ?? '').trim().split(/\s+/)[0] ?? '';
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
}

export function resolveLeadTitle(q: LeadQuestion, nombre: string): string {
  return typeof q.title === 'function' ? q.title(nombre) : q.title;
}

/** Map a stored code back to its Spanish label for a given column (email/dashboard). */
export function leadOptionLabel(column: LeadColumn, code: string | null | undefined): string {
  if (!code) return '';
  const opt = (LEAD_OPTIONS[column] as readonly LeadOption[]).find((o) => o.code === code);
  return opt ? opt.label : code;
}

export function leadOptionLabels(column: LeadColumn, codes: readonly string[] | null | undefined): string[] {
  if (!codes) return [];
  return codes.map((c) => leadOptionLabel(column, c));
}

/**
 * Compact labels for the DENSE coach list, where a whole row of metadata lives on one
 * truncating line. Only overrides columns whose full option text is too long/verbose for
 * that context (e.g. nivel `avanzado` = "Avanzado — con estructura y buena base" → just
 * "Avanzado"). Any column/code without an override falls back to the full `leadOptionLabel`
 * so the map stays the SINGLE place labels are shortened. The FULL text stays on the ficha.
 */
const LEAD_SHORT_LABELS: Partial<Record<LeadColumn, Record<string, string>>> = {
  nivel: {
    principiante: 'Principiante',
    intermedio: 'Intermedio',
    avanzado: 'Avanzado',
    competidor: 'Competidor',
  },
  objetivo: {
    primer_hyrox: 'Primer HYROX',
    mejorar_marca: 'Mejorar marca',
    podio: 'Podio',
    hibrido_general: 'Híbrido',
    otro: 'Otro',
  },
  dias_semana: {
    d2_3: '2-3 días',
    d3_4: '3-4 días',
    d4_5: '4-5 días',
    d6_mas: '6+ días',
  },
  ubicacion: {
    barcelona: 'Barcelona',
    resto_espana: 'Resto España',
    fuera_espana: 'Fuera de España',
  },
  carrera_cual: {
    hyrox_barcelona: 'HYROX BCN',
    hyrox_madrid: 'HYROX MAD',
    hyrox_valencia: 'HYROX VLC',
    deka: 'DEKA',
    otra_fuera: 'Otra carrera',
  },
  carrera_cuando: {
    menos_3m: '<3 meses',
    de_3_6m: '3-6 meses',
    mas_6m: '>6 meses',
  },
};

/** Short label for the dense list; falls back to the full label when there is no override. */
export function leadShortLabel(column: LeadColumn, code: string | null | undefined): string {
  if (!code) return '';
  return LEAD_SHORT_LABELS[column]?.[code] ?? leadOptionLabel(column, code);
}

/** Every visible question for a given set of answers, in flow order (branching applied). */
export function visibleLeadQuestions(a: LeadAnswers): LeadQuestion[] {
  return LEAD_QUESTIONS.filter((q) => !q.visibleIf || q.visibleIf(a));
}

/** Codes of a column, for building Zod enums. */
export function leadCodes(column: LeadColumn): [string, ...string[]] {
  const codes = (LEAD_OPTIONS[column] as readonly LeadOption[]).map((o) => o.code);
  return codes as [string, ...string[]];
}
