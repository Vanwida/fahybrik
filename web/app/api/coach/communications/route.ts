import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  COMMUNICATION_VIEWS,
  createCommunicationSchema,
  type CommunicationView,
} from '@fahybrid/shared/domain/coach-communications';
import {
  createCommunication,
  listCommunications,
  listCommunicationsForAthlete,
} from '@/lib/coach/communications';
import { communicationErrorResponse, parseId } from '@/lib/communications/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseView(request: Request): CommunicationView {
  const raw = new URL(request.url).searchParams.get('view');
  return (COMMUNICATION_VIEWS as readonly string[]).includes(raw ?? '')
    ? (raw as CommunicationView)
    : 'published';
}

// GET /api/coach/communications
//
// Dos lecturas, una puerta:
//   · ?athlete_id=NN  → lo comunicado a ESE atleta con SU estado (visto, hecho,
//     respondido y los pasos que lleva marcados). Es lo que pinta su ficha, que
//     es donde vive el seguimiento — no hay pestaña global (docs/DECISIONS.md
//     2026-08-09, corrección de Alex).
//   · ?view=published|templates|drafts → la lista del coach con el agregado de
//     seguimiento, para la biblioteca de plantillas y lo que tiene a medias.
export async function GET(request: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const rawAthleteId = new URL(request.url).searchParams.get('athlete_id');
  if (rawAthleteId !== null) {
    const athlete_id = parseId(rawAthleteId);
    if (!athlete_id) return jsonError('bad_request', 'Id de atleta inválido', 400);
    try {
      return jsonOk({
        athlete_id,
        communications: await listCommunicationsForAthlete({
          coach_id: session.coach_id,
          athlete_id: Number(athlete_id),
        }),
      });
    } catch (err) {
      return communicationErrorResponse(err, '[GET /api/coach/communications?athlete_id]');
    }
  }

  const view = parseView(request);
  const communications = await listCommunications({ coach_id: session.coach_id, view });
  return jsonOk({ view, communications });
}

// POST /api/coach/communications — nace como borrador o como plantilla; publicar
// es un acto aparte (POST .../[id]/publish) porque es el que llega al atleta.
export async function POST(request: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = createCommunicationSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Comunicado inválido', 422, parsed.error.flatten());
  }

  try {
    const created = await createCommunication({
      coach_id: session.coach_id,
      input: parsed.data,
    });
    return jsonOk(created, 201);
  } catch (err) {
    return communicationErrorResponse(err, '[POST /api/coach/communications]');
  }
}
