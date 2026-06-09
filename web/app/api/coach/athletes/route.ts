import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  fetchAthletesForCoach,
  type AthleteModality,
} from '@/lib/dashboard/athletes/list';
import {
  compAthleteInputSchema,
  createCompAthlete,
  CompAthleteError,
} from '@/lib/dashboard/coach/comp-athletes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_MODALITIES: ReadonlySet<AthleteModality> = new Set<AthleteModality>([
  'individual',
  'dobles',
  'pro_elite',
]);

function parseModalityParam(value: string | null): AthleteModality | null {
  if (!value) return null;
  if (value === 'all') return null;
  return VALID_MODALITIES.has(value as AthleteModality)
    ? (value as AthleteModality)
    : null;
}

export async function GET(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const url = new URL(req.url);
  const modality = parseModalityParam(url.searchParams.get('modality'));

  const athletes = await fetchAthletesForCoach({
    coach_id: session.coach_id,
    modality,
  });

  return jsonOk({
    athletes,
    modality_filter: modality,
  });
}

// POST — coach manually adds a comp (courtesy) athlete with full, free access.
export async function POST(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = compAthleteInputSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      'validation_error',
      'Datos inválidos: revisa nombre, email y modalidad.',
      400,
      parsed.error.flatten(),
    );
  }

  try {
    const athlete = await createCompAthlete({
      coach_id: session.coach_id,
      input: parsed.data,
    });
    return jsonOk({ athlete }, 201);
  } catch (err) {
    if (err instanceof CompAthleteError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message =
      err instanceof Error ? err.message : 'No se pudo añadir el atleta';
    return jsonError('internal_error', message, 500);
  }
}
