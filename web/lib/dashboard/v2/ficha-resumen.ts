// Vista pura de la pestaña Resumen. Cero DB: la ficha ya trae el payload;
// aquí se decide qué se pinta, en qué estado y con qué frase.

import { cuantosReclaman } from '@/lib/dashboard/v2/del-coach';
import type { PlanDay, PlanSession, PlanSessionStatus } from '@/lib/dashboard/coach/athlete-plan';
import type {
  FichaAdherenceWeek,
  V2AthleteDetalle,
} from '@/lib/dashboard/v2/atleta-detalle-types';

export type DiaEstado = 'hecha' | 'sin_hacer' | 'en_curso' | 'prevista' | 'descanso';

export interface Pendiente {
  key: string;
  label: string;
  href: string;
  /** True si Hoy ya la enseña como tarea (sufijo «— también en Hoy»). */
  en_hoy: boolean;
  /** Bloquea (rojo): sin plan, pago caído. */
  bloquea: boolean;
}

export function estadoSesion(
  session: PlanSession | undefined,
  isToday: boolean,
  iso: string,
  todayIso: string,
): DiaEstado {
  if (!session) return 'descanso';
  if (session.status === 'completed' || session.status === 'partial') return 'hecha';
  if (session.status === 'missed' || session.status === 'skipped') return 'sin_hacer';
  if (session.status === 'scheduled' && iso < todayIso) return 'sin_hacer';
  if (isToday) return 'en_curso';
  return 'prevista';
}

export function tituloDia(sessions: PlanSession[]): string | null {
  if (sessions.length === 0) return null;
  const first = sessions[0]!;
  if (sessions.length === 1) return first.title;
  return `${first.title} +${sessions.length - 1}`;
}

export type SesionVista = {
  assignment_id: string;
  title: string;
  estado: DiaEstado;
};

export function sesionesDelDia(day: PlanDay, todayIso: string): SesionVista[] {
  return day.sessions.map((s) => ({
    assignment_id: s.assignment_id,
    title: s.title,
    estado: estadoSesion(s, day.is_today, day.iso_date, todayIso),
  }));
}

export function buildPendientes(detalle: V2AthleteDetalle): Pendiente[] {
  const id = detalle.header.athlete_id;
  const out: Pendiente[] = [];

  if (detalle.header.status === 'alta') {
    out.push({
      key: 'alta',
      label: 'cerrar el alta',
      href: `/atletas/${id}/intake`,
      en_hoy: true,
      bloquea: false,
    });
  }

  const tieneSemana =
    detalle.plan?.weeks.some((w) => w.days.some((d) => d.sessions.length > 0)) ?? false;
  if (detalle.resumen?.programming.status === 'no_month' && !tieneSemana) {
    out.push({
      key: 'sin-plan',
      label: 'asignar plan',
      href: `/atletas/${id}?tab=plan`,
      en_hoy: true,
      bloquea: true,
    });
  }

  if (detalle.ficha.week_adjustment) {
    out.push({
      key: 'ajuste',
      label: 'ajuste de semana propuesto',
      href: `/atletas/${id}?tab=resumen`,
      en_hoy: true,
      bloquea: false,
    });
  }

  if (detalle.billing?.status === 'past_due') {
    out.push({
      key: 'pago',
      label: 'pago caído',
      href: `/atletas/${id}?tab=atleta&vista=pagos`,
      en_hoy: true,
      bloquea: true,
    });
  }

  const reclaman = cuantosReclaman(detalle.communications ?? []);
  if (reclaman > 0) {
    out.push({
      key: 'del-coach',
      label: reclaman === 1 ? '1 comunicado te reclama' : `${reclaman} comunicados te reclaman`,
      href: `/atletas/${id}?tab=del-coach`,
      en_hoy: true,
      bloquea: false,
    });
  }

  return out;
}

export function tendenciaAdherencia(
  weeks: FichaAdherenceWeek[],
): 'cayendo' | 'subiendo' | 'estable' | null {
  const conDato = weeks.filter((w) => w.pct != null);
  if (conDato.length < 2) return null;
  const last = conDato[conDato.length - 1]!.pct!;
  const prev = conDato[conDato.length - 2]!.pct!;
  if (last < prev - 4) return 'cayendo';
  if (last > prev + 4) return 'subiendo';
  return 'estable';
}

/** Una frase. Si no se puede escribir con honestidad, null — el gráfico no miente. */
export function interpretarAdherencia(
  weeks: FichaAdherenceWeek[],
  currentWeek: PlanDay[] | null,
  todayIso: string,
): string | null {
  if (!currentWeek) {
    const last = weeks[weeks.length - 1];
    if (last?.pct == null) return null;
    return `Esta semana va al ${Math.round(last.pct)}%.`;
  }
  const caidas = currentWeek.flatMap((d) =>
    d.sessions.filter((s) => estadoSesion(s, d.is_today, d.iso_date, todayIso) === 'sin_hacer'),
  );
  const hechas = currentWeek.flatMap((d) =>
    d.sessions.filter((s) => estadoSesion(s, d.is_today, d.iso_date, todayIso) === 'hecha'),
  );
  if (caidas.length === 0 && hechas.length === 0) return null;

  const runMissed = caidas.filter((s) => s.modality === 'carrera').length;
  const strengthDone = hechas.filter((s) => s.modality === 'fuerza').length;
  const strengthAll =
    currentWeek.flatMap((d) => d.sessions).filter((s) => s.modality === 'fuerza').length;

  if (runMissed > 0 && strengthAll > 0 && strengthDone === strengthAll) {
    return 'Se cae en las sesiones de carrera. Las de fuerza las cumple todas.';
  }
  if (runMissed > 0 && caidas.length === runMissed) {
    return 'Se cae en las sesiones de carrera.';
  }
  if (caidas.length === 1) {
    return `Sin hacer: ${caidas[0]!.title}.`;
  }
  if (caidas.length > 1) {
    return `Se cae en ${caidas.length} sesiones esta semana.`;
  }
  return null;
}

export function formatSleepHours(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function formatRaceTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h <= 0) return `${m}:${String(s).padStart(2, '0')}`;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function semanasHasta(daysUntil: number): number {
  return Math.max(0, Math.ceil(daysUntil / 7));
}

export function formatFechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace(/\.$/, '');
}

export function formatRangoSemana(startIso: string, endIso: string): string {
  const a = formatFechaCorta(startIso);
  const b = formatFechaCorta(endIso);
  return `${a} – ${b}`.replace(/(\d+ )([a-z]{3}) – (\d+) \2/i, '$1– $3 $2');
}

export function checkinRespondido(
  checkinIso: string | null,
  messages: { sender_role: string; created_at: string }[],
): boolean {
  if (!checkinIso) return false;
  return messages.some((m) => m.sender_role === 'coach' && m.created_at.slice(0, 10) >= checkinIso);
}

export type DiaVista = {
  iso: string;
  label: string;
  titulo: string | null;
  estado: DiaEstado;
  is_today: boolean;
  assignment_id: string | null;
};

export function diasDeLaSemana(days: PlanDay[], todayIso: string): DiaVista[] {
  return days.map((d) => {
    const primary = d.sessions[0];
    return {
      iso: d.iso_date,
      label: d.label,
      titulo: tituloDia(d.sessions),
      estado: estadoSesion(primary, d.is_today, d.iso_date, todayIso),
      is_today: d.is_today,
      assignment_id: primary?.assignment_id ?? null,
    };
  });
}

export { type PlanSessionStatus };
