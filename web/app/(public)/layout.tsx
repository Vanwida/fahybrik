import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';

export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 min-h-screen flex-col bg-[color:var(--bg)] text-[color:var(--fg)]">
      <header className="sticky top-0 z-10 border-b border-[color:var(--hairline)] bg-[color:var(--bg)]/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[840px] items-center justify-between px-6">
          <Wordmark href="/" size="md" />
          <nav
            aria-label="Legal"
            className="flex items-center gap-5 text-[11px] uppercase tracking-[0.16em] text-[color:var(--muted)]"
          >
            <Link
              href="/privacy"
              className="hover:text-[color:var(--fg)] transition-colors"
            >
              Privacidad
            </Link>
            <Link
              href="/terms"
              className="hover:text-[color:var(--fg)] transition-colors"
            >
              Términos
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-[720px] px-6 py-12 md:py-16">
          {children}
        </div>
      </main>

      <footer className="border-t border-[color:var(--hairline)]">
        <div className="mx-auto flex w-full max-w-[840px] flex-col items-start justify-between gap-3 px-6 py-6 text-[12px] text-[color:var(--muted)] md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} Vanwida — FAHYBRIK</span>
          <div className="flex items-center gap-5 uppercase tracking-[0.16em] text-[11px]">
            <Link href="/privacy" className="hover:text-[color:var(--fg)]">
              Privacidad
            </Link>
            <Link href="/terms" className="hover:text-[color:var(--fg)]">
              Términos
            </Link>
            <a
              href="mailto:privacy@vanwida.pro"
              className="hover:text-[color:var(--fg)] normal-case tracking-normal"
            >
              privacy@vanwida.pro
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
