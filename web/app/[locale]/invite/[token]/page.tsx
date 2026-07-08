import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { InviteLandingCard } from '@/components/invites/InviteLandingCard';
import { getAthleteInvitationByToken } from '@/lib/athlete/invitations';
import { inviteDeepLink } from '@/lib/invites/deeplinks';
import {
  deriveInviteLandingState,
  type InviteLandingState,
} from '@/lib/invites/landing-state';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Reclama tu cuenta — FAHYBRID',
  robots: { index: false, follow: false },
};

const EYEBROW = 'FAHYBRID';

// Copy for the terminal / invalid states (no open button).
const TERMINAL_COPY: Record<
  // `declined` is partner-only (an invitee rejecting a Dobles invite); the
  // coach→athlete claim flow can never reach it, so it is excluded here.
  Exclude<InviteLandingState, 'valid' | 'declined'>,
  { headline: string; body: string }
> = {
  invalid: {
    headline: 'Invitación no válida',
    body: 'Este enlace no corresponde a ninguna invitación. Puede que se haya copiado mal o que ya no exista.',
  },
  expired: {
    headline: 'Invitación caducada',
    body: 'Este enlace ha caducado. Pídele a tu entrenador que te genere uno nuevo desde el panel.',
  },
  cancelled: {
    headline: 'Invitación anulada',
    body: 'Esta invitación se ha anulado. Si crees que es un error, pídele a tu entrenador que te envíe una nueva.',
  },
  used: {
    headline: 'Cuenta ya reclamada',
    body: 'Esta invitación ya se ha usado. Abre FAHYBRID y entra con tu Apple ID: tu cuenta ya está activa.',
  },
};

export default async function AthleteInvitePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const invitation = token ? await getAthleteInvitationByToken(token) : null;
  const state = deriveInviteLandingState(
    invitation && {
      used: invitation.status === 'redeemed',
      cancelled: invitation.status === 'revoked',
      expiredStatus: invitation.status === 'expired',
      expiresAt: invitation.expires_at,
    },
  );

  if (state !== 'valid') {
    // `declined` is partner-only and unreachable from the athlete claim flow
    // (the descriptor never sets it); fall back to `invalid` defensively.
    const copy = TERMINAL_COPY[state === 'declined' ? 'invalid' : state];
    return <InviteLandingCard eyebrow={EYEBROW} headline={copy.headline} body={copy.body} />;
  }

  return (
    <InviteLandingCard
      eyebrow={EYEBROW}
      headline="Reclama tu cuenta FAHYBRID"
      body="Tu entrenador ya te ha creado el perfil. Abre FAHYBRID y entra con tu Apple ID para vincular tu cuenta y ver tu plan."
      openHref={inviteDeepLink(token)}
    />
  );
}
