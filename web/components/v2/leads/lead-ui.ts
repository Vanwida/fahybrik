// Cómo se pinta un lead en el panel: el estado del embudo con los tonos del
// sistema (un lead nuevo NO es rojo ni urgente: es información). La etiqueta de
// la siguiente acción ya sale del dominio con el vocabulario del panel.

import type { StatusTone } from '@/components/v2/ui';
import type { LeadStatusTone } from '@/lib/dashboard/coach/leads-status';

export const LEAD_TONE: Record<LeadStatusTone, StatusTone> = {
  accent: 'info',
  info: 'info',
  ok: 'ok',
  warn: 'warn',
  neutral: 'neutral',
};

export function leadName(l: { nombre: string | null; email: string }): string {
  return l.nombre?.trim() || l.email;
}
