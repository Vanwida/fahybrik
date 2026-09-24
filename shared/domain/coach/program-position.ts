// @fahybrid/shared/domain/coach/program-position — dónde está un atleta dentro
// de un programa y cuándo lo empieza. UNA regla para la página del grupo y el
// roster (y el vistazo), que antes decían cosas distintas del mismo atleta
// («empieza 21 sept» en el grupo, «empieza el 28 sept» en Atletas; «semana 1 de
// 3» en uno y «semana 2 de 4» en otro).
//
// El recibo (`athlete_month_assignments`) va del primer día que el atleta
// entrena el programa hasta el final del programa. Un atleta que entra en un
// grupo a mitad de programa recibe desde la semana del grupo: su recibo es más
// corto que el programa. Por eso:
//   - `athlete_start` = el primer día del recibo (lo que el atleta y el coach
//     llaman «empieza»);
//   - la semana 1 del programa cae `weeks` semanas antes del final del recibo,
//     y la semana en curso se cuenta desde ahí («semana 2 de 4»);
//   - `entered_week` = en qué semana del programa entró.
//
// Puro y sin base de datos.

import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '../dates';

export interface ProgramReceipt {
  /** YYYY-MM-DD, primer día del recibo. */
  start_date: string;
  /** YYYY-MM-DD, último día del recibo (= fin del programa). */
  end_date: string;
}

export interface ProgramPosition {
  /** Primer día que el atleta entrena este programa. */
  athlete_start: string;
  /** Último día del programa. */
  end: string;
  /** Semanas del programa (las suyas, no las del recibo). */
  weeks: number;
  /** Semana del programa en la que entró, 1-based. */
  entered_week: number;
  /** Semana en curso, 1-based, o null si hoy no está dentro del recibo. */
  week: number | null;
  /** Hoy ya ha empezado (o ya ha terminado): «empezó», no «empieza». */
  started: boolean;
  ended: boolean;
}

const WEEK_MS = 7 * 86_400_000;

function weeksBetween(fromIso: string, toIso: string): number {
  return Math.floor(
    (mondayOfWeek(parseIsoDate(toIso)).getTime() - mondayOfWeek(parseIsoDate(fromIso)).getTime()) / WEEK_MS,
  );
}

/** Semanas que cubre un recibo (por lunes). */
export function receiptWeeks(r: ProgramReceipt): number {
  return Math.max(1, weeksBetween(r.start_date, r.end_date) + 1);
}

/**
 * La posición de un atleta en un programa. `program_weeks` = las semanas del
 * programa (0 o desconocido → las del recibo, como si hubiera entrado en la 1).
 */
export function programPosition(r: ProgramReceipt, program_weeks: number, today: string): ProgramPosition {
  const own = receiptWeeks(r);
  const weeks = Math.max(own, program_weeks > 0 ? program_weeks : own);
  const entered_week = weeks - own + 1;
  const inside = today >= r.start_date && today <= r.end_date;
  // Semana 1 del programa = el lunes `entered_week − 1` semanas antes de su inicio.
  const week1 = isoDateString(addDays(mondayOfWeek(parseIsoDate(r.start_date)), -(entered_week - 1) * 7));
  const week = inside ? Math.min(weeks, Math.max(1, weeksBetween(week1, today) + 1)) : null;
  return {
    athlete_start: r.start_date,
    end: r.end_date,
    weeks,
    entered_week,
    week,
    started: today >= r.start_date,
    ended: today > r.end_date,
  };
}
