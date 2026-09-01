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
import { SEGMENT_MODALITIES } from './segment-modality';
// La gráfica es de las ZONAS, no del comunicado: su contrato, sus topes y la
// aritmética de su ventana viven en `zone-chart` — igual que los del camino
// viven en `plan-path`. Aquí sólo se dice cómo se ESCRIBE dentro de una nota.
import {
  esLunesIso,
  GRAFICA_MAX_RANGES,
  GRAFICA_MAX_WEEKS,
  GRAFICA_MIN_WEEKS,
  MAX_RANGE_LABEL_CHARS,
  RANGE_TONES,
  rangoDentroDeVentana,
} from './zone-chart';
import {
  COMPARE_MAX_WEEKS,
  COMPARE_MIN_WEEKS,
  comparacionEnOrden,
} from './zone-compare';

// Este sigue siendo EL import del comunicado: los dos módulos de al lado se
// reexportan enteros y nadie tiene que saber que existen. Están partidos porque
// cada uno tiene un público distinto — el orden de la bandeja es lo único que
// corre en las DOS puntas, y el contrato de lectura es la cara que ven los tres
// clientes (iOS, el atleta en web, el dashboard).
export * from './coach-communications-inbox';
export * from './coach-communications-dto';

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

/**
 * Cómo se pinta una sección de NOTA. Son cinco porque un briefing real mezcla
 * cinco cosas que se leen en cinco momentos distintos, y metidas en el mismo
 * párrafo gris la del medio no se encuentra tres meses después:
 *
 *   texto    — la prosa: el porqué, lo que cambió
 *   cifra    — el número que el atleta viene a buscar, en grande y en mono
 *   reparto  — una PROPORCIÓN, que se lee de un vistazo en una barra
 *   camino   — por dónde va a pasar: NO se teclea, se resuelve con SU plan
 *   grafica  — su tiempo en zonas de un periodo, con los rangos que el coach
 *              marcó encima: tampoco se teclea, se resuelve con SUS datos
 *   comparativa — dos periodos de la misma longitud, enfrentados. La grafica
 *              enseña la FORMA de una serie; ésta, el SALDO de un antes contra
 *              un después. Misma materia prima, otra pregunta
 *
 * Es propiedad de la SECCIÓN y no de la nota (una nota las mezcla), y fuera de
 * una nota es inerte: un paso de protocolo y una opción de pregunta llevan
 * `texto` y nadie lo mira. Misma lección que `checkable` (migración 0162).
 *
 * NO hay un sexto TIPO de comunicado para el feedback: partiría el modelo en
 * «nota» y «nota con datos» y duplicaría bandeja, señales y seguimiento para
 * contar lo mismo. En la pantalla el botón dice «Dar feedback», que es lo que el
 * coach cree que está haciendo; que por debajo sea una nota es asunto nuestro.
 */
export const COMMUNICATION_DISPLAYS = [
  'texto',
  'cifra',
  'reparto',
  'camino',
  'grafica',
  'comparativa',
  'test_result',
] as const;
export type CommunicationDisplay = (typeof COMMUNICATION_DISPLAYS)[number];

/**
 * El camino sólo tiene sentido colgado del plan o de la semana: es la estructura
 * de las próximas semanas, y dibujarla dentro de una nota anclada a una sesión
 * suelta sería enseñar el mapa entero para hablar de una parada.
 */
export const CAMINO_ANCHORS: readonly CommunicationAnchor[] = ['plan', 'week'];

/**
 * La gráfica admite un ancla más que el camino: `general`. El camino habla del
 * plan y sin plan no es nada; la gráfica habla de lo que el atleta ha entrenado,
 * que sigue siendo cierto colgado de nada. Lo que no cabe es colgarla de una
 * sesión, un test, una carrera o un check-in: son un día, y esto son meses.
 */
export const GRAFICA_ANCHORS: readonly CommunicationAnchor[] = ['plan', 'week', 'general'];

/** La comparativa cuelga de lo mismo que la gráfica y por lo mismo: habla de
 *  meses de entreno, así que colgada de una sesión, un test, una carrera o un
 *  check-in estaría hablando de un día. */
export const COMPARATIVA_ANCHORS: readonly CommunicationAnchor[] = GRAFICA_ANCHORS;

/** Un informe de test habla de ESA ocurrencia: cuelga de Tus tests, del plan,
 *  de la semana o de nada. No de una sesión, una carrera o un check-in. */
export const TEST_RESULT_ANCHORS: readonly CommunicationAnchor[] = ['test', 'plan', 'week', 'general'];


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
/** Una cifra es una cifra: «1:15 a 1:18», «68 kg». Si no cabe aquí, es texto. */
export const MAX_FIGURE_CHARS = 40;
export const MAX_SEGMENT_LABEL_CHARS = 40;
/** Con uno no hay reparto que ver, y con más de seis la barra deja de leerse
 *  de un vistazo, que es lo único que un reparto sabe hacer mejor que una frase. */
export const REPARTO_MIN_SEGMENTS = 2;
export const REPARTO_MAX_SEGMENTS = 6;
/** Una pregunta con una opción no es una pregunta; con cinco es un formulario. */
export const QUESTION_MIN_OPTIONS = 2;
export const QUESTION_MAX_OPTIONS = 4;
/** A cuántos atletas se puede publicar de una vez. */
export const MAX_PUBLISH_RECIPIENTS = 100;

/**
 * Media hora de audio en un comunicado. Es un tope de cordura, no el que suele
 * morder: el grabador entrega WAV de 16 kHz mono (~2 MB/min) y el tope de bytes
 * del almacén (25 MB, el mismo del chat) corta antes, sobre los catorce minutos.
 */
export const MAX_AUDIO_SECONDS = 1800;

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

/**
 * La nota de voz, en CUALQUIERA de los cinco tipos y como mucho una. Van juntas
 * o no va ninguna (lo comprueba el refinamiento de abajo): una duración sin
 * audio no es nada, y un audio sin duración deja al reproductor sin poder
 * rotularse antes de descargar un solo byte.
 *
 * Que la URL sea de NUESTRO proxy —y no de cualquier sitio de internet— lo
 * comprueba el servidor, que es el único que sabe en qué dominio vive.
 */
const audioFields = {
  audio_url: z.string().url().max(1000).nullish(),
  audio_seconds: z.number().int().positive().max(MAX_AUDIO_SECONDS).nullish(),
};

const commonFields = {
  ...anchorFields,
  ...audioFields,
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

/** Un trozo de un reparto: cuánto pesa y cómo se llama. Cero peso no es un
 *  trozo, es una parte que no existe ocupando sitio en la barra. */
const repartoSegment = z.object({
  value_num: z.number().finite().positive(),
  label: z.string().trim().min(1).max(MAX_SEGMENT_LABEL_CHARS),
});

const isoMonday = isoDate.refine(esLunesIso, 'Una semana empieza en lunes.');

/** Una marca del coach sobre la gráfica: de qué semana a qué semana, cómo se
 *  llama y con qué tono. Ambas puntas inclusive — marcar una semana suelta es
 *  `week_start === week_end`, y es legítimo. */
const graficaRange = z.object({
  week_start: isoMonday,
  week_end: isoMonday,
  label: z.string().trim().min(1).max(MAX_RANGE_LABEL_CHARS),
  tone: z.enum(RANGE_TONES),
});

/**
 * Una sección de nota, por su FORMA. Cada forma dice qué es cada campo, y por eso
 * es una unión y no un objeto con todo opcional: un objeto laxo dejaría escribir
 * una cifra con segmentos, que no significa nada.
 *
 * `label` cambia de papel a propósito — igual que en la tabla, donde es la marca
 * de tiempo de un paso y la cabecera de una sección:
 *   · texto · reparto · camino → es la CABECERA, y es obligatoria (sin ella no
 *     es una sección, es un párrafo suelto)
 *   · cifra → es el PIE que va bajo el número («la banda se cierra con los tests
 *     de la semana 1»), y es opcional: una cifra sin matiz se sostiene sola. Ahí
 *     no hay cabecera porque el número ES el titular.
 *
 * `content` sólo existe donde se teclea: un reparto ES sus segmentos y un camino
 * ES el plan del atleta.
 */
const noteSectionShape = z.discriminatedUnion('display', [
  z.object({
    display: z.literal('texto'),
    label: z.string().trim().min(1).max(MAX_ITEM_LABEL_CHARS),
    content: z.string().trim().min(1).max(MAX_ITEM_CONTENT_CHARS),
  }),
  z.object({
    display: z.literal('cifra'),
    label: z.string().trim().min(1).max(MAX_ITEM_LABEL_CHARS).nullish(),
    content: z.string().trim().min(1).max(MAX_FIGURE_CHARS),
  }),
  z.object({
    display: z.literal('reparto'),
    label: z.string().trim().min(1).max(MAX_ITEM_LABEL_CHARS),
    segments: z.array(repartoSegment).min(REPARTO_MIN_SEGMENTS).max(REPARTO_MAX_SEGMENTS),
  }),
  z.object({
    display: z.literal('camino'),
    label: z.string().trim().min(1).max(MAX_ITEM_LABEL_CHARS),
  }),
  // La gráfica tampoco se teclea: lo que se guarda es la CONFIG (qué periodo,
  // qué filtro, qué rangos) y el servidor la dibuja con los segundos por zona de
  // ESE atleta al servirla. Si se guardaran las barras, la nota seguiría
  // contando los datos del día que se escribió aunque después llegara el entreno
  // que faltaba — que es el mismo fallo que `camino` vino a evitar.
  //
  // La ventana es ABSOLUTA (un lunes y un número de semanas) y no «los últimos
  // seis meses»: los rangos son fechas, así que una ventana que se moviera con
  // el reloj los dejaría fuera de su propia gráfica.
  z.object({
    display: z.literal('grafica'),
    label: z.string().trim().min(1).max(MAX_ITEM_LABEL_CHARS),
    week_start: isoMonday,
    weeks: z.number().int().min(GRAFICA_MIN_WEEKS).max(GRAFICA_MAX_WEEKS),
    // Null = todo el volumen. El filtro es por TRAMO, así que una sesión mixta
    // reparte sus minutos entre correr, fuerza y ergo.
    modality: z
      .enum(SEGMENT_MODALITIES)
      .nullish()
      .transform((v) => v ?? null),
    ranges: z.array(graficaRange).max(GRAFICA_MAX_RANGES).default([]),
  }),
  // La comparativa tampoco se teclea: son dos periodos y el servidor los suma
  // con los segundos por zona de ESE atleta al servirla.
  //
  // UN SOLO `weeks` PARA LOS DOS LADOS, y no es ahorro de campos: catorce semanas
  // le ganan a diez siempre, así que dos ventanas de distinta longitud harían que
  // el titular dijera que el calendario es más largo, no que el atleta entrenó
  // más. Que no se solapen se comprueba abajo, donde el error se puede colocar.
  z.object({
    display: z.literal('comparativa'),
    label: z.string().trim().min(1).max(MAX_ITEM_LABEL_CHARS),
    /** El ANTES. */
    a_start: isoMonday,
    /** El DESPUÉS. */
    b_start: isoMonday,
    weeks: z.number().int().min(COMPARE_MIN_WEEKS).max(COMPARE_MAX_WEEKS),
  }),
  // El informe de UNA ocurrencia. Se guarda el assignment; el servidor lo
  // resuelve al servir. Si se guardaran los cm, la nota contaría un fantasma.
  z.object({
    display: z.literal('test_result'),
    label: z.string().trim().min(1).max(MAX_ITEM_LABEL_CHARS),
    assignment_id: z.string().trim().regex(/^\d+$/),
  }),
]);

/**
 * La sección tal y como llega por el cable. Una sin `display` es una sección de
 * las de antes de la 0163 (y las que sigue mandando iOS): vale `texto`, que es
 * exactamente lo que era. Sin este relleno la unión rechazaría todo lo que ya
 * funciona, y una migración aditiva no puede romper a quien no se ha enterado.
 */
const noteSection = z.preprocess(
  (raw) =>
    raw !== null && typeof raw === 'object' && !('display' in raw) ? { ...raw, display: 'texto' } : raw,
  noteSectionShape,
);

/**
 * El enlace cruzado: el comunicado que le falta a éste para cerrarse. Uno, no
 * varios — un briefing que apuntara a cinco sitios ya no diría «esto es lo que
 * queda pendiente», sería un índice. Que sea del MISMO coach y no esté archivado
 * lo comprueba el servidor, que es donde se puede mirar la tabla.
 */
const linkedField = {
  linked_communication_id: z
    .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
    .nullish()
    .transform((v) => (v == null ? null : String(v))),
};

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
    ...linkedField,
    kind: z.literal('task'),
    body: z.string().trim().max(MAX_BODY_CHARS).nullish(),
    due_date: isoDate,
  }),
  // Una nota son sus secciones, cada una con su forma.
  z.object({
    ...commonFields,
    ...linkedField,
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
  // El audio va entero o no va. Vale para los cinco tipos, así que se comprueba
  // antes de repartir por tipo.
  if ((value.audio_url == null) !== (value.audio_seconds == null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['audio_url'],
      message: 'La nota de voz viaja con su duración, o no viaja.',
    });
  }

  if (value.kind === 'note') {
    // El camino se dibuja con el plan del atleta, así que la nota tiene que
    // estar colgada de él. Anclada a una sesión suelta enseñaría el mapa entero
    // para hablar de una parada — y el atleta lo leería como un plan nuevo.
    const camino = value.items.findIndex((s) => s.display === 'camino');
    if (camino >= 0 && !CAMINO_ANCHORS.includes(value.anchor_kind)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['items', camino, 'display'],
        message: 'El camino sólo se dibuja en una nota de su plan o de su semana.',
      });
    }

    value.items.forEach((seccion, i) => {
      if (seccion.display === 'comparativa') {
        if (!COMPARATIVA_ANCHORS.includes(value.anchor_kind)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', i, 'display'],
            message:
              'La comparativa cuelga de su plan, de esta semana o de nada: son meses, no un día.',
          });
        }
        // Ni una semana puede caer en los dos lados: se contaría dos veces y el
        // delta se comería a sí mismo. Se señala el arranque del DESPUÉS, que es
        // lo que el coach acaba de mover cuando esto pasa.
        if (!comparacionEnOrden(seccion)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', i, 'b_start'],
            message: 'Los dos periodos se pisan. El segundo empieza cuando termina el primero.',
          });
        }
        return;
      }
      if (seccion.display === 'test_result') {
        if (!TEST_RESULT_ANCHORS.includes(value.anchor_kind)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['items', i, 'display'],
            message: 'El informe del test cuelga de Tus tests, del plan, de la semana o de nada.',
          });
        }
        return;
      }
      if (seccion.display !== 'grafica') return;
      if (!GRAFICA_ANCHORS.includes(value.anchor_kind)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', i, 'display'],
          message: 'La gráfica cuelga de su plan, de esta semana o de nada: son meses, no un día.',
        });
      }
      // Un rango fuera de la ventana no se recorta ni se tira: se rechaza. Las
      // dos alternativas cambiarían en silencio lo que el coach marcó, y una
      // marca movida es peor que una marca que no se pudo guardar.
      seccion.ranges.forEach((rango, r) => {
        if (rangoDentroDeVentana(seccion, rango)) return;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', i, 'ranges', r, 'week_start'],
          message:
            rango.week_end < rango.week_start
              ? 'Esa marca acaba antes de empezar.'
              : 'Esa marca se sale del periodo que enseña la gráfica.',
        });
      });
    });
    return;
  }

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

