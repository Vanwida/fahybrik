// Programming evaluators — el plan del atleta: sin programa, programa que acaba
// sin siguiente, semana vacía; y dos señales INFORMATIVAS que no van a la
// bandeja diaria (DECISIONS 2026-09-23): «Listo para progresar» es una decisión
// de revisión semanal, y una carrera cerca es contexto, no una tarea.
//
// Vocabulario del panel (plan §2): «Programa», nunca «microciclo».

import {
  type SignalEvaluator,
  type SignalResult,
  dedupeKey,
  daysBetweenIso,
} from '@fahybrid/shared/domain/coach/signals';
import { shortDate, dias } from '@fahybrid/shared/domain/coach/athlete-state';

export const transitionReadyEvaluator: SignalEvaluator = {
  kind: 'transition_ready',
  default_severity: 'info',
  enabled: true,
  evaluate(facts): SignalResult {
    const fires = facts.transition_recommendation === 'advance';
    return {
      kind: 'transition_ready',
      fires,
      // Informativa: sale en la ficha y en la revisión semanal, no en Hoy.
      severity: 'info',
      value: null,
      baseline: null,
      trend: null,
      label: 'Listo para progresar',
      detail: facts.transition_detail || 'cumple lo que pide su programa actual',
      dedupe_key: dedupeKey('transition_ready', facts.athlete_id),
    };
  },
};

export const programmingStatusEvaluator: SignalEvaluator = {
  kind: 'programming_status',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, _thresholds, now): SignalResult | null {
    // Las propuestas por validar (ajuste semanal / programa del mes) ya tienen su
    // propia señal (week_adjustment_pending / monthly_block_pending): aquí solo
    // los huecos del plan, que no tienen otra.
    const status = facts.programming_status;
    let label: string;
    let detail: string;
    if (status === 'no_month') {
      label = 'Sin programa';
      detail = 'todavía no tiene ninguno asignado';
    } else if (status === 'block_ended') {
      label = 'Programa terminado';
      detail = facts.last_program_end_iso
        ? `terminó el ${shortDate(facts.last_program_end_iso)} · sin siguiente`
        : 'sin siguiente';
    } else if (status === 'empty_week') {
      label = 'Semana vacía';
      detail = facts.next_program_start_iso
        ? `su programa empieza el ${shortDate(facts.next_program_start_iso)}`
        : 'no tiene entrenos esta semana';
    } else {
      return null;
    }
    return {
      kind: 'programming_status',
      fires: true,
      severity: 'warning',
      value: null,
      baseline: null,
      trend: null,
      label,
      detail,
      observed_at:
        status === 'block_ended' && facts.last_program_end_iso
          ? `${facts.last_program_end_iso}T12:00:00.000Z`
          : now.toISOString(),
      window_label: null,
      // El estado es parte de la identidad: pasar de «sin programa» a «terminado»
      // es otra situación, no la misma que el coach ya dio por hecha.
      dedupe_key: dedupeKey('programming_status', facts.athlete_id, status),
    };
  },
};

export const microcycleEndingEvaluator: SignalEvaluator = {
  kind: 'microcycle_ending',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
    if (facts.current_microcycle_end_iso == null) return null;
    // Si ya tiene el siguiente programa asignado, que acabe este no es una tarea.
    if (facts.next_program_start_iso != null) return null;
    // El plan va en el calendario del CLUB; sin él, el del atleta.
    const days = daysBetweenIso(facts.club_today_iso ?? facts.today_iso, facts.current_microcycle_end_iso);
    const fires = days >= 0 && days <= thresholds.microcycle_ending_days;
    if (!fires) return null;
    const end = shortDate(facts.current_microcycle_end_iso);
    return {
      kind: 'microcycle_ending',
      fires: true,
      severity: 'warning',
      value: days,
      baseline: thresholds.microcycle_ending_days,
      trend: null,
      label: days === 0 ? 'Su programa acaba hoy' : `Su programa acaba en ${dias(days)}`,
      detail: facts.current_block_type
        ? `${facts.current_block_type} · termina el ${end} · sin siguiente`
        : `termina el ${end} · sin siguiente`,
      observed_at: `${facts.current_microcycle_end_iso}T12:00:00.000Z`,
      window_label: `${thresholds.microcycle_ending_days} d`,
      dedupe_key: dedupeKey('microcycle_ending', facts.athlete_id, facts.current_microcycle_end_iso),
    };
  },
};

export const aEventNearEvaluator: SignalEvaluator = {
  kind: 'a_event_near',
  default_severity: 'info',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
    const days = facts.days_to_a_event;
    if (days == null) return null;
    const fires = days >= 0 && days <= thresholds.a_event_near_days;
    if (!fires) return null;
    return {
      kind: 'a_event_near',
      fires: true,
      // Contexto (cuenta atrás), no una tarea del día.
      severity: 'info',
      value: days,
      baseline: thresholds.a_event_near_days,
      trend: null,
      label: facts.a_event_name ? `${facts.a_event_name} · ${days} d` : `Carrera objetivo en ${days} d`,
      detail: 'carrera objetivo cerca',
      window_label: `${thresholds.a_event_near_days} d`,
      dedupe_key: dedupeKey('a_event_near', facts.athlete_id),
    };
  },
};
