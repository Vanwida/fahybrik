// Las cifras de la barra lateral del panel — baratas, con dueño y en paralelo.
//
// El layout del panel corre en CADA navegación, así que aquí no se carga nada que no sea
// un `count(*)` con índice: antes se traía la lista entera de hilos solo para contarla y
// dos contadores de Negocio sin `coach_id` (los leads y las llamadas de todos los clubes).
// Cada cifra falla sola a 0 — una fuente caída nunca tumba el panel.

import { sql } from '@/lib/db';
import { countNewLeads } from './leads';
import { countCallsToday } from '@/lib/citas/calls';

/**
 * Hilos «por responder» del coach: el último mensaje vivo lo escribió el atleta. Es la
 * definición de «Por responder» del vocabulario del panel (PLAN §2), no «sin leer»: un hilo
 * que el coach abrió y no contestó sigue esperándole. Un hilo sin mensajes no cuenta.
 */
export async function countThreadsAwaitingReply(coach_id: bigint | number): Promise<number> {
  const rows = await sql<{ n: number }[]>`
    select count(*)::int as n
    from chat_threads t
    join lateral (
      select m.sender_role
      from chat_messages m
      where m.thread_id = t.id and m.deleted_at is null
      order by m.created_at desc, m.id desc
      limit 1
    ) last on true
    where t.coach_id = ${Number(coach_id)}
      and last.sender_role = 'athlete'
  `;
  return rows[0]?.n ?? 0;
}

export interface ShellBadges {
  /** Hilos por responder (Mensajes). */
  awaiting_reply: number;
  /** Leads nuevos + llamadas que quedan hoy (Negocio). */
  negocio: number;
}

async function orZero(p: Promise<number>): Promise<number> {
  try {
    return await p;
  } catch {
    return 0;
  }
}

/** Las cifras de la barra lateral, las tres consultas a la vez. */
export async function loadShellBadges(coach_id: bigint | number): Promise<ShellBadges> {
  const [awaiting_reply, new_leads, calls_today] = await Promise.all([
    orZero(countThreadsAwaitingReply(coach_id)),
    orZero(countNewLeads(coach_id)),
    orZero(countCallsToday(coach_id)),
  ]);
  return { awaiting_reply, negocio: new_leads + calls_today };
}
