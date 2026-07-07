import { describe, expect, it } from 'vitest';
import {
  deriveNextAction,
  type NextActionInput,
} from '@fahybrid/shared/domain/leads/next-action';

// Fixed clock so future/past appointment logic is deterministic.
const NOW = new Date('2026-07-07T12:00:00Z');
const FUTURE = '2026-07-09T16:00:00Z'; // jue, > NOW
const PAST = '2026-07-05T16:00:00Z'; // < NOW

function input(over: Partial<NextActionInput>): NextActionInput {
  return {
    status: 'nuevo',
    is_partial: false,
    alta_sent_at: null,
    latest_outcome: null,
    has_report: false,
    appointment: null,
    now: NOW,
    ...over,
  };
}

describe('deriveNextAction — the sales-workbench next step', () => {
  it('archived (descartado) → no action', () => {
    expect(deriveNextAction(input({ status: 'descartado' }))).toBeNull();
  });

  it('convertido → Convertido (ok)', () => {
    expect(deriveNextAction(input({ status: 'convertido' }))).toEqual({
      text: 'Convertido',
      tone: 'ok',
    });
  });

  it('alta sent (not converted yet) → Alta enviada · esperando', () => {
    expect(
      deriveNextAction(input({ status: 'agendado', alta_sent_at: PAST })),
    ).toEqual({ text: 'Alta enviada · esperando', tone: 'info' });
  });

  it('quiere_empezar report → Dar de alta, and it OUTRANKS a future slot', () => {
    expect(
      deriveNextAction(
        input({
          status: 'agendado',
          latest_outcome: 'quiere_empezar',
          has_report: true,
          appointment: { status: 'aceptada', requested_start: FUTURE, when_short: 'jue 18:00' },
        }),
      ),
    ).toEqual({ text: 'Dar de alta', tone: 'accent' });
  });

  it('pending appointment → Aceptar cita', () => {
    expect(
      deriveNextAction(
        input({
          status: 'nuevo',
          appointment: { status: 'pendiente', requested_start: FUTURE, when_short: 'jue 18:00' },
        }),
      ),
    ).toEqual({ text: 'Aceptar cita', tone: 'accent' });
  });

  it('accepted future appointment → Llamada <when>', () => {
    expect(
      deriveNextAction(
        input({
          status: 'agendado',
          appointment: { status: 'aceptada', requested_start: FUTURE, when_short: 'jue 18:00' },
        }),
      ),
    ).toEqual({ text: 'Llamada jue 18:00', tone: 'info' });
  });

  it('accepted PAST appointment, no report → Registrar la llamada', () => {
    expect(
      deriveNextAction(
        input({
          status: 'agendado',
          appointment: { status: 'aceptada', requested_start: PAST, when_short: 'sáb 18:00' },
        }),
      ),
    ).toEqual({ text: 'Registrar la llamada', tone: 'warn' });
  });

  it('completada appointment, no report → Registrar la llamada', () => {
    expect(
      deriveNextAction(
        input({
          status: 'agendado',
          appointment: { status: 'completada', requested_start: PAST, when_short: 'sáb 18:00' },
        }),
      ),
    ).toEqual({ text: 'Registrar la llamada', tone: 'warn' });
  });

  it('completada appointment WITH a report → not "Registrar" (falls to outcome)', () => {
    expect(
      deriveNextAction(
        input({
          status: 'agendado',
          has_report: true,
          latest_outcome: 'pensandoselo',
          appointment: { status: 'completada', requested_start: PAST, when_short: 'sáb 18:00' },
        }),
      ),
    ).toEqual({ text: 'Hacer seguimiento', tone: 'info' });
  });

  it('seguimiento outcome → Hacer seguimiento', () => {
    expect(
      deriveNextAction(input({ status: 'agendado', has_report: true, latest_outcome: 'seguimiento' })),
    ).toEqual({ text: 'Hacer seguimiento', tone: 'info' });
  });

  it('no_asistio (report) → Reagendar llamada', () => {
    expect(
      deriveNextAction(input({ status: 'agendado', has_report: true, latest_outcome: 'no_asistio' })),
    ).toEqual({ text: 'Reagendar llamada', tone: 'info' });
  });

  it('no_show appointment, no report → Reagendar llamada', () => {
    expect(
      deriveNextAction(
        input({
          status: 'agendado',
          appointment: { status: 'no_show', requested_start: PAST, when_short: 'sáb 18:00' },
        }),
      ),
    ).toEqual({ text: 'Reagendar llamada', tone: 'info' });
  });

  it('no_interesado outcome → no action (coach may descartar)', () => {
    expect(
      deriveNextAction(input({ status: 'agendado', has_report: true, latest_outcome: 'no_interesado' })),
    ).toBeNull();
  });

  it('contactado (no cita) → Agendar llamada', () => {
    expect(deriveNextAction(input({ status: 'contactado' }))).toEqual({
      text: 'Agendar llamada',
      tone: 'info',
    });
  });

  it('agendado whose active slot is gone (cancelada) → Reagendar llamada', () => {
    expect(
      deriveNextAction(
        input({
          status: 'agendado',
          appointment: { status: 'cancelada', requested_start: PAST, when_short: 'sáb 18:00' },
        }),
      ),
    ).toEqual({ text: 'Reagendar llamada', tone: 'info' });
  });

  it('parcial (abandoned) → Recontactar (sin terminar)', () => {
    expect(deriveNextAction(input({ status: 'parcial', is_partial: true }))).toEqual({
      text: 'Recontactar (sin terminar)',
      tone: 'warn',
    });
  });

  it('nuevo → Contactar', () => {
    expect(deriveNextAction(input({ status: 'nuevo' }))).toEqual({
      text: 'Contactar',
      tone: 'accent',
    });
  });
});
