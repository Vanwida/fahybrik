// Pure unit tests for the appointment status machine
// (@fahybrid/shared/domain/citas/status).

import { describe, expect, test } from 'vitest';
import {
  appointmentAllowedNext,
  canTransitionAppointment,
  isActiveAppointment,
  type AppointmentStatus,
} from '@fahybrid/shared/domain/citas/status';

describe('canTransitionAppointment', () => {
  test('pendiente → aceptada/rechazada/cancelada', () => {
    expect(canTransitionAppointment('pendiente', 'aceptada')).toBe(true);
    expect(canTransitionAppointment('pendiente', 'rechazada')).toBe(true);
    expect(canTransitionAppointment('pendiente', 'cancelada')).toBe(true);
    // Can't jump straight to done/no-show from pendiente.
    expect(canTransitionAppointment('pendiente', 'completada')).toBe(false);
    expect(canTransitionAppointment('pendiente', 'no_show')).toBe(false);
  });

  test('aceptada → cancelada/completada/no_show; not back to pendiente/rechazada', () => {
    expect(canTransitionAppointment('aceptada', 'cancelada')).toBe(true);
    expect(canTransitionAppointment('aceptada', 'completada')).toBe(true);
    expect(canTransitionAppointment('aceptada', 'no_show')).toBe(true);
    expect(canTransitionAppointment('aceptada', 'pendiente')).toBe(false);
    expect(canTransitionAppointment('aceptada', 'rechazada')).toBe(false);
    expect(canTransitionAppointment('aceptada', 'aceptada')).toBe(false);
  });

  test('terminal states are final', () => {
    for (const from of ['rechazada', 'cancelada', 'completada', 'no_show'] as AppointmentStatus[]) {
      for (const to of ['pendiente', 'aceptada', 'cancelada', 'completada'] as AppointmentStatus[]) {
        expect(canTransitionAppointment(from, to)).toBe(false);
      }
    }
  });
});

describe('appointmentAllowedNext', () => {
  test('menus per state', () => {
    expect(appointmentAllowedNext('pendiente')).toEqual(['aceptada', 'rechazada', 'cancelada']);
    expect(appointmentAllowedNext('aceptada')).toEqual(['cancelada', 'completada', 'no_show']);
    expect(appointmentAllowedNext('rechazada')).toEqual([]);
  });
});

describe('isActiveAppointment', () => {
  test('pendiente + aceptada are active; the rest are not', () => {
    expect(isActiveAppointment('pendiente')).toBe(true);
    expect(isActiveAppointment('aceptada')).toBe(true);
    for (const s of ['rechazada', 'cancelada', 'completada', 'no_show'] as AppointmentStatus[]) {
      expect(isActiveAppointment(s)).toBe(false);
    }
  });
});
