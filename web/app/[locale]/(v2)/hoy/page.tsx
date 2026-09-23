// /hoy — la casa del coach: UNA bandeja que tiende a cero (plan §6 «Hoy»,
// informe B §4). Grupos de causa compartida primero, luego una fila por atleta
// (crítico, vigilar), peor primero. Todo se resuelve, se pospone o se marca hecho
// desde aquí; la cifra de cabecera baja al actuar.
//
// Datos: la bandeja es `loadHoy` (vía `loadHoyForRequest`, la misma cuenta que la
// insignia de la barra lateral, calculada una vez por render) + lo de alrededor
// (`loadHoyExtras`: quiénes hay en cada grupo, lo resuelto hoy, la línea de
// actividad). Si la bandeja no carga, error con reintento (error.tsx); si cae lo
// de alrededor, la bandeja sigue sin ello.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadSetupChecklist } from '@/lib/coach/setup-checklist';
import { hasNegocioForRequest, loadHoyForRequest } from '@/components/v2/shell/shell-counts';
import { HoyInbox } from '@/components/v2/hoy/HoyInbox';
import { parseVista } from '@/components/v2/hoy/hoy-model';
import { longDateLabel } from '@/components/v2/hoy/hoy-format';
import { loadHoyExtras } from './_data/hoy-extras';

export const dynamic = 'force-dynamic';

export default async function HoyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;

  const session = await getCoachSession();
  if (!session) return null;
  const coach_id = Number(session.coach_id);

  const view = await loadHoyForRequest(coach_id);
  const groupIds = view.systemic.flatMap((g) => g.athlete_ids);
  const [extras, negocio] = await Promise.all([
    loadHoyExtras({ coach_id, athlete_ids: groupIds }),
    hasNegocioForRequest(coach_id),
  ]);

  // Primeros pasos: sin atletas, o con la bandeja vacía y la puesta en marcha a
  // medias (con filas que atender, basta el «Setup n/9» de la barra lateral).
  const inboxEmpty = view.counts.needs_you === 0;
  const setup =
    view.week_visibility.total === 0 || inboxEmpty
      ? await loadSetupChecklist(coach_id).catch(() => null)
      : null;

  return (
    <HoyInbox
      view={view}
      extras={extras}
      negocio={negocio}
      setup={setup && !setup.complete ? setup : null}
      noAthletes={view.week_visibility.total === 0}
      initialVista={parseVista(query.vista)}
      dateLabel={longDateLabel(new Date())}
    />
  );
}
