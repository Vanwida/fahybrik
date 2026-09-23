// Cómo se pinta un lead en el panel: el estado del embudo con los tonos del
// sistema (un lead nuevo NO es rojo ni urgente: es información) y la etiqueta
// de la siguiente acción con el vocabulario del panel.

import type { StatusTone } from '@/components/v2/ui';
import type { LeadStatusTone } from '@/lib/dashboard/coach/leads-status';

export const LEAD_TONE: Record<LeadStatusTone, StatusTone> = {
  accent: 'info',
  info: 'info',
  ok: 'ok',
  warn: 'warn',
  neutral: 'neutral',
};

/** El dominio aún dice «Dar de alta» para convertir un lead; en el panel es «Convertir en atleta». */
export function nextActionLabel(text: string): string {
  return text === 'Dar de alta' ? 'Convertir en atleta' : text;
}

export function leadName(l: { nombre: string | null; email: string }): string {
  return l.nombre?.trim() || l.email;
}
