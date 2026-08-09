// Evaluadores del comunicado del coach (docs/DECISIONS.md, 2026-08-09).
//
// El comunicado ya sabe si sigue reclamándole algo al atleta (`claimsAttention`
// en shared/domain/coach-communications.ts). Lo que falta es que eso llegue al
// COACH: sin estas tres señales, un comunicado publicado y nunca cerrado se
// queda esperando en la ficha de un atleta entre cien, que es exactamente el
// «push perdido» que la entidad venía a resolver.
//
// MECANISMO vs MÉTODO (HARD RULE Nº0): qué reclama y cuándo deja de reclamar lo
// dice el modelo y por eso está en código; CUÁNTOS días de espera hacen falta
// para molestar al coach es método suyo y llega en `thresholds`, resuelto desde
// `coach_signal_thresholds` sobre los defectos del sistema.
//
// Los tres agregan por atleta: la tarjeta de /hoy es una por atleta y señal, así
// que cada evaluador cita al comunicado que MANDA (el más antiguo, el más
// atrasado, el de evento más próximo) y dice cuántos más hay igual.

import {
  type SignalEvaluator,
  type SignalResult,
  dedupeKey,
} from '@fahybrid/shared/domain/coach/signals';

/** «1 día» / «4 días». */
function dias(n: number): string {
  return `${n} ${n === 1 ? 'día' : 'días'}`;
}

/** «y 2 más», o nada cuando sólo hay uno. */
function yMas(others: number): string {
  return others > 0 ? ` · y ${others} más` : '';
}

/** Cómo llama el coach al evento del que cuelga un protocolo. */
const EVENTO: Record<'race' | 'test', string> = {
  race: 'la carrera',
  test: 'el test',
};

export const communicationQuestionUnansweredEvaluator: SignalEvaluator = {
  kind: 'communication_question_unanswered',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
    const q = facts.communication_question;
    if (q == null) return null;
    if (q.days < thresholds.communication_question_unanswered_days) return null;

    // Una pregunta que bloquea deja el plan a medio cerrar: eso no es «vigilar».
    // `blocks` es del conjunto, así que cuando la que bloquea no es la que se
    // cita, el detalle lo dice con esas palabras en vez de fingir que lo es.
    const cola = q.blocks
      ? q.others > 0
        ? ` · y ${q.others} más, una bloquea el plan`
        : ' · bloquea el plan'
      : yMas(q.others);

    return {
      kind: 'communication_question_unanswered',
      fires: true,
      severity: q.blocks ? 'critical' : 'warning',
      value: q.days,
      baseline: thresholds.communication_question_unanswered_days,
      trend: null,
      label: 'Pregunta sin responder',
      detail: `«${q.title}» · ${dias(q.days)} sin responder${cola}`,
      // El id de la pregunta forma parte de la identidad: si el coach silencia
      // ésta y luego publica otra, la nueva es un item distinto que la tarjeta
      // silenciada no puede tapar.
      dedupe_key: dedupeKey('communication_question_unanswered', facts.athlete_id, q.id),
    };
  },
};

export const communicationTaskOverdueEvaluator: SignalEvaluator = {
  kind: 'communication_task_overdue',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
    const t = facts.communication_task;
    if (t == null) return null;
    // Vencer es que la fecha límite ya pasó, y eso ya es la señal: no hay umbral
    // que decida si una tarea está vencida. Lo que decide el coach es a partir
    // de cuántos días de retraso deja de ser un despiste.
    if (t.days < 1) return null;

    const critica = t.days >= thresholds.communication_task_overdue_critical_days;

    return {
      kind: 'communication_task_overdue',
      fires: true,
      severity: critica ? 'critical' : 'warning',
      value: t.days,
      baseline: thresholds.communication_task_overdue_critical_days,
      trend: null,
      label: 'Tarea vencida',
      detail: `«${t.title}» · venció hace ${dias(t.days)}${yMas(t.others)}`,
      dedupe_key: dedupeKey('communication_task_overdue', facts.athlete_id, t.id),
    };
  },
};

export const communicationProtocolUnopenedEvaluator: SignalEvaluator = {
  kind: 'communication_protocol_unopened',
  default_severity: 'warning',
  enabled: true,
  evaluate(facts, thresholds): SignalResult | null {
    const p = facts.communication_protocol;
    if (p == null) return null;
    // Pasado el evento el protocolo ya no sirve de nada: la señal se resuelve
    // sola en vez de quedarse pidiendo algo que ya no se puede hacer.
    if (p.days < 0) return null;
    if (p.days > thresholds.communication_protocol_unopened_days) return null;

    const evento = EVENTO[p.anchor];
    const cuando = p.days === 0 ? `${evento} es hoy` : `${evento} es en ${dias(p.days)}`;

    return {
      kind: 'communication_protocol_unopened',
      fires: true,
      // El día del evento ya no queda margen: o lo abre hoy o no lo abre.
      severity: p.days === 0 ? 'critical' : 'warning',
      value: p.days,
      baseline: thresholds.communication_protocol_unopened_days,
      trend: null,
      label: 'Protocolo sin abrir',
      detail: `«${p.title}» · ${cuando} y no lo ha abierto${yMas(p.others)}`,
      dedupe_key: dedupeKey('communication_protocol_unopened', facts.athlete_id, p.id),
    };
  },
};
