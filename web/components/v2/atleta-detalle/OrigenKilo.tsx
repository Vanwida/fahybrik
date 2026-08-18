'use client';

// La línea que dice de dónde sale un kilo. Se pinta junto al número, nunca en la
// cabecera de la tarjeta: cada levantamiento tiene su propio origen y su propia
// fecha, y una fecha de tarjeta acababa poniéndole a un peso muerto la fecha de
// la sentadilla — y a la FC máx, las dos.
//
// La lectura del origen es del dominio (shared/domain/strength → leerOrigen).
// Aquí solo se elige el formato de la fecha, que es lo único que cambia entre
// pantallas: un protocolo tiene fecha («12 ago», y se puede abrir); un número
// declarado solo tiene edad («hace 5 sem»).

import { Link } from '@/i18n/navigation';
import { leerOrigen, lineaOrigen, type KiloConOrigen } from '@fahybrid/shared/domain/strength';
import { formatFechaCorta } from '@/lib/dashboard/v2/ficha-resumen';
import { relativeDate } from './parts';
import { cn } from '@/lib/utils';

export interface KiloOrigenProps {
  max: (KiloConOrigen & { recorded_at: string }) | null | undefined;
  /** Para poder abrir la ocurrencia que produjo el número. */
  athleteId: string;
  className?: string;
}

/**
 * «del test · 12 ago» / «del alta · hace 5 sem» / «lo anotó el coach · hace 3 d».
 * Sin kilo no hay línea: la celda ya dice «sin registro» y repetirlo sobra.
 */
export function OrigenKilo({ max, athleteId, className }: KiloOrigenProps) {
  if (!max) return null;
  const lectura = leerOrigen(max);
  const cuando = lectura.medido
    ? formatFechaCorta(max.recorded_at.slice(0, 10))
    : relativeDate(max.recorded_at);

  const texto = lineaOrigen(lectura, cuando);
  const assignment_id = lectura.assignment_id;
  const base = cn('mt-1 block text-[11px] leading-tight text-[color:var(--v2-muted)]', className);

  // Con ocurrencia el origen es navegable: del kilo a la sesión que lo produjo, que
  // es justo el puente que faltaba entre la ficha y la lista de tests.
  return assignment_id ? (
    <Link
      href={`/atletas/${athleteId}?tab=plan&sesion=${assignment_id}`}
      className={cn(base, 'v2-focus hover:text-[color:var(--v2-fg)] hover:underline')}
    >
      {texto}
    </Link>
  ) : (
    <span className={base}>{texto}</span>
  );
}
