// El recordatorio de pago: un mensaje del coach en el chat de cada atleta, con
// su nombre. UNA sola fuente para las dos puertas que lo mandan — «Recordar
// pagos» en Hoy y «Recordar pago» en Negocio › Cobros (components/v2/pagos/
// CobrosScreen.tsx) —, así el atleta recibe lo mismo venga de donde venga.

const BODY =
  'tu último pago no se ha podido cobrar. Puedes revisar la tarjeta en la app, en «Mi suscripción». Si ya está resuelto, ignora este mensaje.';

/** El nombre de pila, o '' si no hay nombre. */
export function reminderFirstName(full: string | null | undefined): string {
  return (full ?? '').trim().split(/\s+/)[0] ?? '';
}

/** «Hola Ana: …». Sin nombre, «Hola: …» (la plantilla de un envío a varios). */
export function paymentReminderText(name: string | null | undefined): string {
  const first = reminderFirstName(name);
  return `${first ? `Hola ${first}` : 'Hola'}: ${BODY}`;
}

/**
 * Pone el nombre de cada atleta en un texto de envío a varios que el coach ha
 * podido editar: el «Hola:» del principio pasa a «Hola Ana:». Si el coach quitó
 * el saludo, el texto va tal cual.
 */
export function personalizePaymentReminder(text: string, name: string | null | undefined): string {
  const first = reminderFirstName(name);
  return first ? text.replace(/^Hola:/, `Hola ${first}:`) : text;
}
