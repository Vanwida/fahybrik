// El recordatorio de pago es UN texto para las dos puertas (Hoy y Cobros).
import { describe, expect, it } from 'vitest';
import {
  paymentReminderText,
  personalizePaymentReminder,
} from '@/components/v2/hoy/payment-reminder';

describe('recordatorio de pago', () => {
  it('con nombre saluda por el nombre de pila', () => {
    expect(paymentReminderText('Ana García')).toMatch(/^Hola Ana: tu último pago no se ha podido cobrar\./);
  });

  it('sin nombre es la plantilla de un envío a varios, sin hueco', () => {
    expect(paymentReminderText(null)).toMatch(/^Hola: tu último pago/);
    expect(paymentReminderText('   ')).toMatch(/^Hola: tu último pago/);
  });

  it('la plantilla a varios, personalizada, es el mismo texto que el envío a uno', () => {
    expect(personalizePaymentReminder(paymentReminderText(null), 'Ana García')).toBe(paymentReminderText('Ana García'));
  });

  it('si el coach quitó el saludo, el texto va tal cual', () => {
    expect(personalizePaymentReminder('Revisa tu tarjeta.', 'Ana')).toBe('Revisa tu tarjeta.');
  });
});
