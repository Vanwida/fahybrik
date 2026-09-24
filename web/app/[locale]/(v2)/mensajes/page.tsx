// Mensajes — la bandeja del coach organizada por «Por responder» (plan §6).
// El servidor pinta la bandeja entera (cuatro consultas con dueño, sin roster);
// el contexto de un atleta se pide solo cuando se abre su hilo, y una búsqueda
// que llega en la URL la resuelve el cliente al montar.
//
//   ?hilo=<id de atleta>   abre ESE hilo (nunca otro)
//   ?filtro=todas|sin_leer|hechas   (por defecto «Por responder»)
//   ?q=…                   búsqueda en nombres y mensajes
//
// Si la carga falla, la pantalla sale igual con su error y «Reintentar».

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadMensajesInbox } from '@/lib/dashboard/v2/mensajes-data';
import { MENSAJES_FILTERS, type MensajesFilter, type MensajesInbox } from '@/lib/dashboard/v2/mensajes-types';
import { MensajesScreen } from '@/components/v2/mensajes/MensajesScreen';

export const dynamic = 'force-dynamic';

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function MensajesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const sp = await searchParams;
  const hilo = one(sp.hilo);
  const filtro = one(sp.filtro) as MensajesFilter | undefined;
  const q = (one(sp.q) ?? '').slice(0, 120);

  const initial: MensajesInbox | null = await loadMensajesInbox({ coach_id: session.coach_id }).catch(
    () => null,
  );

  return (
    <MensajesScreen
      initial={initial}
      initialHilo={hilo && /^\d{1,18}$/.test(hilo) ? hilo : null}
      initialFilter={filtro && MENSAJES_FILTERS.includes(filtro) ? filtro : 'por_responder'}
      initialQ={q}
    />
  );
}
