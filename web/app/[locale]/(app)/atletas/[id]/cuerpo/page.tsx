import { redirect } from '@/i18n/navigation';
import { setRequestLocale } from 'next-intl/server';

// Deep-link de compatibilidad (UX redesign §2b): Cuerpo es una sección de la
// shell calendar-first de /atletas/[id], no una sub-página.

export default async function AthleteBodyRedirect({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  redirect({ href: `/atletas/${id}?section=cuerpo`, locale });
}
