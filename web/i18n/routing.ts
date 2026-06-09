import { defineRouting } from 'next-intl/routing';

/**
 * Locale routing config for FAHYBRIK.
 *
 * Default locale is Spanish (Castilian, tú-informal) — Pablo's voice.
 * English is the secondary locale, kept tight and athletic — never adds
 * motivational filler not present in Spanish.
 *
 * Sport vocabulary is brand-locked and IS NOT translated:
 *   HYROX, AMRAP, EMOM, RPE, Z1-Z5, sled push, wall ball, ski erg, etc.
 *   "[F]AHYBRIK", "REAL · TRANS · ACC", and ATR segment labels.
 *
 * Locale detection: cookie `NEXT_LOCALE` (set by switcher in coach footer),
 * falling back to the default locale. We do NOT read Accept-Language —
 * Pablo and athletes pick explicitly.
 */
export const routing = defineRouting({
  locales: ['es', 'en'],
  defaultLocale: 'es',
  // Always prefix the locale (/es/..., /en/...). The coach dashboard was built
  // against this mode so its next-intl Links resolve correctly. Bare public
  // legal URLs (/privacy, /terms) hardcoded by the iOS app are preserved via
  // explicit redirects in next.config.ts.
  localePrefix: 'always',
  localeDetection: false,
  localeCookie: {
    name: 'NEXT_LOCALE',
    maxAge: 60 * 60 * 24 * 365,
  },
});

export type Locale = (typeof routing.locales)[number];
