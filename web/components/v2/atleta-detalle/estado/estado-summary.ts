import { readinessEvidence } from '@fahybrid/shared/domain/coach/readiness-evidence';
import { checkinFreshnessLabel } from '@/lib/dashboard/coach/checkin-presentation';
import type { FichaEstado } from '@/lib/dashboard/v2/atleta-detalle-types';

/** El cierre describe la evidencia disponible; los datos ausentes no son un OK. */
export function estadoSummary(estado: Pick<FichaEstado, 'readiness' | 'last_checkin' | 'injury'> | null, today: string): string {
  if (!estado) return 'No se ha podido cargar el estado.';
  const { injury, last_checkin: checkin, readiness } = estado;
  const injuryLine = injury
    ? `Lesión ${injury.status === 'en_recuperacion' ? 'en recuperación' : 'activa'}: ${injury.zone_label}`
    : 'Sin lesión activa';
  const checkinLine = checkin ? `${checkinFreshnessLabel(checkin)} · ${checkin.sub_score}/100` : 'Sin check-in';
  const readinessLine = readiness
    ? `Readiness ${readinessEvidence({ ...readiness, observed_on: readiness.observed_at, today })}`
    : 'Readiness sin datos';
  return [injuryLine, checkinLine, readinessLine].join(' · ');
}
