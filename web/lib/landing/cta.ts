// FAHYBRID landing — CTA target.
//
// THE FUNNEL (no prices on the web)
// ---------------------------------
// The landing sells; every primary CTA ("Solicita tu plaza") leads to the onboarding at
// /{locale}/empieza. The athlete tells us who they are there; the price is given
// later, in a video call with Pablo. No pricing lives anywhere on the web.
//
// LOCALE-CORRECTNESS: this is a plain in-app PATH, not a hash. The CTA components
// render it with the app's locale-aware `Link` (from '@/i18n/navigation'), which
// prefixes the active locale → e.g. /es/empieza. Same pattern the footer already
// uses for /privacy and /terms.

/** Where every primary CTA points: the onboarding. The i18n Link adds the locale. */
export const CHOOSE_PLAN_HREF = '/empieza';
