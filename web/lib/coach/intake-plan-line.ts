// Lo que el alta le da al atleta, en UNA línea (la pantalla del alta y el aviso
// de después): qué grupo, qué programa y semana, cuándo empieza y cuándo ve su
// primera semana. Puro, sin huso: días YYYY-MM-DD ya resueltos.
//
//   Entra en HYROX mañanas · Base, semana 2 · empieza lun 28 sept · semana visible el sáb 26
//   Base desde la semana 1 · empieza lun 28 sept · semana visible el sáb 26
//   Sigue en HYROX mañanas · Base, semana 1 de 4 · la del 28 sept se ve el sáb 26
//   Sin programa: lo escribes tú desde su plan

import { shortDate } from '@fahybrid/shared/domain/coach/athlete-state';
import { autoPublishDate } from '@fahybrid/shared/domain/coach/week-publishing';
import { parseIsoDate } from '@fahybrid/shared/domain/dates';
import type { IntakePlanKind } from '@fahybrid/shared/schema/coach-intake';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;

/** «lun 28 sept» */
export function dayLabel(iso: string): string {
  return `${DIAS[parseIsoDate(iso).getUTCDay()]} ${shortDate(iso)}`;
}

/** «sáb 26» si cae en el mismo mes que `ref`; si no, «sáb 26 sept». */
function dayLabelNear(iso: string, ref: string): string {
  if (iso.slice(0, 7) === ref.slice(0, 7)) return `${DIAS[parseIsoDate(iso).getUTCDay()]} ${Number(iso.slice(8, 10))}`;
  return dayLabel(iso);
}

/** Cuándo ve el atleta una semana que empieza `week_start`, con la regla de N días. */
export function visibleOn(week_start: string, auto_publish_days: number): string {
  return autoPublishDate(week_start, auto_publish_days);
}

export interface IntakePlanSummary {
  kind: IntakePlanKind;
  group_name: string | null;
  program_name: string | null;
  /** Semana del programa por la que entra (o en la que va, en `keep`). */
  week: number | null;
  /** Semanas del programa (solo `keep`: «semana 1 de 4»). */
  weeks: number | null;
  /** Lunes en que empieza (`group`/`program`), o lunes de la próxima semana que aún no ve (`keep`). */
  start_date: string | null;
  /** Día en que la ve. `null` = retenida por el coach (no se abre sola). */
  visible_on: string | null;
}

function visiblePart(s: IntakePlanSummary, today: string): string | null {
  if (!s.start_date) return null;
  if (s.visible_on == null) return 'retenida hasta que la publiques';
  if (s.visible_on <= today) return s.kind === 'keep' ? `la del ${shortDate(s.start_date)} ya la ve` : 'semana visible ya';
  const when = dayLabelNear(s.visible_on, s.start_date);
  return s.kind === 'keep' ? `la del ${shortDate(s.start_date)} se ve el ${when}` : `semana visible el ${when}`;
}

export function intakePlanLine(s: IntakePlanSummary, today: string): string {
  if (s.kind === 'personal') return 'Sin programa: lo escribes tú desde su plan';
  const program = s.program_name ?? 'su programa';
  const parts: string[] = [];
  if (s.kind === 'keep') {
    parts.push(s.group_name ? `Sigue en ${s.group_name}` : 'Sigue con lo que tiene');
    parts.push(s.week != null ? `${program}, semana ${s.week}${s.weeks ? ` de ${s.weeks}` : ''}` : program);
  } else if (s.kind === 'group') {
    parts.push(`Entra en ${s.group_name ?? 'el grupo'}`);
    parts.push(s.week != null ? `${program}, semana ${s.week}` : program);
    if (s.start_date) parts.push(`empieza ${dayLabel(s.start_date)}`);
  } else {
    parts.push(s.week != null && s.week > 1 ? `${program} desde la semana ${s.week}` : `${program} desde la semana 1`);
    if (s.start_date) parts.push(`empieza ${dayLabel(s.start_date)}`);
  }
  const vis = visiblePart(s, today);
  if (vis) parts.push(vis);
  return parts.join(' · ');
}
