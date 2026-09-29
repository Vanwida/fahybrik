import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getAthleteReadinessToday } from '@/lib/coach/athlete-daily-readiness';
import { openInjuries } from '@/lib/injuries/injuries';
import { sql } from '@/lib/db';
import { INJURY_ZONE_LABEL } from '@fahybrid/shared/domain/coach/injury-taxonomy';
import { readinessBandOf } from '@fahybrid/shared/domain/coach/signal-thresholds';
import { loadCoachThresholdsForAthlete } from '@fahybrid/shared/domain/coach/signal-thresholds-db';
import { readinessVigente } from '@fahybrid/shared/domain/analytics/recuperacion-panel';
import { loadAthleteLocalDay } from '@fahybrid/shared/domain/db/athlete-timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  // getAthleteReadinessToday resolves "today" as the calendar day in the ATHLETE's
  // own timezone (athletes.timezone, fallback Europe/Madrid) — so last night's
  // sleep and the early-morning resting-HR sample land on the right day. It returns
  // the SAME most-recent snapshot ≤ today the Inicio card shows, plus a 7-day score
  // trend and enriched raw breakdown values for the detail sheet; when there is no
  // real signal at all it returns null, forwarded as `readiness: null` so the app
  // shows the honest "Sin datos" empty state.
  const snapshot = await getAthleteReadinessToday({
    athlete_id: auth.athlete_id,
    on_date: new Date(),
  });

  // #16 — CONTEXTUALIZE, don't deduct. The check-in `soreness` (a 0.35-weight
  // component of the score) ALREADY reflects the pain the athlete reports, so an
  // active injury adds NO separate penalty to `readiness` (that would double-count
  // the same pain). It only ships an informational context row (the injured zone)
  // that the app annotates onto the readiness breakdown.
  const open = await openInjuries(auth.athlete_id);
  const injury_context = open.map((i) => ({
    zone: i.zone,
    zone_label: INJURY_ZONE_LABEL[i.zone],
    status: i.status,
  }));

  // P14 — LAS BANDAS SON DEL COACH, y las sirve el servidor. Estaban escritas en
  // Swift (67/45 en la tarjeta, 80/50 y 70/45 en el detalle): un coach con otras
  // bandas veía su método en la web y el nuestro en el teléfono del atleta.
  // Aditivo: la app instalada ignora estas claves; la que las lea pinta `band`
  // (null = no hay lectura, o es más vieja de lo que el coach da por buena).
  const thresholds = await loadCoachThresholdsForAthlete(sql, auth.athlete_id);
  const bands = {
    ok_min: thresholds.readiness_ok_min,
    caution_min: thresholds.readiness_caution_min,
    max_age_days: thresholds.readiness_max_age_days,
  };
  const today = snapshot ? await loadAthleteLocalDay({ athlete_id: auth.athlete_id, client: sql }) : null;
  const band =
    snapshot && today != null && readinessVigente(snapshot.recorded_for, today, { ok_min: bands.ok_min, cautela_min: bands.caution_min, max_edad_dias: bands.max_age_days })
      ? readinessBandOf(snapshot.score, thresholds)
      : null;

  return jsonOk({ readiness: snapshot, injury_context, bands, band });
}
