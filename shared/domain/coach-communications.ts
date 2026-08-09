// @fahybrid/shared/domain/coach-communications — EL COMUNICADO del coach.
//
// La comunicación estructurada coach→atleta fuera del chat (docs/DECISIONS.md,
// 2026-08-09). El chat CONVERSA; el comunicado se PUBLICA y se RASTREA — por eso
// aquí viven un ciclo de vida y un orden de bandeja, y no solo un texto.
//
// Esta es la FUENTE del vocabulario: los cinco tipos, las siete anclas, el ciclo
// de vida, los límites de escritura y el orden en que la bandeja del atleta
// coloca lo que le reclama. Todo ello es MECANISMO (CLAUDE.md, HARD RULE Nº0) y
// por eso es código; lo que el coach escribe dentro es su MÉTODO y es dato.
//
// Puro y sin base de datos: web valida con estos esquemas antes de escribir, y
// el mismo módulo describe el contrato que consume iOS (respuestas snake_case).

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Los cinco tipos, las siete anclas, los tres estados
// ---------------------------------------------------------------------------

/**
 * Cinco, y son cinco porque cada uno pide una cosa distinta del atleta:
 * seguir unos pasos · decidir · cerrar una acción con fecha · entender · recordar.
 * Si algo no encaja en los cinco, el modelo está mal y se arregla aquí.
 */
export const COMMUNICATION_KINDS = ['protocol', 'question', 'task', 'note', 'focus'] as const;
export type CommunicationKind = (typeof COMMUNICATION_KINDS)[number];

/** Dónde aflora en la app. El ancla no es una etiqueta: decide la superficie. */
export const COMMUNICATION_ANCHORS = [
  'plan',
  'week',
  'session',
  'test',
  'race',
  'checkin',
  'general',
] as const;
export type CommunicationAnchor = (typeof COMMUNICATION_ANCHORS)[number];

/** El ciclo de vida del comunicado en la mano del coach. */
export const COMMUNICATION_STATUSES = ['draft', 'published', 'archived'] as const;
export type CommunicationStatus = (typeof COMMUNICATION_STATUSES)[number];

/**
 * El ciclo de vida del comunicado en la mano del ATLETA. `seen` no es el final
 * de nada: es el paso intermedio que hoy la app confunde con el final.
 */
export const COMMUNICATION_STATES = ['published', 'seen', 'done', 'answered'] as const;
export type CommunicationState = (typeof COMMUNICATION_STATES)[number];

/** Qué vistas pide el coach de su lista. */
export const COMMUNICATION_VIEWS = ['published', 'templates', 'drafts'] as const;
export type CommunicationView = (typeof COMMUNICATION_VIEWS)[number];

// ---------------------------------------------------------------------------
// Cara al atleta
// ---------------------------------------------------------------------------

/** Etiqueta del tipo, en versales, en la voz del atleta (cero jerga de producto). */
export const KIND_LABEL: Record<CommunicationKind, string> = {
  protocol: 'PROTOCOLO',
  question: 'PREGUNTA',
  task: 'TAREA',
  note: 'NOTA',
  focus: 'FOCO',
};

/**
 * El ancla, dicha como la diría el atleta. `general` no se pinta: un comunicado
 * que no cuelga de nada no gana nada por decir «general».
 */
export const ANCHOR_LABEL: Record<CommunicationAnchor, string | null> = {
  plan: 'Tu plan',
  week: 'Esta semana',
  session: 'La sesión',
  test: 'Tus tests',
  race: 'Día de carrera',
  checkin: 'Tu check-in',
  general: null,
};

/** ¿Pide un acto? Es lo que decide si sube a «Para hacer» en la bandeja. */
export const KIND_DEMANDS_ACTION: Record<CommunicationKind, boolean> = {
  protocol: true,
  question: true,
  task: true,
  note: false,
  focus: false,
};

// ---------------------------------------------------------------------------
// Límites de escritura
// ---------------------------------------------------------------------------

export const MAX_TITLE_CHARS = 140;
export const MAX_BODY_CHARS = 4000;
export const MAX_FINAL_NOTE_CHARS = 1000;
export const MAX_ITEM_LABEL_CHARS = 60;
export const MAX_ITEM_CONTENT_CHARS = 600;
export const MAX_ITEM_CONSEQUENCE_CHARS = 300;
export const MAX_ANCHOR_REF_CHARS = 120;
/** Pasos de un protocolo o secciones de una nota. */
export const MAX_ITEMS = 40;
/** Una pregunta con una opción no es una pregunta; con cinco es un formulario. */
export const QUESTION_MIN_OPTIONS = 2;
export const QUESTION_MAX_OPTIONS = 4;
/** A cuántos atletas se puede publicar de una vez. */
export const MAX_PUBLISH_RECIPIENTS = 100;

// ---------------------------------------------------------------------------
// Esquemas de escritura (server-side en TODA mutación)
// ---------------------------------------------------------------------------

const trimmedTitle = z.string().trim().min(1).max(MAX_TITLE_CHARS);
const trimmedBody = z.string().trim().min(1).max(MAX_BODY_CHARS);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato YYYY-MM-DD');
const isoDateTime = z.string().datetime({ offset: true });

/** El ancla y su referencia viajan juntas: `general` no apunta a nada. */
const anchorFields = {
  anchor_kind: z.enum(COMMUNICATION_ANCHORS).default('general'),
  anchor_ref: z.string().trim().min(1).max(MAX_ANCHOR_REF_CHARS).nullish(),
};

const commonFields = {
  ...anchorFields,
  title: trimmedTitle,
  is_template: z.boolean().default(false),
  expires_at: isoDateTime.nullish(),
};

/**
 * Un paso de protocolo: marca temporal opcional, contenido, y si lleva casilla.
 *
 * `checkable` es la corrección de Alex del 9-ago: NADA SE OBLIGA. Lo marcable es
 * del PASO y no del tipo, porque lo que un entrenador escribe el día antes de
 * una carrera (cuándo calentar, cuánta agua, cómo comer) es texto para leer, y
 * ponerle una casilla no mide si comió: mide si tocó un círculo.
 */
const protocolStep = z.object({
  label: z.string().trim().min(1).max(MAX_ITEM_LABEL_CHARS).nullish(),
  content: z.string().trim().min(1).max(MAX_ITEM_CONTENT_CHARS),
  checkable: z.boolean().default(true),
});

/** Una opción de pregunta: el texto y qué pasa si la eliges. */
const optionItem = z.object({
  content: z.string().trim().min(1).max(MAX_ITEM_CONTENT_CHARS),
  consequence: z.string().trim().min(1).max(MAX_ITEM_CONSEQUENCE_CHARS).nullish(),
});

/** Una sección de nota SIEMPRE lleva cabecera: sin ella no es una sección. */
const noteSection = z.object({
  label: z.string().trim().min(1).max(MAX_ITEM_LABEL_CHARS),
  content: z.string().trim().min(1).max(MAX_ITEM_CONTENT_CHARS),
});

const communicationShape = z.discriminatedUnion('kind', [
  // Un protocolo es lo que el coach quiere que pase antes de algo: unos pasos
  // que se marcan, un texto que se lee, o las dos cosas. Nada se obliga.
  z.object({
    ...commonFields,
    kind: z.literal('protocol'),
    body: z.string().trim().max(MAX_BODY_CHARS).nullish(),
    final_note: z.string().trim().min(1).max(MAX_FINAL_NOTE_CHARS).nullish(),
    items: z.array(protocolStep).max(MAX_ITEMS).default([]),
  }),
  // Una pregunta son sus opciones, y el contexto de por qué se pregunta.
  z.object({
    ...commonFields,
    kind: z.literal('question'),
    body: trimmedBody,
    blocks: z.boolean().default(false),
    items: z.array(optionItem).min(QUESTION_MIN_OPTIONS).max(QUESTION_MAX_OPTIONS),
  }),
  // Una tarea sin fecha es un recado: la fecha es obligatoria.
  z.object({
    ...commonFields,
    kind: z.literal('task'),
    body: z.string().trim().max(MAX_BODY_CHARS).nullish(),
    due_date: isoDate,
  }),
  // Una nota son sus secciones.
  z.object({
    ...commonFields,
    kind: z.literal('note'),
    body: z.string().trim().max(MAX_BODY_CHARS).nullish(),
    items: z.array(noteSection).min(1).max(MAX_ITEMS),
  }),
  // Un foco es una línea que no se te puede olvidar, y su porqué.
  z.object({
    ...commonFields,
    kind: z.literal('focus'),
    body: trimmedBody,
  }),
]);

/**
 * Lo único que un protocolo NO puede ser es estar vacío.
 *
 * Desde que el check es del paso, «tiene pasos» dejó de ser la prueba de que un
 * protocolo dice algo: uno de día de carrera puede ser tres líneas de lectura, y
 * otro puede ser sólo el texto de entrada. Lo que se exige es que haya ALGO que
 * leer — pasos o cuerpo. Los otros cuatro tipos ya cierran su forma en su propio
 * objeto (una pregunta con sus opciones, una tarea con su fecha).
 */
export const createCommunicationSchema = communicationShape.superRefine((value, ctx) => {
  if (value.kind !== 'protocol') return;
  if (value.items.length > 0) return;
  if (value.body != null && value.body.trim().length > 0) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['items'],
    message: 'Escribe al menos un paso, o una línea de texto que leer.',
  });
});

export type CreateCommunicationInput = z.infer<typeof createCommunicationSchema>;

/**
 * La edición reenvía el comunicado ENTERO (mismo tipo incluido): un comunicado
 * es una forma cerrada por tipo, y un `patch` campo a campo dejaría estados
 * imposibles (una pregunta con una sola opción a medio guardar). Solo se admite
 * sobre borradores y plantillas — lo publicado ya lo leyó alguien.
 */
export const updateCommunicationSchema = createCommunicationSchema;
export type UpdateCommunicationInput = CreateCommunicationInput;

export const publishCommunicationSchema = z.object({
  athlete_ids: z
    .array(z.number().int().positive())
    .min(1)
    .max(MAX_PUBLISH_RECIPIENTS)
    // Publicar dos veces al mismo atleta es un destinatario, no dos.
    .transform((ids) => Array.from(new Set(ids))),
});
export type PublishCommunicationInput = z.infer<typeof publishCommunicationSchema>;

export const answerCommunicationSchema = z.object({
  item_id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
});

export const markCommunicationItemSchema = z.object({
  item_id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  done: z.boolean(),
});

// ---------------------------------------------------------------------------
// El contrato de lectura (snake_case — convención Swift Codable)
// ---------------------------------------------------------------------------

export interface CommunicationItemDTO {
  id: string;
  position: number;
  /** Marca temporal del paso o cabecera de sección. Null en las opciones. */
  label: string | null;
  content: string;
  /** Qué pasa si eliges esta opción. Solo en preguntas. */
  consequence: string | null;
  /**
   * ¿Lleva casilla? Solo significa algo en un paso de PROTOCOLO: una opción se
   * elige y una sección se lee, así que ahí llega `true` y nadie lo mira.
   */
  checkable: boolean;
}

/** Lo que ve el ATLETA: el comunicado más SU estado. */
export interface AthleteCommunicationDTO {
  id: string;
  kind: CommunicationKind;
  title: string;
  body: string | null;
  final_note: string | null;
  anchor_kind: CommunicationAnchor;
  anchor_ref: string | null;
  due_date: string | null;
  expires_at: string | null;
  blocks: boolean;
  published_at: string;
  coach_name: string | null;
  items: CommunicationItemDTO[];
  state: CommunicationState;
  seen_at: string | null;
  done_at: string | null;
  answered_item_id: string | null;
  answered_at: string | null;
  /** Los pasos que este atleta ya lleva marcados. */
  marked_item_ids: string[];
  /** ¿Sigue reclamándole algo? Lo calcula el servidor para que no haya dos verdades. */
  claims_attention: boolean;
}

/** El seguimiento agregado que ve el COACH en su lista. */
export interface CommunicationTracking {
  recipients: number;
  seen: number;
  done: number;
  answered: number;
}

/** El estado de UN atleta dentro de un comunicado, en el detalle del coach. */
export interface CommunicationRecipientDTO {
  athlete_id: string;
  athlete_full_name: string;
  state: CommunicationState;
  seen_at: string | null;
  done_at: string | null;
  answered_item_id: string | null;
  answered_at: string | null;
  marked_items: number;
}

/** Lo que ve el COACH: el comunicado, su estado editorial y su seguimiento. */
export interface CoachCommunicationDTO {
  id: string;
  kind: CommunicationKind;
  title: string;
  body: string | null;
  final_note: string | null;
  anchor_kind: CommunicationAnchor;
  anchor_ref: string | null;
  due_date: string | null;
  expires_at: string | null;
  blocks: boolean;
  is_template: boolean;
  status: CommunicationStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  items: CommunicationItemDTO[];
  tracking: CommunicationTracking;
}

export interface CoachCommunicationDetailDTO extends CoachCommunicationDTO {
  recipients: CommunicationRecipientDTO[];
}

/**
 * El estado de UN atleta dentro de UN comunicado, con el detalle por paso.
 *
 * Es lo que el coach mira desde la ficha de ese atleta: no le sirve saber que
 * "3 de 8 lo han hecho", le sirve saber qué hizo ESTE con lo que le mandó — y en
 * un protocolo, por qué paso se quedó.
 */
export interface CommunicationAthleteStateDTO {
  athlete_id: string;
  state: CommunicationState;
  seen_at: string | null;
  done_at: string | null;
  answered_item_id: string | null;
  answered_at: string | null;
  marked_item_ids: string[];
  /** ¿Le sigue reclamando algo? La misma regla que usa su bandeja. */
  claims_attention: boolean;
}

/** Un comunicado visto desde la ficha de un atleta concreto. */
export interface CoachAthleteCommunicationDTO extends CoachCommunicationDTO {
  athlete_state: CommunicationAthleteStateDTO;
}

// ---------------------------------------------------------------------------
// Mecanismo: el estado, lo que reclama, y el orden de la bandeja
// ---------------------------------------------------------------------------

/** El estado del atleta, derivado de sus sellos. Una sola verdad, aquí. */
export function communicationState(marks: {
  seen_at: string | null;
  done_at: string | null;
  answered_at: string | null;
}): CommunicationState {
  if (marks.answered_at) return 'answered';
  if (marks.done_at) return 'done';
  if (marks.seen_at) return 'seen';
  return 'published';
}

/**
 * Los pasos que de verdad se marcan. Un protocolo puede no tener ninguno (el
 * check es del paso, no del tipo), y entonces se lee y ya está: ni la barra de
 * avance ni el «hecho» derivado tienen nada que contar.
 */
export function checkableItems<T extends { checkable: boolean }>(items: T[]): T[] {
  return items.filter((i) => i.checkable);
}

/**
 * Lo que aún te reclama: sin ver, sin responder o sin hacer.
 *
 * Un protocolo o una nota ya vistos NO reclaman: leerlos ERA el acto pendiente
 * (un protocolo con casillas además se cierra solo al marcar la última, y uno
 * sin ninguna se cierra con haberlo leído). El foco no se cierra nunca, y por
 * eso tampoco reclama: si lo hiciera, la bandeja no podría estar en calma jamás.
 */
export function claimsAttention(kind: CommunicationKind, state: CommunicationState): boolean {
  if (state === 'published') return true;
  if (kind === 'question') return state !== 'answered';
  if (kind === 'task') return state !== 'done';
  return false;
}

/** La bandeja en calma: nada sin ver, nada sin responder, nada sin hacer. */
export function inboxIsClear(items: { kind: CommunicationKind; state: CommunicationState }[]) {
  return items.every((c) => !claimsAttention(c.kind, c.state));
}

/**
 * En qué cajón de la bandeja cae. Menor = más arriba.
 *
 * El orden no es una preferencia estética: es lo que decide qué ve el atleta con
 * el pulgar en la pantalla. Primero lo que BLOQUEA (una pregunta sin responder
 * deja el plan a medio cerrar), luego lo que VENCE, luego lo que aún no ha
 * abierto, y el foco por delante de lo ya resuelto porque justamente no se cierra
 * nunca — si cayera al fondo, dejaría de ser el foco.
 */
export const INBOX_BUCKET = {
  blockingQuestion: 0,
  openQuestion: 1,
  openTask: 2,
  unseen: 3,
  focus: 4,
  settled: 5,
} as const;

export function inboxBucket(c: {
  kind: CommunicationKind;
  state: CommunicationState;
  blocks: boolean;
}): number {
  if (c.kind === 'question' && c.state !== 'answered') {
    return c.blocks ? INBOX_BUCKET.blockingQuestion : INBOX_BUCKET.openQuestion;
  }
  if (c.kind === 'task' && c.state !== 'done') return INBOX_BUCKET.openTask;
  if (c.state === 'published') return INBOX_BUCKET.unseen;
  if (c.kind === 'focus') return INBOX_BUCKET.focus;
  return INBOX_BUCKET.settled;
}

type SortableCommunication = Pick<
  AthleteCommunicationDTO,
  'kind' | 'state' | 'blocks' | 'due_date' | 'published_at' | 'id'
>;

/**
 * El orden de la bandeja: por cajón, y dentro del cajón lo que antes vence
 * (tareas) o lo más reciente (todo lo demás). El id desempata para que dos
 * lecturas seguidas nunca devuelvan órdenes distintos.
 */
export function compareInboxCommunications(
  a: SortableCommunication,
  b: SortableCommunication,
): number {
  const bucket = inboxBucket(a) - inboxBucket(b);
  if (bucket !== 0) return bucket;

  if (a.kind === 'task' && b.kind === 'task' && a.due_date && b.due_date && a.due_date !== b.due_date) {
    return a.due_date < b.due_date ? -1 : 1;
  }

  if (a.published_at !== b.published_at) return a.published_at < b.published_at ? 1 : -1;
  return Number(b.id) - Number(a.id);
}

/** Ordena una bandeja completa sin mutar la entrada. */
export function sortInbox<T extends SortableCommunication>(items: T[]): T[] {
  return [...items].sort(compareInboxCommunications);
}
