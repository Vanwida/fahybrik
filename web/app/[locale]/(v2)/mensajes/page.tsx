// v2 · MENSAJES — the 3-column coach chat. Server component: loads the real
// conversation list (threads) joined with per-athlete roster context, then hands
// it to the client <MensajesScreen> which owns selection, the live thread, send +
// poll. One failed loader degrades gracefully (empty list → EmptyState), never 500s.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadMensajesData } from '@/lib/dashboard/v2/mensajes-data';
import type { MensajesData } from '@/lib/dashboard/v2/mensajes-types';
import { MensajesScreen } from '@/components/v2/mensajes/MensajesScreen';

export const dynamic = 'force-dynamic';

export default async function V2MensajesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ hilo?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const data: MensajesData = await loadMensajesData({ coach_id: session.coach_id }).catch(
    () => ({ threads: [], unread_threads: 0 }),
  );

  // `?hilo=` es el deeplink de un aviso push: aterriza con ESA conversación
  // abierta. Un id que no sea del coach simplemente no casa con ningún hilo.
  const { hilo } = await searchParams;

  return (
    <MensajesScreen
      data={data}
      coach_name={session.full_name}
      initialThreadId={hilo && /^\d+$/.test(hilo) ? hilo : null}
    />
  );
}
