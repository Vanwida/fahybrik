import 'server-only';

// El portón de Negocio: el área existe solo para el coach con el add-on
// 'negocio' (coach_entitlements, lista blanca, sin fila = cerrado). Sin él, las
// rutas de Negocio mandan a Hoy — no hay una pantalla vacía que explicar.

import { redirect } from 'next/navigation';
import { hasEntitlement } from '@/lib/coach/entitlements';
import type { CoachSession } from '@/lib/auth/coach-session';

export async function canSeeNegocio(coach_id: bigint | number): Promise<boolean> {
  return hasEntitlement({ coach_id, feature: 'negocio' }).catch(() => false);
}

/** Corta la petición (redirect a Hoy) si el coach no tiene Negocio. */
export async function requireNegocio(session: CoachSession | null, locale: string): Promise<CoachSession> {
  if (!session || !(await canSeeNegocio(session.coach_id))) redirect(`/${locale}/hoy`);
  return session;
}
