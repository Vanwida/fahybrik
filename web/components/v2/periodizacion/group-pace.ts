// Un grupo no es una promoción: cada miembro puede ir por una semana distinta
// del mismo programa (quien entró más tarde, quien repitió…). La página lo dice
// en claro, y dice por dónde va cada uno.

import type { GroupMember } from '@fahybrid/shared/schema/groups';
import { shortDate } from '@fahybrid/shared/domain/coach/athlete-state';

/** Una línea: ¿van juntos o cada uno por su semana? null si no hay nadie en marcha. */
export function groupPaceLine(members: GroupMember[]): string | null {
  const running = members.filter((m) => m.program && m.week != null);
  if (running.length === 0) return null;
  const spots = new Set(running.map((m) => `${m.program!.id}:${m.week}`));
  if (spots.size === 1) {
    const m = running[0]!;
    return running.length === 1 ? null : `van juntos: semana ${m.week} de «${m.program!.name}»`;
  }
  return 'cada atleta sigue en su semana';
}

/** Dónde está un miembro de su plan, en una línea («semana 2 de 4», «empieza 28 sept», «empezó 21 sept»). */
export function memberSpot(m: GroupMember, today: string): string {
  if (!m.program) return 'Sin programa';
  if (m.week != null) return `${m.program.name} · semana ${m.week} de ${m.program.weeks}`;
  if (m.program_start) {
    return m.program_start > today
      ? `${m.program.name} · empieza ${shortDate(m.program_start)}`
      : `${m.program.name} · empezó ${shortDate(m.program_start)}`;
  }
  return m.program.name;
}
