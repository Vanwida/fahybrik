// FAHYBRID landing — CTA targets.
//
// THE FUNNEL (pay-first, on the WEB)
// ----------------------------------
// The landing sells; the athlete pays on the web. Two CTA levels:
//   1. DISCOVERY CTAs ("Empieza tu plan" en hero / header / cierre) → #precios:
//      llevan a ELEGIR tier. No inician pago por sí solos.
//   2. CADA TIER (Individual / Dobles / Pro) → /sign-up?plan=<tier> → cuenta +
//      checkout de Stripe (pago en web, sin el IAP de Apple). Tras pagar: onboarding
//      (nivel/material/lesiones/carrera) → el entrenador monta el plan en 48–72h.
// La app iOS es la herramienta de entreno DESPUÉS de pagar, no el CTA de la landing.
//
// /sign-up es ruta TOP-LEVEL de Clerk (sin prefijo de locale) → enlázalo con next/link,
// NUNCA con el Link de i18n (añadiría /es y daría 404).
// TODO downstream: en el paso post-sign-up, leer ?plan y mandar al checkout del tier.
// TODO: configurar los price IDs de Stripe (lib/stripe/prices) para que el checkout
//       resuelva cada tier.

/** Where the top-level "Empieza tu plan" CTA points: choose a tier. */
export const CHOOSE_PLAN_HREF = '#precios';

/** A specific tier's start → create account + pay for that tier (pay-first, web). */
export function tierStartHref(plan: string): string {
  return `/sign-up?plan=${plan}`;
}

/** Box-member special-price contact CTA. */
// TODO: real contact path / email.
export function boxContactHref(): string {
  return 'mailto:hola@fahybrid.com?subject=Precio%20especial%20box';
}
