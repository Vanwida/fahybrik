// FAHYBRID landing — CTA targets.
//
// THE FUNNEL (pay-first, on the WEB)
// ----------------------------------
// The landing sells; the athlete pays on the web. Two CTA levels:
//   1. DISCOVERY CTAs ("Empieza tu plan" en hero / header / cierre) → #precios:
//      llevan a ELEGIR tier.
//   2. CADA TIER → su Stripe Payment Link → checkout directo en Stripe (pago como
//      invitado, sin cuenta-primero, sin el IAP de Apple). Tras pagar, Stripe
//      redirige a /es/gracias. La cuenta + onboarding viven en la app (iOS), donde
//      el atleta entra con su email y el plan se enlaza por ese email.
//
// Por qué Payment Links y no el checkout autenticado del repo: ese endpoint
// (/api/stripe/checkout) es SOLO para la app iOS (auth Bearer del atleta); los
// usuarios web de Clerk son coach/admin, no atletas. Un checkout autenticado en web
// exigiría un sistema de auth atleta-web nuevo. Payment Links = funciona ya + mejor
// conversión (invitado). Reconciliación por email cuando la app esté pública.
//
// Los Payment Links son URLs PÚBLICAS (buy.stripe.com) — ok hardcodearlas en cliente.
// TODO: webhook → enlazar la suscripción al atleta por email cuando entre en la app.

/** Where the top-level "Empieza tu plan" CTA points: choose a tier. */
export const CHOOSE_PLAN_HREF = '#precios';

/** plan_type → Stripe Payment Link (LIVE). */
const PAYMENT_LINKS: Record<string, string> = {
  individual: 'https://buy.stripe.com/dRm8wObmU0Ntgnb3ohbQY00',
  dobles: 'https://buy.stripe.com/14AfZgez6ao36MB0c5bQY01',
  pro_elite: 'https://buy.stripe.com/7sYeVcgHedAf6MB0c5bQY02',
};

/** A specific tier's start → its Stripe Payment Link (direct checkout). */
export function tierStartHref(plan: string): string {
  return PAYMENT_LINKS[plan] ?? CHOOSE_PLAN_HREF;
}

/** Box-member special-price contact CTA. */
// TODO: real contact path / email.
export function boxContactHref(): string {
  return 'mailto:hello@fahybrid.com?subject=Precio%20especial%20box';
}
