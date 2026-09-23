import 'server-only';

// Las cifras de la barra lateral que salen de la bandeja de Hoy, con la MISMA
// cuenta que pinta Hoy (una cifra, una fuente — nunca dos números que no casan):
//   Hoy     = `counts.needs_you` de loadHoy.
//   Negocio = leads nuevos + llamadas de hoy (loadShellBadges, con dueño) + pagos
//             vencidos (el grupo `payments_overdue` de Hoy).
//
// `loadHoyForRequest` va envuelto en `cache()`: si la página de Hoy lo pide con el
// mismo coach en el mismo render, se calcula una sola vez.
// Cada cifra cae sola a null (sin insignia) — nunca tumba el panel ni pinta un 0 falso.

import { cache } from 'react';
import { loadHoy, type HoyView } from '@/lib/dashboard/hoy/load-hoy';
import { hasEntitlement } from '@/lib/coach/entitlements';

export const loadHoyForRequest = cache((coach_id: number): Promise<HoyView> => loadHoy({ coach_id }));

export const hasNegocioForRequest = cache((coach_id: number): Promise<boolean> =>
  hasEntitlement({ coach_id, feature: 'negocio' }).catch(() => false),
);

export interface HoyShellCounts {
  needs_you: number | null;
  payments_overdue: number | null;
}

export async function loadHoyShellCounts(coach_id: number): Promise<HoyShellCounts> {
  try {
    const view = await loadHoyForRequest(coach_id);
    const overdue = view.systemic.find((g) => g.kind === 'payments_overdue')?.count ?? 0;
    return { needs_you: view.counts.needs_you, payments_overdue: overdue };
  } catch {
    return { needs_you: null, payments_overdue: null };
  }
}
