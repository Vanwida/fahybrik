'use client';

// Sticky landing header.
//
// Transparent over the hero; after scrolling ~40px it gains a blurred translucent
// background + a bottom hairline. Scroll state is tracked with a passive listener
// (SSR-safe — only runs in useEffect).
//
// Links:
//   - Wordmark + nav anchors point at in-page section ids (#…). Lenis makes anchor
//     jumps smooth. These are PLAIN anchors (same-page hashes).
//   - The CTA points at appHref() → the app download (placeholder link for now).
//     Uses next/link's Link.
//
// Mobile: a hamburger opens a full-screen overlay with the same links + CTA. The
// overlay is an accessible dialog: focus moves in on open, ESC + backdrop close it,
// body scroll is locked, and aria-expanded reflects state.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV } from '@/lib/landing/content';
import { CHOOSE_PLAN_HREF } from '@/lib/landing/cta';
import { FahybridMark } from './FahybridMark';

// Scroll distance (px) after which the header gains its solid treatment.
const SCROLL_THRESHOLD = 40;
// In-page anchor for the brand mark (top of landing).
const HOME_ANCHOR = '#hero';

const CTA_CLASS =
  'inline-flex h-9 items-center justify-center rounded-[10px] bg-[color:var(--accent)] px-4 text-sm font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]';

const NAV_LINK_CLASS =
  'text-sm font-medium text-[color:var(--muted)] transition-colors hover:text-[color:var(--fg)] focus-visible:outline-none focus-visible:text-[color:var(--fg)]';

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onScroll = () => setScrolled(window.scrollY > SCROLL_THRESHOLD);
    onScroll(); // initialize from current position (e.g. on refresh mid-page)
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Lock body scroll + ESC-to-close + focus management while the overlay is open.
  useEffect(() => {
    if (!menuOpen || typeof document === 'undefined') return;

    // Capture the trigger node now; the ref may point elsewhere by cleanup time.
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', onKeyDown);

    // Move focus into the overlay's first focusable element.
    overlayRef.current?.querySelector<HTMLElement>('a, button')?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      // Return focus to the trigger that opened the menu.
      trigger?.focus();
    };
  }, [menuOpen, closeMenu]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
        scrolled
          ? 'border-b border-[color:var(--hairline)] bg-[color:var(--bg)]/80 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between px-6 md:px-10">
        <a href={HOME_ANCHOR} className="inline-flex items-center" aria-label="FAHYBRID — inicio">
          <FahybridMark className="h-7" color="var(--accent)" />
        </a>

        {/* Desktop nav */}
        <nav aria-label="Principal" className="hidden items-center gap-8 md:flex">
          {NAV.links.map((link) => (
            <a key={link.href} href={link.href} className={NAV_LINK_CLASS}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:block">
          <Link href={CHOOSE_PLAN_HREF} className={CTA_CLASS}>
            {NAV.cta}
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          aria-label="Abrir menú"
          className="inline-flex size-10 items-center justify-center rounded-[10px] text-[color:var(--fg)] transition-colors hover:bg-[color:var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] md:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </div>

      {/* Mobile overlay menu */}
      {menuOpen ? (
        <div
          ref={overlayRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menú de navegación"
          className="fixed inset-0 z-50 flex flex-col bg-[color:var(--bg)] md:hidden"
        >
          <div className="flex h-16 items-center justify-between px-6">
            <FahybridMark className="h-7" color="var(--accent)" />
            <button
              type="button"
              onClick={closeMenu}
              aria-label="Cerrar menú"
              className="inline-flex size-10 items-center justify-center rounded-[10px] text-[color:var(--fg)] transition-colors hover:bg-[color:var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          <nav
            aria-label="Principal"
            className="flex flex-1 flex-col justify-center gap-2 px-6 pb-16"
          >
            {NAV.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className="font-display text-3xl italic font-black tracking-tight text-[color:var(--fg)] focus-visible:outline-none focus-visible:text-[color:var(--accent)]"
              >
                {link.label}
              </a>
            ))}
            <Link
              href={CHOOSE_PLAN_HREF}
              onClick={closeMenu}
              className={cn(CTA_CLASS, 'mt-8 h-12 text-base')}
            >
              {NAV.cta}
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
