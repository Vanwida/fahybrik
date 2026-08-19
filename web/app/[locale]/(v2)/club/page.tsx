// v2 · CLUB — ficha de la piel del club (nombre, logo, acento).
// Vacío = marca de este binario. La piel repinta este panel y viaja a la app
// del atleta por `club` en GET /api/auth/me.

import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { emptyClubSkin } from '@fahybrid/shared/domain/coach/club-skin';
import { getClubSkin } from '@/lib/coach/club-skin';
import { ClubSkinForm } from '@/components/v2/club/ClubSkinForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Club' };

export default async function ClubPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  // Igual que el layout: Preview sin 0199 (u otro fallo de lectura) no puede
  // tumbar la ficha. Vacío = marca de este binario.
  let initial = emptyClubSkin();
  try {
    initial = (await getClubSkin(session.coach_id)) ?? emptyClubSkin();
  } catch {
    initial = emptyClubSkin();
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <header className="flex flex-col gap-1 border-b border-[color:var(--v2-border)] pb-4">
        <p className="v2-micro">Club</p>
        <h1 className="v2-display text-3xl text-[color:var(--v2-fg)] sm:text-4xl">Tu club</h1>
        <p className="mt-1 text-sm text-[color:var(--v2-muted)]">
          Nombre, logo y color. Es lo que ven tus atletas en su móvil, no solo tú
          aquí. Si dejas un campo vacío, se usa la marca de la app.
        </p>
      </header>

      <div className="mt-6">
        <ClubSkinForm initial={initial} />
      </div>
    </div>
  );
}
