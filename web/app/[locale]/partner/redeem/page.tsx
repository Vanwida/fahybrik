import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { InviteLandingCard } from '@/components/invites/InviteLandingCard';
import { partnerRedeemDeepLink } from '@/lib/invites/deeplinks';
import {
  deriveInviteLandingState,
  type InviteLandingState,
} from '@/lib/invites/landing-state';
import {
  getInvitationByToken,
  loadInviterInfo,
} from '@/lib/partner/invitations';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Invitación Dobles — FAHYBRID',
  robots: { index: false, follow: false },
};

const EYEBROW = 'FAHYBRID · Dobles HYROX';

// Copy for the terminal / invalid states (no open button).
const TERMINAL_COPY: Record<
  Exclude<InviteLandingState, 'valid'>,
  { headline: string; body: string }
> = {
  invalid: {
    headline: 'Invitación no válida',
    body: 'Este enlace no corresponde a ninguna invitación. Puede que se haya copiado mal o que ya no exista.',
  },
  expired: {
    headline: 'Invitación caducada',
    body: 'Este enlace de invitación ha caducado. Pídele a tu compañero/a que te envíe uno nuevo desde la app.',
  },
  cancelled: {
    headline: 'Invitación cancelada',
    body: 'Esta invitación se ha cancelado. Si crees que es un error, pídele a tu compañero/a que vuelva a invitarte.',
  },
  used: {
    headline: 'Invitación ya aceptada',
    body: 'Esta invitación ya se ha usado. Si eres tú, abre FAHYBRID y entra con tu cuenta: ya estás emparejado/a.',
  },
};

function firstName(fullName: string | null): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export default async function PartnerRedeemPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token } = await searchParams;

  const invitation = token ? await getInvitationByToken(token) : null;
  const state = deriveInviteLandingState(
    invitation && {
      used: invitation.status === 'accepted',
      cancelled: invitation.status === 'cancelled',
      expiredStatus: invitation.status === 'expired',
      expiresAt: invitation.expires_at,
    },
  );

  if (state !== 'valid') {
    const copy = TERMINAL_COPY[state];
    return <InviteLandingCard eyebrow={EYEBROW} headline={copy.headline} body={copy.body} />;
  }

  // Valid — token is guaranteed present here (state can't be valid otherwise).
  const inviter = invitation ? await loadInviterInfo(invitation.inviter_user_id) : null;
  const name = firstName(inviter?.full_name ?? null);
  const headline = name
    ? `${name} te ha invitado a entrenar Dobles`
    : 'Te han invitado a entrenar Dobles';

  return (
    <InviteLandingCard
      eyebrow={EYEBROW}
      headline={headline}
      body="Modalidad Dobles HYROX. Sin pago: tu compañero/a ya cubre la suscripción compartida. Abre FAHYBRID para aceptar y empezar a entrenar juntos."
      openHref={partnerRedeemDeepLink(token as string)}
    />
  );
}
