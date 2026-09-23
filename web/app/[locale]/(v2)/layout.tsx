import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { emptyClubSkin } from '@fahybrid/shared/domain/coach/club-skin';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadShellBadges } from '@/lib/dashboard/coach/shell-badges';
import { getClubSkin } from '@/lib/coach/club-skin';
import { loadSetupChecklist } from '@/lib/coach/setup-checklist';
import { V2Shell } from '@/components/v2/V2Shell';
import { SetupProgress } from '@/components/v2/shared';
import { V2ThemeScript } from '@/components/v2/theme/V2ThemeScript';
import { RailPrepaintScript } from '@/components/v2/shell/RailPrepaintScript';
import { hasNegocioForRequest, loadHoyShellCounts } from '@/components/v2/shell/shell-counts';
import { PushSync } from '@/components/v2/push/PushNotifications';
import { flexrFontVars } from './fonts';
import './v2-theme.css';

// Layout del panel del coach: la puerta (sesión de coach) y el shell. El tema
// (oscuro por defecto, claro en el mismo botón) vive acotado a `.v2-root`
// (V2Shell → V2ThemeProvider). El script del menú plegado va DENTRO del shell
// para encontrar su contenedor antes de hidratar.
//
// Las cifras de la barra salen a la vez, cada una con dueño y cayendo sola:
// Mensajes = hilos por responder; Hoy = lo que pinta Hoy (needs_you); Negocio =
// leads nuevos + llamadas de hoy + pagos vencidos, solo con el add-on. «Primeros
// pasos n/3» sale solo hasta que un atleta ve su primera semana.

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
  const coach_id = Number(session.coach_id);

  const [badges, club, hoy, negocio, setup] = await Promise.all([
    loadShellBadges(session.coach_id),
    getClubSkin(session.coach_id)
      .then((skin) => skin ?? emptyClubSkin())
      .catch(() => emptyClubSkin()),
    loadHoyShellCounts(coach_id),
    hasNegocioForRequest(coach_id),
    loadSetupChecklist(session.coach_id).catch(() => null),
  ]);

  const counts = {
    hoy: hoy.needs_you,
    // La misma cifra que «Por responder» de Hoy; si Hoy no cargó, la cuenta barata.
    mensajes: hoy.awaiting_reply ?? badges.awaiting_reply,
    negocio: negocio ? badges.negocio + (hoy.payments_overdue ?? 0) : null,
  };

  return (
    <>
      {/* Headless: registra el SW y refresca la suscripción push de este
          navegador si ya estaba dada de alta. */}
      <PushSync />
      <V2Shell
        font_vars={flexrFontVars}
        // Dentro de `.v2-root`: el tema y el menú plegado se aplican antes de pintar
        // (sin destello del tema claro; V2ThemeProvider tolera la diferencia).
        prepaint={
          <>
            <V2ThemeScript />
            <RailPrepaintScript />
          </>
        }
        coach_name={session.full_name}
        coach_email={session.email}
        coach_avatar_url={session.avatar_url}
        club={club}
        counts={counts}
        negocio={negocio}
        setup={setup && !setup.complete ? <SetupProgress checklist={setup} /> : null}
      >
        {children}
      </V2Shell>
    </>
  );
}
