// Landing footer. Server component.
//
// Brand mark + tagline, in-page nav anchors, localed legal links, a contact mailto,
// and the copyright line. Hairline top border, matching the landing spacing language.
//
// Link types:
//   - Nav items are SAME-PAGE hash anchors (#…) → plain <a>.
//   - Legal pages live under [locale]/(public) (/es/privacy, /es/terms) → the i18n
//     `Link` from '@/i18n/navigation' so the active locale is prefixed correctly.

import { Link } from '@/i18n/navigation';
import { NAV, SOCIAL } from '@/lib/landing/content';
import { FahybridWordmark } from './FahybridMark';

const BRAND_LINE = 'HYROX · DEKA · Atleta híbrido';
// TODO: real contact address.
const CONTACT_EMAIL = 'hola@fahybrid.com';

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[color:var(--hairline)]">
      <div className="mx-auto w-full max-w-[1180px] px-6 py-16 md:px-10 md:py-20">
        <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
          {/* Brand */}
          <div className="flex flex-col gap-3">
            <FahybridWordmark size="lg" />
            <p className="text-sm text-[color:var(--muted)]">{BRAND_LINE}</p>
          </div>

          {/* Nav */}
          <nav
            aria-label="Secciones"
            className="flex flex-col gap-3 text-sm text-[color:var(--muted)]"
          >
            {NAV.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-[color:var(--fg)]"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Legal + contact */}
          <div className="flex flex-col gap-3 text-sm text-[color:var(--muted)]">
            <Link href="/privacy" className="transition-colors hover:text-[color:var(--fg)]">
              Privacidad
            </Link>
            <Link href="/terms" className="transition-colors hover:text-[color:var(--fg)]">
              Términos
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="transition-colors hover:text-[color:var(--fg)]"
            >
              {CONTACT_EMAIL}
            </a>
            <a
              href={SOCIAL.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[color:var(--fg)]"
            >
              Instagram {SOCIAL.instagram}
            </a>
          </div>
        </div>

        <div className="mt-16 flex items-center justify-between border-t border-[color:var(--hairline)] pt-6 text-[12px] text-[color:var(--muted)]">
          <span>© {year} FAHYBRID</span>
        </div>
      </div>
    </footer>
  );
}
