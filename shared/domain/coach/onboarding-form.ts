// Alta del atleta = dato del coach, no un flujo nuestro.
//
// Mecanismo (código): tipos de pregunta, pasos, claves únicas, validar, copiar.
// Método (dato): las preguntas y los pasos. Un club nuevo no toca esto.
//
// Un preset típico al empezar. Se puede editar entero y se puede borrar.
// El coach puede crear más y duplicar. Si otro entrenador preguntaría otra
// cosa, no es const del producto.

export const ONBOARDING_QUESTION_TYPES = [
  'single',
  'multi',
  'text',
  'long_text',
  'number',
  'mark',
  'yes_no',
] as const;
export type OnboardingQuestionType = (typeof ONBOARDING_QUESTION_TYPES)[number];

export const ONBOARDING_QUESTION_TYPE_LABELS: Record<OnboardingQuestionType, string> = {
  single: 'Una opción',
  multi: 'Varias opciones',
  text: 'Texto corto',
  long_text: 'Texto largo',
  number: 'Número',
  mark: 'Marca o tiempo',
  yes_no: 'Sí o no',
};

/** Campos del atleta a los que una pregunta PUEDE anclarse. Opcional. */
export const ONBOARDING_BINDS = [
  'goal',
  'training_days',
  'injury',
  'sleep',
  'level',
] as const;
export type OnboardingBind = (typeof ONBOARDING_BINDS)[number];

export const ONBOARDING_BIND_LABELS: Record<OnboardingBind, string> = {
  goal: 'Objetivo',
  training_days: 'Días de entreno',
  injury: 'Lesión',
  sleep: 'Sueño',
  level: 'Nivel',
};

export const ONBOARDING_DESTINATION_EMAIL_MAX = 254;

export const ONBOARDING_NAME_MAX = 80;
export const ONBOARDING_STEP_TITLE_MAX = 80;
export const ONBOARDING_QUESTION_TITLE_MAX = 160;
export const ONBOARDING_PROMPT_MAX = 280;
export const ONBOARDING_OPTION_LABEL_MAX = 80;
export const ONBOARDING_STEPS_MAX = 12;
export const ONBOARDING_QUESTIONS_PER_STEP_MAX = 20;
export const ONBOARDING_OPTIONS_MAX = 16;
export const ONBOARDING_TEXT_ANSWER_MAX = 280;
export const ONBOARDING_LONG_TEXT_ANSWER_MAX = 2_000;
export const ONBOARDING_MARK_ANSWER_MAX = 40;

export const ONBOARDING_FORM_ORIGINS = ['preset', 'custom'] as const;
export type OnboardingFormOrigin = (typeof ONBOARDING_FORM_ORIGINS)[number];

export interface OnboardingOption {
  code: string;
  label: string;
}

export interface OnboardingQuestion {
  id: string;
  key: string;
  type: OnboardingQuestionType;
  title: string;
  prompt: string | null;
  required: boolean;
  options: OnboardingOption[];
  bind: OnboardingBind | null;
}

export interface OnboardingStep {
  id: string;
  title: string;
  questions: OnboardingQuestion[];
}

export interface OnboardingFormDefinition {
  steps: OnboardingStep[];
}

export interface OnboardingFormSummary {
  step_count: number;
  question_count: number;
}

export type OnboardingAnswerValue = string | string[] | number | boolean;

export type OnboardingAnswers = Record<string, OnboardingAnswerValue>;

export interface OnboardingIssue {
  path: string;
  message: string;
}

const KEY_RE = /^[a-z][a-z0-9_]{0,59}$/;
const CODE_RE = /^[a-z][a-z0-9_]{0,59}$/;
const ID_RE = /^[a-z0-9_]{2,48}$/;

export function newOnboardingId(prefix: string): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const raw =
    g.crypto?.randomUUID?.().replace(/-/g, '') ??
    `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${raw.slice(0, 16)}`;
}

export function slugifyOnboardingKey(input: string): string {
  const s = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return KEY_RE.test(s) ? s : `p_${s || 'pregunta'}`.slice(0, 60);
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t.length === 0 ? null : t;
}

export function emptyQuestion(type: OnboardingQuestionType = 'text'): OnboardingQuestion {
  const key = newOnboardingId('p').replace('p_', 'q');
  return {
    id: newOnboardingId('q'),
    key: slugifyOnboardingKey(key),
    type,
    title: '',
    prompt: null,
    required: false,
    options: type === 'single' || type === 'multi' ? [
      { code: 'opcion_a', label: '' },
      { code: 'opcion_b', label: '' },
    ] : [],
    bind: null,
  };
}

export function emptyStep(): OnboardingStep {
  return {
    id: newOnboardingId('s'),
    title: '',
    questions: [emptyQuestion('text')],
  };
}

export function emptyDefinition(): OnboardingFormDefinition {
  return { steps: [emptyStep()] };
}

export function summarizeOnboardingForm(def: OnboardingFormDefinition): OnboardingFormSummary {
  return {
    step_count: def.steps.length,
    question_count: def.steps.reduce((n, step) => n + step.questions.length, 0),
  };
}

export function allOnboardingQuestions(def: OnboardingFormDefinition): OnboardingQuestion[] {
  return def.steps.flatMap((step) => step.questions);
}

function uniqueOrIssue(
  values: string[],
  path: string,
  label: string,
  issues: OnboardingIssue[],
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      issues.push({ path, message: `Hay dos ${label} iguales: ${value}` });
      return;
    }
    seen.add(value);
  }
}

export function validateOnboardingDefinition(def: OnboardingFormDefinition): OnboardingIssue[] {
  const issues: OnboardingIssue[] = [];
  if (!Array.isArray(def.steps) || def.steps.length === 0) {
    return [{ path: 'steps', message: 'Hace falta al menos un paso.' }];
  }
  if (def.steps.length > ONBOARDING_STEPS_MAX) {
    issues.push({ path: 'steps', message: `Como mucho ${ONBOARDING_STEPS_MAX} pasos.` });
  }

  const questionIds: string[] = [];
  const questionKeys: string[] = [];

  def.steps.forEach((step, si) => {
    const sp = `steps.${si}`;
    if (!ID_RE.test(step.id)) {
      issues.push({ path: `${sp}.id`, message: 'El id del paso no vale.' });
    }
    const title = step.title.trim();
    if (!title) issues.push({ path: `${sp}.title`, message: 'El paso necesita un nombre.' });
    if (title.length > ONBOARDING_STEP_TITLE_MAX) {
      issues.push({ path: `${sp}.title`, message: `El nombre del paso es demasiado largo.` });
    }
    if (!Array.isArray(step.questions) || step.questions.length === 0) {
      issues.push({ path: `${sp}.questions`, message: 'Cada paso necesita al menos una pregunta.' });
    }
    if (step.questions.length > ONBOARDING_QUESTIONS_PER_STEP_MAX) {
      issues.push({
        path: `${sp}.questions`,
        message: `Como mucho ${ONBOARDING_QUESTIONS_PER_STEP_MAX} preguntas por paso.`,
      });
    }
    step.questions.forEach((q, qi) => {
      const qp = `${sp}.questions.${qi}`;
      questionIds.push(q.id);
      questionKeys.push(q.key);
      if (!ID_RE.test(q.id)) issues.push({ path: `${qp}.id`, message: 'El id de la pregunta no vale.' });
      if (!KEY_RE.test(q.key)) {
        issues.push({ path: `${qp}.key`, message: 'La clave tiene que ser minúsculas, números o _.' });
      }
      const qTitle = q.title.trim();
      if (!qTitle) issues.push({ path: `${qp}.title`, message: 'La pregunta necesita un enunciado.' });
      if (qTitle.length > ONBOARDING_QUESTION_TITLE_MAX) {
        issues.push({ path: `${qp}.title`, message: 'El enunciado es demasiado largo.' });
      }
      if (q.prompt != null && q.prompt.length > ONBOARDING_PROMPT_MAX) {
        issues.push({ path: `${qp}.prompt`, message: 'La ayuda es demasiado larga.' });
      }
      if (!(ONBOARDING_QUESTION_TYPES as readonly string[]).includes(q.type)) {
        issues.push({ path: `${qp}.type`, message: 'Ese tipo de pregunta no existe.' });
      }
      if (q.bind != null && !(ONBOARDING_BINDS as readonly string[]).includes(q.bind)) {
        issues.push({ path: `${qp}.bind`, message: 'Ese ancla no existe.' });
      }
      const needsOptions = q.type === 'single' || q.type === 'multi';
      if (needsOptions) {
        if (q.options.length < 2) {
          issues.push({ path: `${qp}.options`, message: 'Hacen falta al menos dos opciones.' });
        }
        if (q.options.length > ONBOARDING_OPTIONS_MAX) {
          issues.push({ path: `${qp}.options`, message: `Como mucho ${ONBOARDING_OPTIONS_MAX} opciones.` });
        }
        const codes: string[] = [];
        q.options.forEach((opt, oi) => {
          if (!CODE_RE.test(opt.code)) {
            issues.push({ path: `${qp}.options.${oi}.code`, message: 'El código de la opción no vale.' });
          }
          if (!opt.label.trim()) {
            issues.push({ path: `${qp}.options.${oi}.label`, message: 'La opción necesita texto.' });
          }
          if (opt.label.length > ONBOARDING_OPTION_LABEL_MAX) {
            issues.push({ path: `${qp}.options.${oi}.label`, message: 'El texto de la opción es demasiado largo.' });
          }
          codes.push(opt.code);
        });
        uniqueOrIssue(codes, `${qp}.options`, 'códigos', issues);
      } else if (q.options.length > 0) {
        issues.push({ path: `${qp}.options`, message: 'Este tipo de pregunta no lleva opciones.' });
      }
    });
  });

  uniqueOrIssue(questionIds, 'questions', 'ids', issues);
  uniqueOrIssue(questionKeys, 'questions', 'claves', issues);
  return issues;
}

export function definitionIsValid(def: OnboardingFormDefinition): boolean {
  return validateOnboardingDefinition(def).length === 0;
}

export function duplicateOnboardingDefinition(
  def: OnboardingFormDefinition,
): OnboardingFormDefinition {
  return {
    steps: def.steps.map((step) => ({
      id: newOnboardingId('s'),
      title: step.title,
      questions: step.questions.map((q) => ({
        ...q,
        id: newOnboardingId('q'),
        prompt: q.prompt,
        options: q.options.map((opt) => ({ ...opt })),
      })),
    })),
  };
}

function optionCodes(q: OnboardingQuestion): Set<string> {
  return new Set(q.options.map((o) => o.code));
}

export function validateOnboardingAnswers(
  def: OnboardingFormDefinition,
  answers: OnboardingAnswers,
): OnboardingIssue[] {
  const issues: OnboardingIssue[] = [];
  for (const q of allOnboardingQuestions(def)) {
    const raw = answers[q.key];
    const missing = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);
    if (missing) {
      if (q.required) issues.push({ path: q.key, message: 'Esta pregunta es obligatoria.' });
      continue;
    }
    switch (q.type) {
      case 'single': {
        if (typeof raw !== 'string' || !optionCodes(q).has(raw)) {
          issues.push({ path: q.key, message: 'Elige una de las opciones.' });
        }
        break;
      }
      case 'yes_no': {
        if (raw !== 'si' && raw !== 'no' && raw !== true && raw !== false) {
          issues.push({ path: q.key, message: 'Responde sí o no.' });
        }
        break;
      }
      case 'multi': {
        if (!Array.isArray(raw) || raw.some((c) => typeof c !== 'string' || !optionCodes(q).has(c))) {
          issues.push({ path: q.key, message: 'Elige solo opciones de la lista.' });
        }
        break;
      }
      case 'text':
      case 'mark': {
        if (typeof raw !== 'string') {
          issues.push({ path: q.key, message: 'Escribe un texto.' });
        } else {
          const max = q.type === 'mark' ? ONBOARDING_MARK_ANSWER_MAX : ONBOARDING_TEXT_ANSWER_MAX;
          if (raw.trim().length > max) issues.push({ path: q.key, message: 'Es demasiado largo.' });
        }
        break;
      }
      case 'long_text': {
        if (typeof raw !== 'string') {
          issues.push({ path: q.key, message: 'Escribe un texto.' });
        } else if (raw.trim().length > ONBOARDING_LONG_TEXT_ANSWER_MAX) {
          issues.push({ path: q.key, message: 'Es demasiado largo.' });
        }
        break;
      }
      case 'number': {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n)) issues.push({ path: q.key, message: 'Escribe un número.' });
        break;
      }
    }
  }
  return issues;
}

export function typicalOnboardingPreset(): OnboardingFormDefinition {
  return {
    steps: [
      {
        id: 's_objetivo',
        title: 'Qué buscas',
        questions: [
          {
            id: 'q_objetivo',
            key: 'objetivo',
            type: 'single',
            title: '¿Qué quieres conseguir?',
            prompt: null,
            required: true,
            bind: 'goal',
            options: [
              { code: 'carrera', label: 'Preparar una carrera' },
              { code: 'mejorar_marca', label: 'Mejorar una marca' },
              { code: 'mas_fuerte', label: 'Ponerme más fuerte' },
              { code: 'estar_en_forma', label: 'Estar en forma' },
              { code: 'no_lo_se', label: 'Aún no lo tengo claro' },
            ],
          },
          {
            id: 'q_plazo',
            key: 'plazo',
            type: 'single',
            title: '¿Para cuándo?',
            prompt: null,
            required: true,
            bind: null,
            options: [
              { code: 'menos_3m', label: 'Menos de 3 meses' },
              { code: 'de_3_6m', label: '3-6 meses' },
              { code: 'de_6_12m', label: '6-12 meses' },
              { code: 'sin_prisa', label: 'Sin prisa' },
            ],
          },
          {
            id: 'q_objetivo_nota',
            key: 'objetivo_nota',
            type: 'text',
            title: 'Si quieres, cuéntalo en tus palabras',
            prompt: null,
            required: false,
            bind: null,
            options: [],
          },
        ],
      },
      {
        id: 's_historial',
        title: 'De dónde vienes',
        questions: [
          {
            id: 'q_anos',
            key: 'anos_entrenando',
            type: 'single',
            title: '¿Cuánto tiempo llevas entrenando?',
            prompt: null,
            required: true,
            bind: null,
            options: [
              { code: 'menos_1', label: 'Menos de 1 año' },
              { code: 'de_1_3', label: '1-3 años' },
              { code: 'de_3_5', label: '3-5 años' },
              { code: 'mas_5', label: 'Más de 5 años' },
            ],
          },
          {
            id: 'q_deportes',
            key: 'deportes_origen',
            type: 'multi',
            title: '¿De qué vienes?',
            prompt: 'Puedes marcar más de uno.',
            required: false,
            bind: null,
            options: [
              { code: 'running', label: 'Running' },
              { code: 'fuerza', label: 'Fuerza / gimnasio' },
              { code: 'equipo', label: 'Deporte de equipo' },
              { code: 'natacion', label: 'Natación' },
              { code: 'ciclismo', label: 'Ciclismo' },
              { code: 'combate', label: 'Combate' },
              { code: 'otro', label: 'Otro' },
            ],
          },
          {
            id: 'q_nivel',
            key: 'nivel',
            type: 'single',
            title: '¿Cómo te ves ahora?',
            prompt: null,
            required: true,
            bind: 'level',
            options: [
              { code: 'empiezo', label: 'Empiezo' },
              { code: 'entreno_sin_plan', label: 'Entreno, pero sin plan' },
              { code: 'con_plan', label: 'Llevo tiempo con un plan' },
              { code: 'compito', label: 'Compito' },
            ],
          },
        ],
      },
      {
        id: 's_semana',
        title: 'Cómo entrenas ahora',
        questions: [
          {
            id: 'q_dias',
            key: 'dias_semana',
            type: 'single',
            title: '¿Cuántos días puedes entrenar?',
            prompt: null,
            required: true,
            bind: 'training_days',
            options: [
              { code: 'd2', label: '2 días' },
              { code: 'd3', label: '3 días' },
              { code: 'd4', label: '4 días' },
              { code: 'd5', label: '5 días' },
              { code: 'd6', label: '6 o más' },
            ],
          },
          {
            id: 'q_duracion',
            key: 'duracion_sesion',
            type: 'single',
            title: '¿Cuánto suele durar una sesión?',
            prompt: null,
            required: false,
            bind: null,
            options: [
              { code: 'menos_45', label: 'Menos de 45 min' },
              { code: 'de_45_60', label: '45-60 min' },
              { code: 'de_60_90', label: '60-90 min' },
              { code: 'mas_90', label: 'Más de 90 min' },
            ],
          },
          {
            id: 'q_material',
            key: 'material',
            type: 'single',
            title: '¿Dónde sueles entrenar?',
            prompt: null,
            required: false,
            bind: null,
            options: [
              { code: 'box', label: 'Box o gimnasio' },
              { code: 'casa', label: 'En casa' },
              { code: 'calle', label: 'En la calle' },
              { code: 'lo_que_haya', label: 'Con lo que haya' },
            ],
          },
        ],
      },
      {
        id: 's_salud',
        title: 'Salud',
        questions: [
          {
            id: 'q_lesion',
            key: 'lesion_actual',
            type: 'yes_no',
            title: '¿Tienes ahora mismo alguna molestia o lesión?',
            prompt: null,
            required: true,
            bind: 'injury',
            options: [],
          },
          {
            id: 'q_lesion_detalle',
            key: 'lesion_detalle',
            type: 'text',
            title: 'Si sí, ¿dónde y desde cuándo?',
            prompt: null,
            required: false,
            bind: null,
            options: [],
          },
          {
            id: 'q_sueno',
            key: 'sueno',
            type: 'single',
            title: '¿Cómo duermes?',
            prompt: null,
            required: false,
            bind: 'sleep',
            options: [
              { code: 'mal', label: 'Mal' },
              { code: 'regular', label: 'Regular' },
              { code: 'bien', label: 'Bien' },
              { code: 'muy_bien', label: 'Muy bien' },
            ],
          },
        ],
      },
      {
        id: 's_numeros',
        title: 'Números si los tienes',
        questions: [
          {
            id: 'q_marca_carrera',
            key: 'marca_carrera',
            type: 'mark',
            title: 'Tu mejor 5 km, si lo tienes',
            prompt: 'Por ejemplo 22:30. Si no lo sabes, déjalo vacío.',
            required: false,
            bind: null,
            options: [],
          },
          {
            id: 'q_otra_marca',
            key: 'otra_marca',
            type: 'text',
            title: '¿Hay otra marca que te importe?',
            prompt: null,
            required: false,
            bind: null,
            options: [],
          },
          {
            id: 'q_fc',
            key: 'fc_maxima',
            type: 'number',
            title: 'Frecuencia cardíaca máxima, si la sabes',
            prompt: null,
            required: false,
            bind: null,
            options: [],
          },
        ],
      },
    ],
  };
}

export function normalizeDestinationEmail(raw: string | null | undefined): string | null {
  const t = trimOrNull(raw);
  return t ? t.toLowerCase() : null;
}

const DESTINATION_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateDestinationEmail(raw: string | null | undefined): OnboardingIssue[] {
  const email = normalizeDestinationEmail(raw);
  if (email == null) return [];
  if (email.length > ONBOARDING_DESTINATION_EMAIL_MAX) {
    return [{ path: 'destination_email', message: 'El correo es demasiado largo.' }];
  }
  if (!DESTINATION_EMAIL_RE.test(email)) {
    return [{ path: 'destination_email', message: 'Ese correo no vale.' }];
  }
  return [];
}

export const TYPICAL_ONBOARDING_NAME = 'Alta típica';

export function typicalOnboardingName(): string {
  return TYPICAL_ONBOARDING_NAME;
}

export function definitionMentionsProductBrand(def: OnboardingFormDefinition): boolean {
  const blob = JSON.stringify(def).toLowerCase();
  return blob.includes('fahybrid') || blob.includes('fahybrik') || blob.includes('fabrik');
}

export function normalizeOnboardingDefinition(raw: OnboardingFormDefinition): OnboardingFormDefinition {
  return {
    steps: raw.steps.map((step) => ({
      id: step.id.trim(),
      title: step.title.trim(),
      questions: step.questions.map((q) => ({
        id: q.id.trim(),
        key: q.key.trim(),
        type: q.type,
        title: q.title.trim(),
        prompt: trimOrNull(q.prompt),
        required: q.required === true,
        options: (q.type === 'single' || q.type === 'multi')
          ? q.options.map((opt) => ({ code: opt.code.trim(), label: opt.label.trim() }))
          : [],
        bind: q.bind ?? null,
      })),
    })),
  };
}
