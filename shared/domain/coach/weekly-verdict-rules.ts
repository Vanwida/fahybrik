import type { AthleteContextPack, BodySignal, ProgressionVerdict } from './coach-ia-context';

export type WeeklyVerdict = 'ok' | 'needs_adjustment';

/** Prefijo del código de trigger de una señal viva de Hoy (`signal:readiness_low`). */
export const BODY_SIGNAL_TRIGGER = 'signal:';

/**
 * El veredicto de la semana = las señales VIVAS de Hoy que piden tocar la semana
 * (`pack.body_signals`, las carga quien pide la evaluación desde
 * `web/lib/coach/week-adjust-signals.ts`): readiness baja con base, VFC hundida,
 * RPE alto (las de «Proponer descarga») y entrenos sin hacer. Nada más.
 *
 * Antes el motor tenía SUS reglas y SUS números — adherencia < 60 %, check-in
 * < 40, readiness < 45, 2 sin hacer, VFC −15 % — en código, sin mirar los del
 * coach: Hoy decía «al día» a quien hizo 8 de 10 (su proporción de 30 %) y el
 * lunes el veredicto le proponía un ajuste por «2 sin hacer»; un 43 con base era
 * «bien» en Hoy (suelo 40) y «readiness baja» aquí (45); una foto de un solo
 * check-in bastaba. Dos motores que responden distinto a la misma pregunta son
 * el problema raíz de la auditoría (informe B, P1; DECISIONS 2026-09-23).
 *
 * Ahora la pregunta la contesta UNO: el motor de señales, con los umbrales del
 * coach (`coach_signal_thresholds`: suelo, caída, días, base mínima, entrenos sin
 * hacer por número y proporción, RPE). Si Hoy no ve nada que pida cambiar la
 * semana, el veredicto es «ok»; si lo ve, «needs_adjustment» y el «por qué» cita
 * esas señales con sus palabras. Lo pospuesto o hecho en Hoy tampoco cuenta aquí.
 *
 * Los números de la semana evaluada (adherencia 7/28 d, readiness, check-in,
 * VFC) siguen en el paquete: son el CONTEXTO que lee la IA, no reglas.
 */
export function evaluateWeeklyVerdictFromContext(
  pack: Pick<AthleteContextPack, 'body_signals'>,
): { verdict: WeeklyVerdict; triggers: string[] } {
  const triggers: string[] = [];
  for (const s of pack.body_signals ?? []) {
    const code = `${BODY_SIGNAL_TRIGGER}${s.kind}`;
    if (!triggers.includes(code)) triggers.push(code);
  }
  const verdict: WeeklyVerdict = triggers.length > 0 ? 'needs_adjustment' : 'ok';
  return { verdict, triggers };
}

/**
 * La lectura de progresión que acompaña al paquete de la IA, con las mismas
 * fuentes: «down» si Hoy pide tocar la semana (el veredicto), «up» si no y la
 * adherencia de 7 días llega al mínimo del coach para progresar
 * (`progress_adherence_min_pct`, el mismo de «Listo para progresar»), «flat» si
 * no. Sin adherencia medible, «flat»: la ausencia de datos no es una subida.
 */
export function progressionVerdictOf(params: {
  body_signals: ReadonlyArray<BodySignal>;
  /** 0..1, o null si no había nada debido. */
  adherence_7d: number | null;
  /** 0..100 — el mínimo del coach para progresar. */
  progress_adherence_min_pct: number;
}): ProgressionVerdict {
  if (evaluateWeeklyVerdictFromContext({ body_signals: [...params.body_signals] }).verdict !== 'ok') {
    return 'down';
  }
  if (params.adherence_7d != null && params.adherence_7d * 100 >= params.progress_adherence_min_pct) {
    return 'up';
  }
  return 'flat';
}
