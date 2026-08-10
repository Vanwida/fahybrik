// Publicar y avisar: las cuatro que cierran el ciclo mirar → tocar → publicar →
// avisar.
//
// Las tres de `tools-write.ts` cambian lo que está escrito; estas cuatro cambian lo
// que el atleta SABE. Es otra clase de acto, y por eso la lectura de vuelta pesa más
// aquí que en ningún otro sitio: publicar una semana la pone en su móvil al momento,
// un comunicado publicado ya no se edita (se archiva), un mensaje ya está leído y una
// nota interna NO la ve él — y esa última frase hay que decirla, porque es lo único
// que separa «apúntame que le molesta el aductor» de contárselo a él.
//
// LAS CUATRO PASAN POR EL CAMINO DEL PANEL, EFECTOS INCLUIDOS. El aviso al atleta no
// es un extra que monte el conector: vive DENTRO de la lib que publica
// (`publishWeek`/`publishBlock` disparan `plan_published`; `publishCommunication`
// dispara `coach_communication` al cerrar su transacción; `sendMessage` avisa al otro
// lado y publica al canal en vivo). Ninguna de las rutas del panel añade nada por
// encima, así que aquí no hay nada que replicar — y por eso tampoco hay nada que se
// pueda olvidar.
//
// AUDITORÍA: LA MISMA QUE EL PANEL, NI MÁS NI MENOS. Ninguno de estos cuatro caminos
// estampa `audit_log` en el panel (lo comprobado: `recordAudit` solo vive en ciclo de
// vida del atleta, informes de sesión y embudo), y aquí tampoco. No es un olvido, es
// consistencia: auditar por MCP lo que el panel no audita produciría un historial en
// el que solo aparece el conector, y de ahí se leería que el coach «solo toca desde
// el chat». Lo que sí queda registrado es lo que el propio dominio registra:
// `weekly_plans.approved_by` (quién publicó la semana), `coach_communications` con su
// `published_at` y sus destinatarios, el mensaje de chat —que ES su propio registro—
// y la nota firmada por su coach. Las tres escrituras del día SÍ auditan porque el
// panel también las audita a través de las columnas de autoría de la instancia.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createCommunicationSchema,
  publishCommunicationSchema,
  type CoachCommunicationDetailDTO,
  type CreateCommunicationInput,
} from '@fahybrid/shared/domain/coach-communications';
import { NoteCreateSchema } from '@/lib/coach/deep-dive-types';
import { CHAT_BODY_MAX } from '@/lib/chat/schema';
import { getOrCreateThread, sendMessage } from '@/lib/chat/service';
import { appendNote } from '@/lib/coach/athlete-deep-dive';
import { createCommunication, deleteCommunication } from '@/lib/coach/communications';
import { publishCommunication } from '@/lib/coach/communications-publish';
import { CommunicationError } from '@/lib/communications/store';
import { PublishWeekError, publishBlock, publishWeek } from '@/lib/coach/publish-week';
import { RATE_LIMITS, withRateLimit } from '@/lib/security/rate-limit';
import {
  NO_SUCH_ATHLETE_MESSAGE,
  athleteIdArg,
  fail,
  isoDateArg,
  ok,
  resolveOwnedAthlete,
  resolveOwnedAthletes,
  withCoach,
} from './runtime';
import { weekStartOf, weekStates } from './shape-write';
import {
  anchoredAvisos,
  communicationResumen,
  messageResumen,
  noteResumen,
  publishAvisos,
  publishResumen,
  publishedCommunication,
  publishedWeeks,
  weekSessionCounts,
} from './shape-publish';

/**
 * Tope de semanas por llamada. Un bloque real de microciclos no pasa de unos meses;
 * el tope está para que un asistente en bucle no marque medio calendario del atleta
 * de una frase.
 */
const MAX_WEEKS = 26;

export function registerPublishTools(server: McpServer): void {
  // ── publish_week ───────────────────────────────────────────────────────────
  server.registerTool(
    'publish_week',
    {
      title: 'Publicar una semana al atleta',
      description:
        'Publica una semana del plan (o varias de golpe) para que el atleta la vea en su app, y le manda el aviso. Úsalo cuando el coach diga «pásasela», «publícale la semana» o «suéltale el bloque». Ojo: una semana que NO esté marcada como borrador el atleta YA la ve, así que consulta primero get_plan si no sabes en qué estado está. Si ya estaba publicada te lo dice y no pasa nada. Publicar no cambia el contenido: solo quién lo ve.',
      inputSchema: {
        athlete_id: athleteIdArg,
        week_start: isoDateArg
          .optional()
          .describe(
            'La semana que se publica, por cualquier día de ella (AAAA-MM-DD): se ancla sola a su lunes.',
          ),
        week_starts: z
          .array(isoDateArg)
          .min(1)
          .max(MAX_WEEKS)
          .optional()
          .describe(
            'Varias semanas de una vez (un bloque entero), un día por semana. El atleta recibe UN solo aviso, no uno por semana.',
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id) => {
        const athlete = await resolveOwnedAthlete({ coach_id, athlete_id: args.athlete_id });
        if (!athlete) return fail(NO_SUCH_ATHLETE_MESSAGE);

        const asked = args.week_starts ?? (args.week_start ? [args.week_start] : []);
        if (asked.length === 0) {
          return fail(
            'Dime qué semana publicar: week_start (una) o week_starts (varias), en AAAA-MM-DD. ' +
              'Vale cualquier día de la semana, se ancla a su lunes.',
          );
        }

        // La clave de `weekly_plans` es el LUNES. Un miércoles escribiría una fila
        // que nadie lee —ni el móvil ni el cron— y la respuesta diría «publicado»
        // sobre algo invisible, así que se ancla antes de tocar nada.
        const weeks = [...new Set(asked.map(weekStartOf))].sort();

        // Cómo estaba cada semana ANTES: es lo único que permite decir «esta ya
        // estaba publicada» en vez de dar por nuevo lo que no ha cambiado.
        const [before, sessions] = await Promise.all([
          weekStates({ athlete_id: args.athlete_id, week_starts: weeks }),
          weekSessionCounts({ athlete_id: args.athlete_id, week_starts: weeks }),
        ]);

        let notified = false;
        try {
          // Una semana → `publishWeek`; varias → `publishBlock`, que las pone todas
          // y manda UN aviso anclado a la primera. Es la misma bifurcación que hace
          // la ruta del panel, y por el mismo motivo: N avisos por un bloque serían
          // N notificaciones en el móvil para un solo acto del coach.
          const result =
            weeks.length === 1
              ? await publishWeek({
                  coach_id,
                  athlete_id: args.athlete_id,
                  week_start: weeks[0]!,
                })
              : await publishBlock({
                  coach_id,
                  athlete_id: args.athlete_id,
                  week_starts: weeks,
                });
          notified = result.notified;
        } catch (err) {
          if (err instanceof PublishWeekError) {
            return fail(err.code === 'not_found' ? NO_SUCH_ATHLETE_MESSAGE : err.message);
          }
          throw err;
        }

        const published = publishedWeeks({ week_starts: weeks, before, sessions });
        return ok(
          {
            athlete_id: String(args.athlete_id),
            athlete_name: athlete.full_name,
            weeks: published,
            /** ¿Le ha entrado el aviso al móvil? La publicación vale igual sin él. */
            aviso_enviado: notified,
            avisos: [...anchoredAvisos(asked), ...publishAvisos(published)],
          },
          publishResumen({ athlete_name: athlete.full_name, weeks: published, notified }),
        );
      }),
  );

  // ── publish_communication ──────────────────────────────────────────────────
  server.registerTool(
    'publish_communication',
    {
      title: 'Publicar un comunicado',
      description:
        'Le publica un comunicado a uno o varios atletas y les manda el aviso: un PROTOCOLO (pasos que seguir, marcables o solo de lectura), una PREGUNTA (con sus opciones y qué implica cada una), una TAREA (con fecha límite), una NOTA (secciones: texto, una cifra, un reparto) o un FOCO (una línea que no se le olvide). Cada tipo pide una cosa distinta del atleta, así que elige por lo que quieres que HAGA él, no por el texto. `anchor_kind` decide en qué pantalla le sale. Es todo o nada: si un atleta no es del club, no se publica a ninguno. Un comunicado publicado ya no se edita, solo se archiva.',
      inputSchema: {
        athlete_ids: publishCommunicationSchema.shape.athlete_ids.describe(
          'A quién le llega, con los athlete_id de list_athletes. Todos tienen que ser tuyos.',
        ),
        communication: createCommunicationSchema.describe(
          'El comunicado, tipado por su `kind`. Cada tipo tiene su forma cerrada: el protocolo lleva pasos y/o cuerpo, la pregunta entre 2 y 4 opciones, la tarea su due_date, la nota sus secciones, el foco su cuerpo.',
        ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id) => {
        const input = args.communication as CreateCommunicationInput;

        // Una plantilla es un molde y no se publica (`publishCommunication` lo
        // rechaza con un 409). Se dice ANTES de escribir nada, en vez de dejar un
        // borrador huérfano para que lo entienda el coach.
        if (input.is_template) {
          return fail(
            'Esto publica, y una plantilla es un molde: no se le manda a nadie. ' +
              'Quita is_template para publicárselo, o crea la plantilla desde el panel.',
          );
        }

        // El roster se comprueba AQUÍ, antes de crear, aunque la publicación lo
        // vuelva a comprobar dentro de su transacción: así el rechazo puede decir
        // QUÉ id sobra, y de la misma consulta salen los nombres del read-back.
        const owned = await resolveOwnedAthletes({ coach_id, athlete_ids: args.athlete_ids });
        if ('missing' in owned) {
          return fail(
            `Estos atletas no son tuyos o no existen: ${owned.missing.join(', ')}. ` +
              'Publicar es todo o nada, así que no he publicado nada. ' +
              'Pide la lista con list_athletes y usa los athlete_id que salgan ahí.',
          );
        }
        const athlete_ids = owned.athletes.map((a) => Number(a.athlete_id));

        let created: CoachCommunicationDetailDTO;
        try {
          created = await createCommunication({ coach_id, input });
        } catch (err) {
          if (err instanceof CommunicationError) return fail(`No lo he creado: ${err.message}`);
          throw err;
        }

        let result: Awaited<ReturnType<typeof publishCommunication>>;
        try {
          result = await publishCommunication({ coach_id, id: created.id, athlete_ids });
        } catch (err) {
          // Nace borrador y muere borrador: si la publicación se cae, lo que acabamos
          // de crear no lo ha visto nadie, así que se borra en vez de quedarse en la
          // lista de borradores del coach como resto de una frase que falló.
          await deleteCommunication({ coach_id, id: created.id }).catch(() => undefined);
          if (err instanceof CommunicationError) {
            return fail(`No he publicado nada: ${err.message}`);
          }
          throw err;
        }

        const pub = publishedCommunication({
          communication: created,
          athletes: owned.athletes,
          recipients_total: result.recipients,
          new_recipients: result.new_recipients,
          published_at: result.published_at,
        });
        return ok({ communication: pub }, communicationResumen(pub));
      }),
  );

  // ── send_message ───────────────────────────────────────────────────────────
  server.registerTool(
    'send_message',
    {
      title: 'Mandarle un mensaje al atleta',
      description:
        'Le manda un mensaje de chat al atleta, en el mismo hilo 1:1 que él ve en su app, y le llega el aviso al móvil. Para hablar: avisar de un cambio, quedar, contestarle. Lo que tiene forma y seguimiento (unos pasos, una pregunta con opciones, una tarea con fecha) va por publish_communication, no por aquí — un mensaje no se puede marcar como hecho.',
      inputSchema: {
        athlete_id: athleteIdArg,
        body: z
          .string()
          .trim()
          .min(1, 'El mensaje no puede estar vacío')
          .max(CHAT_BODY_MAX)
          .describe('El mensaje, tal y como lo va a leer el atleta.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id, _coach_name, session) => {
        // El MISMO cubo que la caja de texto del panel y que el móvil: mismo
        // `scope`, mismo identificador y mismo perfil, porque es la misma persona
        // escribiendo en el mismo hilo. Un cubo aparte para el conector le
        // regalaría al coach un segundo cupo de mensajes por cambiar de ventana.
        const rl = await withRateLimit({
          scope: 'user',
          identifier: session.user_id.toString(),
          ...RATE_LIMITS.chatSend,
        });
        if (!rl.allowed) {
          return fail(
            `Has mandado muchos mensajes en muy poco tiempo. Espera ${rl.retryAfter} segundos y vuelve a intentarlo. ` +
              'No he mandado este.',
          );
        }

        const athlete = await resolveOwnedAthlete({ coach_id, athlete_id: args.athlete_id });
        if (!athlete) return fail(NO_SUCH_ATHLETE_MESSAGE);

        const { thread_id } = await getOrCreateThread({ coach_id, athlete_id: args.athlete_id });
        const message = await sendMessage({
          thread_id,
          sender_user_id: session.user_id,
          sender_role: 'coach',
          input: { body: args.body },
        });

        return ok(
          {
            message_id: message.id,
            thread_id,
            athlete_id: String(args.athlete_id),
            athlete_name: athlete.full_name,
            sent_at: message.created_at,
            body: message.body,
          },
          messageResumen({ athlete_name: athlete.full_name, body: args.body }),
        );
      }),
  );

  // ── add_note ───────────────────────────────────────────────────────────────
  server.registerTool(
    'add_note',
    {
      title: 'Apuntar una nota en la ficha',
      description:
        'Apunta una nota INTERNA en la ficha del atleta: es del coach y solo la ve él en el panel y en el asistente — el atleta NO la lee nunca. Es para lo que se observa y no se le dice («le molesta el aductor al patinar», «viene justo de sueño esta semana»). Si es una molestia que hay que seguir de verdad, eso es una lesión y se registra en su ficha, no aquí. Si quieres que lo lea él, usa send_message.',
      inputSchema: {
        athlete_id: athleteIdArg,
        body: NoteCreateSchema.shape.body.describe(
          'La nota, tal cual la diría el coach. Solo para sus ojos.',
        ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (args, extra) =>
      withCoach(extra.authInfo, async (coach_id) => {
        const athlete = await resolveOwnedAthlete({ coach_id, athlete_id: args.athlete_id });
        if (!athlete) return fail(NO_SUCH_ATHLETE_MESSAGE);

        const note = await appendNote({
          athlete_id: String(args.athlete_id),
          coach_id,
          body: args.body,
        });

        return ok(
          {
            note_id: note.id,
            athlete_id: String(args.athlete_id),
            athlete_name: athlete.full_name,
            created_at: note.created_at_iso,
            date_label: note.date_label,
            body: note.body,
            /** Explícito a propósito: es lo único que separa esto de un mensaje. */
            visible_para_el_atleta: false,
          },
          noteResumen({
            athlete_name: athlete.full_name,
            date_label: note.date_label,
            body: note.body,
          }),
        );
      }),
  );
}
