import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { emptyClubSkin } from '@fahybrid/shared/domain/coach/club-skin';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadShellBadges } from '@/lib/dashboard/coach/shell-badges';
import { getClubSkin } from '@/lib/coach/club-skin';
import { V2Shell } from '@/components/v2/V2Shell';
import { V2ThemeScript } from '@/components/v2/theme/V2ThemeScript';
import { PushSync } from '@/components/v2/push/PushNotifications';
import { flexrFontVars } from './fonts';
import './v2-theme.css';

// v2 route-group layout — the FOUNDATION of the redesign. Lives ALONGSIDE the
// v1 app: same auth gate (coach session), but a fully scoped theme + shell. The
// FLEXR theme (claro perla / oscuro del panel) is isolated to `.v2-root`
// (V2Shell → V2ThemeProvider); we never touch the <html> dark class, so the
// landing and the legacy app stay dark. The pre-paint V2ThemeScript sets
// data-theme before hydration. The sidebar badges are scoped `count(*)`s
// (lib/dashboard/coach/shell-badges.ts), loaded in parallel with the club skin.

// Identidad PWA SOLO del dashboard: el icono COACH al anclar a la pantalla de
// inicio. Scoped aquí (no en el layout raíz) para que la web pública conserve
// la suya.
export const metadata: Metadata = {
  icons: { apple: '/brand/fh-coach-180.png' },
  appleWebApp: { capable: true, title: 'FH Coach', statusBarStyle: 'default' },
};

export default async function V2Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) redirect('/sign-in');

  // Independent, scoped and cheap — all at once. Each one degrades on its own (badges
  // to 0, skin to the binary's) so a dead source never takes the shell down.
  const [badges, club] = await Promise.all([
    loadShellBadges(session.coach_id),
    getClubSkin(session.coach_id)
      .then((skin) => skin ?? emptyClubSkin())
      .catch(() => emptyClubSkin()),
  ]);
  // Mensajes = hilos por responder; Negocio = leads nuevos + llamadas que quedan hoy.
  const unread_messages = badges.awaiting_reply;
  const leads_nuevo = badges.negocio;

  return (
    <>
      {/* Headless: registra el SW y refresca la suscripción push de este
          navegador si ya estaba dada de alta. */}
      <PushSync />
      <V2ThemeScript />
      <V2Shell
        font_vars={flexrFontVars}
        coach_name={session.full_name}
        coach_email={session.email}
        coach_avatar_url={session.avatar_url}
        club={club}
        unread_messages={unread_messages}
        leads_nuevo={leads_nuevo}
      >
        {children}
      </V2Shell>
    </>
  );
}
