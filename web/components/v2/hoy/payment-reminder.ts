// El recordatorio de pago que manda «Recordar pagos» (Hoy): un mensaje del coach
// en el chat de cada atleta, con su nombre. El mismo texto que Negocio › Cobros
// (components/v2/pagos/CobrosScreen.tsx) — si uno cambia, cambian los dos.

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

export function paymentReminderText(name: string): string {
  return `Hola ${firstName(name)}: tu último pago no se ha podido cobrar. Puedes revisar la tarjeta en la app, en «Mi suscripción». Si ya está resuelto, ignora este mensaje.`;
}
