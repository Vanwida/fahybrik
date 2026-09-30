// Lógica PURA de los componentes compartidos (textos y recuentos): sin React,
// para probarla en node (web/lib/coach/__tests__/shared-logic.test.ts).

import type {
  AssignPreview,
  AssignPreviewAthlete,
  AssignResponse,
  WeekDelivery,
} from '@fahybrid/shared/schema/assign-many';
import type { AthleteWeekState } from '@fahybrid/shared/schema/week-publishing';
import type { PeekDay } from '@/lib/coach/athlete-peek';
import { dateRange, plusDays, weekdayDate, weekdayShort } from './format';

/** La línea corta que explica el estado. Pura (se prueba). */
export function weekStateLine(week: AthleteWeekState, today: string): string {
  const sunday = plusDays(week.week_start, 6);
  if (week.visible) {
    if (week.sessions === 0) return 'Visible · sin entrenos esa semana';
    return sunday < today ? 'La vio' : 'La ve ya';
  }
  if (week.held) return 'Retenida: no se publica sola';
  if (week.opens_on) {
    return week.opens_on <= today ? 'Se publica sola hoy' : `Se publica sola el ${weekdayDate(week.opens_on)}`;
  }
  return 'Oculta hasta que la publiques';
}

/** Lo que recibe un atleta, en una línea. */
export function athleteLine(a: AssignPreviewAthlete): string {
  switch (a.action) {
    case 'blocked':
      return a.blocked?.message ?? 'No se le puede asignar';
    case 'skip':
      return a.conflict
        ? `Sigue con «${a.conflict.program_name}» hasta el ${weekdayDate(a.conflict.end_date)}`
        : 'Se queda como está';
    case 'adopt':
      return a.program ? `Ya hace «${a.program.name}»` : 'Ya hace un programa del grupo';
    case 'chain':
      return a.start_date
        ? `Tras «${a.conflict?.program_name ?? 'su programa'}» · ${dateRange(a.start_date, a.end_date ?? a.start_date)}`
        : 'Detrás de lo que tiene';
    case 'replace':
      return a.conflict
        ? `Corta «${a.conflict.program_name}» · ${a.start_date ? dateRange(a.start_date, a.end_date ?? a.start_date) : ''}`
        : 'Sustituye lo que tiene';
    case 'assign':
    default:
      return a.start_date ? dateRange(a.start_date, a.end_date ?? a.start_date) : 'Desde la fecha elegida';
  }
}

/**
 * El aviso tras «Asignar»: a quién, en qué fechas y si quedó detrás de otro
 * programa. Todo sale de la respuesta del servidor (su `preview` lleva la ventana
 * REAL de cada atleta tras encadenar), nada se recalcula en el cliente. Pura.
 */
export function assignedToast(
  res: AssignResponse,
  programName: string,
): { title: string; description: string | undefined; tone: 'ok' | 'warn' } {
  const applied = res.applied!;
  const byId = new Map(res.preview.athletes.map((a) => [a.id, a]));
  const done = applied.results
    .filter((r) => r.status === 'applied')
    .map((r) => byId.get(r.athlete_id))
    .filter((a): a is AssignPreviewAthlete => a != null);

  const who =
    done.length === 1
      ? done[0]!.name
      : done.length === 2
        ? `${done[0]!.name} y ${done[1]!.name}`
        : `${done.length} atletas`;
  const title = done.length > 0 ? `«${programName}» asignado a ${who}` : `«${programName}»: no se ha asignado a nadie`;

  const lines: string[] = [];
  const windows = new Set(done.map((a) => `${a.start_date}|${a.end_date}`));
  const first = done[0];
  if (first && windows.size === 1 && first.start_date && first.end_date) {
    const chained = done.every((a) => a.action === 'chain');
    const replaced = done.every((a) => a.action === 'replace');
    const range = dateRange(first.start_date, first.end_date);
    lines.push(
      chained
        ? `${range}, detrás de ${done.length === 1 ? `«${first.conflict?.program_name ?? 'su programa'}»` : 'lo que ya tenían'}`
        : replaced
          ? `${range}, sustituyendo ${done.length === 1 ? `«${first.conflict?.program_name ?? 'su programa'}»` : 'lo que tenían'}`
          : range,
    );
  } else if (done.length > 0) {
    const chain = done.filter((a) => a.action === 'chain').length;
    const replace = done.filter((a) => a.action === 'replace').length;
    const parts = [
      done.length - chain - replace > 0 ? `${done.length - chain - replace} desde el ${weekdayDate(res.preview.start_date)}` : null,
      chain > 0 ? `${chain} detrás de lo que ya tenían` : null,
      replace > 0 ? `${replace} sustituyendo lo que tenían` : null,
    ].filter((x): x is string => x != null);
    lines.push(parts.join(' · '));
  }
  if (applied.skipped > 0) lines.push(`${applied.skipped} se ${applied.skipped === 1 ? 'queda' : 'quedan'} como ${applied.skipped === 1 ? 'estaba' : 'estaban'}`);
  if (applied.failed > 0) lines.push(`${applied.failed} no se ${applied.failed === 1 ? 'pudo' : 'pudieron'} asignar`);
  const dropped = res.preview.dropped_sessions;
  const lost = dropped.filter((d) => d.session_lost);
  const partial = dropped.length - lost.length;
  if (lost.length > 0) {
    lines.push(
      `${lost.length} ${lost.length === 1 ? 'entreno no se ha creado' : 'entrenos no se han creado'}. ${lost[0]!.message.replace(/\.$/, '')}`,
    );
  }
  if (partial > 0) lines.push(`${partial} ${partial === 1 ? 'entreno se ha creado incompleto' : 'entrenos se han creado incompletos'}`);

  return {
    title,
    description: lines.length > 0 ? lines.join('. ') : undefined,
    tone: applied.failed > 0 || dropped.length > 0 ? 'warn' : 'ok',
  };
}

/** Cuántos RECIBEN algo (los que cuenta el botón «Asignar a N»). */
export function receivingCount(p: Pick<AssignPreview, 'counts'>): number {
  return p.counts.assign + p.counts.chain + p.counts.replace;
}

/** La línea bajo «Entrega» en Asignar programa. */
export function deliveryLine(d: WeekDelivery, days: number | null): string {
  if (d === 'visible') return 'Ve todas las semanas desde ya.';
  if (d === 'draft') return 'Ocultas hasta que las publiques tú.';
  if (days == null) return 'Cada semana se publica sola unos días antes de empezar.';
  if (days === 0) return 'Cada semana se publica sola el mismo lunes.';
  // Lunes − N: el día de la semana en que se abre (con un lunes cualquiera de referencia).
  const ref = new Date(Date.UTC(2026, 0, 5 - days));
  const day = weekdayShort(ref.toISOString().slice(0, 10));
  return `Cada semana se publica sola ${days} ${days === 1 ? 'día' : 'días'} antes (el ${day}).`;
}

/** «2 de 3 debidas» de la semana: días pasados (y hoy si ya está hecho) con entreno. */
export function weekDueSummary(
  days: ReadonlyArray<Pick<PeekDay, 'date' | 'state'>>,
  today: string,
): { due: number; done: number } {
  let due = 0;
  let done = 0;
  for (const d of days) {
    if (d.state === 'rest') continue;
    if (d.date < today || (d.date === today && d.state === 'done')) {
      if (d.state === 'pending') continue; // oculta: no podía verla
      due += 1;
      if (d.state === 'done') done += 1;
    }
  }
  return { due, done };
}
