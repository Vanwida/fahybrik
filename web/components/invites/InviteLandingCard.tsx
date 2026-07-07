import { APP_STORE_URL } from '@/lib/invites/deeplinks';

/**
 * Branded, self-contained landing card for the public invitation pages
 * (partner redeem + coach→athlete claim). No client JS: the "open" and App
 * Store actions are plain anchors. Uses the global design tokens (--bg/--fg/
 * --accent/--muted) defined in app/globals.css.
 *
 * - `openHref` present → valid invitation: primary "open in app" + App Store.
 * - `openHref` null    → terminal/invalid state: message only, no open button.
 */
export interface InviteLandingCardProps {
  eyebrow: string;
  headline: string;
  body: string;
  /** When present, renders the primary open-in-app button pointing here. */
  openHref?: string | null;
  openLabel?: string;
}

export function InviteLandingCard({
  eyebrow,
  headline,
  body,
  openHref = null,
  openLabel = 'Abrir en FAHYBRID',
}: InviteLandingCardProps) {
  const hasAppStore = APP_STORE_URL.length > 0;

  return (
    <section className="mx-auto flex min-h-[80vh] max-w-[560px] flex-col items-center justify-center px-6 py-20 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent)]">
        {eyebrow}
      </p>

      <h1 className="mt-6 font-display text-[clamp(1.9rem,5vw,2.75rem)] font-black italic leading-[1.05] tracking-tight text-[color:var(--fg)]">
        {headline}
      </h1>

      <p className="mt-5 max-w-[42ch] leading-relaxed text-[color:var(--muted)]">{body}</p>

      {openHref ? (
        <div className="mt-10 flex w-full max-w-[320px] flex-col items-stretch gap-3">
          <a
            href={openHref}
            className="inline-flex items-center justify-center rounded-lg bg-[color:var(--accent)] px-5 py-3 font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)]"
          >
            {openLabel}
          </a>

          {hasAppStore ? (
            <a
              href={APP_STORE_URL}
              className="inline-flex items-center justify-center rounded-lg border border-[color:var(--hairline)] px-5 py-3 font-semibold text-[color:var(--fg)] transition-colors hover:border-[color:var(--fg)]"
            >
              Descargar en App Store
            </a>
          ) : (
            <span
              aria-disabled="true"
              title="Disponible próximamente en la App Store"
              className="inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-[color:var(--hairline)] px-5 py-3 font-semibold text-[color:var(--muted)] opacity-60"
            >
              Descargar en App Store
            </span>
          )}
        </div>
      ) : (
        <p className="mt-10 text-[13px] text-[color:var(--muted)]">
          ¿Necesitas ayuda?{' '}
          <a
            href="mailto:hello@fahybrid.com"
            className="text-[color:var(--fg)] underline-offset-4 hover:underline"
          >
            hello@fahybrid.com
          </a>
        </p>
      )}
    </section>
  );
}
