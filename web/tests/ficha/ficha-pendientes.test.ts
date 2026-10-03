import { describe, expect, it } from 'vitest';
import { buildHacerAhora, fichaStatusSummary, hacerAhoraCommand, partitionHacerAhora } from '@/lib/dashboard/v2/ficha-actions';
import type { FichaShell } from '@/lib/dashboard/v2/atleta-detalle-types';
import { shell, signal } from './fixtures';

const review = signal({ kind: 'review_1on1_due', label: 'Revisión 1:1 pendiente', severity: 'warning',
  evidence: '85 d sin revisión · la tienes cada 30 d', dedupe_key: 'review:11' });
const reply = signal({ kind: 'message_unanswered', label: 'Por responder', severity: 'warning',
  evidence: 'espera 41 d · 1 mensaje', dedupe_key: 'reply:11' });
const discomfort = signal({ kind: 'discomfort_reported', label: 'Molestia en rodilla', severity: 'critical',
  evidence: 'Rodilla derecha · comunicada hoy', dedupe_key: 'discomfort:11:hoy' });
const status = (...signals: FichaShell['status']['signals']) => ({ ...shell().status, key: 'vigilar' as const,
  tone: 'warn' as const, label: 'Vigilar', signals, needs_you: true });

describe('Ficha — cada pendiente conserva su causa, evidencia y control', () => {
  it('la revisión de 85 días abre su sección propia y no se confunde con la espera de 41 días', () => {
    const chips = buildHacerAhora(shell({ awaiting_reply: true, status: status(reply, review), pending_comunicados: 2 }));
    expect(chips.map((c) => c.kind)).toEqual(['responder', 'revision', 'comunicado']);
    const answer = chips.find((c) => c.kind === 'responder')!;
    expect(answer.evidence).toEqual(['espera 41 d · 1 mensaje']);
    expect(hacerAhoraCommand(answer)).toEqual({ kind: 'chat' });
    const revision = chips.find((c) => c.kind === 'revision')!;
    expect(revision.evidence).toEqual(['85 d sin revisión · la tienes cada 30 d']);
    expect(hacerAhoraCommand(revision)).toEqual({ kind: 'link', href: '/atletas/11?tab=perfil&seccion=revisiones' });
    const comms = chips.find((c) => c.kind === 'comunicado')!;
    expect(comms.label).toBe('2 comunicados pendientes');
    expect(hacerAhoraCommand(comms)).toEqual({ kind: 'link', href: '/atletas/11?tab=perfil&seccion=historial&historial=comunicado' });
  });

  it('el caso del informe conserva Responder delante de revisión y tres comunicados con la prioridad del estado', () => {
    const chips = buildHacerAhora(shell({ awaiting_reply: true, pending_comunicados: 3,
      status: status(review, reply) }));
    expect(partitionHacerAhora(chips).primary[0]?.kind).toBe('responder');
    expect(chips.map((c) => c.kind)).toEqual(['responder', 'revision', 'comunicado']);
    expect(chips.find((c) => c.kind === 'comunicado')?.label).toBe('3 comunicados pendientes');
  });

  it('check-in y mensaje comparten chat conservando ambas evidencias completas', () => {
    const notes = 'Comentario de check-in que supera ampliamente los treinta y dos caracteres y debe leerse completo';
    const chips = buildHacerAhora(shell({ last_checkin: { on: '2026-09-22', notes, score: 0, answered: false },
      awaiting_reply: true, status: status(reply, review) }));
    const answers = chips.filter((c) => c.kind === 'responder');
    expect(answers).toHaveLength(1);
    expect(answers[0]!.evidence.join(' ')).toContain(notes);
    expect(answers[0]!.evidence.join(' ')).toContain('espera 41 d');
    expect(answers[0]!.source_keys).toHaveLength(2);
    expect(chips.find((c) => c.kind === 'revision')).toBeDefined();
  });

  it('dedupe solo identidades iguales, conserva instancias y avisos informativos legítimos', () => {
    const info = signal({ kind: 'test_logged', severity: 'info', label: 'Test registrado', evidence: 'Test de hoy', dedupe_key: 'test:1' });
    const other = { ...info, dedupe_key: 'test:2', evidence: 'Segundo test de hoy' };
    const chips = buildHacerAhora(shell({ status: status(info, info, other, review, review) }));
    expect(chips.filter((c) => c.kind === 'revision')).toHaveLength(1);
    const tests = chips.filter((c) => c.kind === 'senal');
    expect(tests).toHaveLength(2);
    expect(tests.map((c) => c.evidence[0])).toEqual(['Test de hoy', 'Segundo test de hoy']);
    expect(tests.every((c) => hacerAhoraCommand(c)?.kind === 'link')).toBe(true);
  });

  it('un historial compartido conserva pregunta y tarea vencida, sus identidades y el contador real', () => {
    const question = signal({ kind: 'communication_question_unanswered', label: 'Pregunta sin contestar',
      evidence: 'Formulario de la carrera', severity: 'warning', dedupe_key: 'question:1' });
    const task = signal({ kind: 'communication_task_overdue', label: 'Tarea vencida',
      evidence: 'No ha confirmado el material', severity: 'critical', dedupe_key: 'task:2' });
    const chips = buildHacerAhora(shell({ pending_comunicados: 2, status: status(question, task, question) }));
    expect(chips).toHaveLength(1);
    expect(chips[0]!.label).toBe('2 comunicados pendientes');
    expect(chips[0]!.evidence.join(' ')).toContain('Pregunta sin contestar: Formulario de la carrera');
    expect(chips[0]!.evidence.join(' ')).toContain('Tarea vencida: No ha confirmado el material');
    expect(chips[0]!.source_keys).toHaveLength(3);
    expect(chips[0]!.severity).toBe('critical');
  });

  it.each(['activo', 'pausado', 'baja'] as const)('las críticas siguen visibles y accionables con ciclo de vida %s', (lifecycle) => {
    const data = shell({ status: status(discomfort, signal({}), reply, review) });
    data.lifecycle.status = lifecycle;
    const chips = buildHacerAhora(data);
    const { primary, critical, remaining } = partitionHacerAhora(chips);
    expect(primary).toHaveLength(1);
    expect([...primary, ...critical].filter((c) => c.severity === 'critical')).toHaveLength(2);
    expect(remaining.every((c) => c.severity !== 'critical')).toBe(true);
    const medical = chips.find((c) => c.cause === discomfort.label)!;
    expect(hacerAhoraCommand(medical)).toEqual({ kind: 'link', href: '/atletas/11?tab=perfil&seccion=lesiones' });
    if (lifecycle !== 'activo') {
      expect(chips.map((c) => c.kind)).not.toContain('descarga');
      expect(chips.find((c) => c.cause === 'Readiness 31')?.href).toBe('/atletas/11?tab=plan#estado-atleta');
    }
  });

  it('faltan datos: el resumen dice qué falta y no inventa salud ni adherencia cero', () => {
    const summary = fichaStatusSummary(shell());
    expect(summary).toBe('Readiness sin datos · Sin check-in');
    expect(summary).not.toMatch(/sano|al día|0 de/);
  });

  it('una lectura de cero sigue siendo lectura; el check-in contestado no pide responder', () => {
    const data = shell({ readiness: { value: 0, baseline: null, baseline_readings: 1, trend_14d: [], observed_at: '2026-09-23', band: 'low' },
      last_checkin: { on: '2026-09-23', score: 0, notes: 'Comentario ya respondido', answered: true } });
    expect(fichaStatusSummary(data)).not.toContain('Readiness sin datos');
    expect(buildHacerAhora(data)).toEqual([]);
  });

  it('readiness sin base conserva preguntar; no inventa evidencia para proponer descarga', () => {
    const chips = buildHacerAhora(shell({ status: status(signal({ baseline: null, action: 'mensaje' })) }));
    expect(chips.map((c) => c.kind)).not.toContain('descarga');
    expect(chips[0]!.cause).toBe('Readiness 31');
    expect(hacerAhoraCommand(chips[0]!)).toEqual({ kind: 'chat' });
  });

  it('publicación conserva la semana exacta, la sesión pendiente y la revisión de ajuste sin inventar su semana', () => {
    const chips = buildHacerAhora(shell({ publish_target: { week_start: '2026-09-28', sessions: 3, due: true, opens_on: '2026-09-23' },
      last_missed: { id: '183', date: '2026-09-22', title: 'Título completo de una sesión debida' },
      status: status(signal({ kind: 'week_adjustment_pending', severity: 'warning', label: 'Ajuste propuesto' })) }));
    expect(hacerAhoraCommand(chips.find((c) => c.kind === 'publicar')!)).toEqual({ kind: 'publish', week_start: '2026-09-28' });
    expect(hacerAhoraCommand(chips.find((c) => c.kind === 'ajustar')!)).toEqual({ kind: 'session', id: '183' });
    expect(hacerAhoraCommand(chips.find((c) => c.kind === 'evaluar')!)).toEqual({ kind: 'review_adjustment', proposal_id: '42' });
    expect(chips.find((c) => c.kind === 'evaluar')!.week_start).toBeUndefined();
  });

  it('pago vencido conserva su sección; una baja de suscripción conserva su acción de mensaje', () => {
    const overdue = buildHacerAhora(shell({ status: status(signal({ kind: 'billing_at_risk', label: 'Pago vencido', action: 'recordar_pago' })) }));
    expect(hacerAhoraCommand(overdue[0]!)).toEqual({ kind: 'link', href: '/atletas/11?tab=perfil&seccion=pagos' });
    const cancelled = buildHacerAhora(shell({ status: status(signal({ kind: 'billing_at_risk', label: 'Se da de baja', action: 'mensaje', severity: 'warning' })) }));
    expect(hacerAhoraCommand(cancelled[0]!)).toEqual({ kind: 'chat' });
    expect(cancelled[0]!.cause).toBe('Se da de baja');
  });

  it('la falta de plan y la señal del mismo hueco tienen una sola asignación, con toda su evidencia', () => {
    const data = shell({ has_upcoming_plan: false, status: status(signal({ kind: 'programming_status', severity: 'warning',
      label: 'Sin programa', evidence: 'Su programa terminó el lunes', dedupe_key: 'programming_status:11:no_month' })) });
    const chips = buildHacerAhora(data);
    expect(chips).toHaveLength(1);
    expect(hacerAhoraCommand(chips[0]!)).toEqual({ kind: 'assign' });
    expect(chips[0]!.evidence).toContain('Su programa terminó el lunes');
  });

  it('el alta conserva el cuestionario y la razón de un estado sin señales no desaparece', () => {
    const intake = buildHacerAhora(shell({ intake_pending: true, has_upcoming_plan: false }));
    expect(hacerAhoraCommand(intake[0]!)).toEqual({ kind: 'link', href: '/atletas/11/intake' });
    expect(intake.map((c) => c.kind)).not.toContain('asignar');
    const held = shell({ status: { ...shell().status, key: 'vigilar', tone: 'warn', label: 'Vigilar', reason: 'Su semana está retenida por ti' } });
    expect(fichaStatusSummary(held)).toContain('Su semana está retenida por ti');
  });
});
