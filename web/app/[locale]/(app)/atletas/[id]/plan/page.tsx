import { redirect } from '@/i18n/navigation';
import { setRequestLocale } from 'next-intl/server';

// Deep-link de compatibilidad (UX redesign §2b): la pestaña Plan se fundió en
// la shell calendar-first de /atletas/[id]. Las notificaciones y el inbox de
// Hoy siguen enlazando /plan?focus=review — aterrizan en la shell con la
// revisión enfocada. `?focus=intake` (legacy) va a la página de intake.

export default async function AthletePlanRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ focus?: string; view?: string }>;
}) {
  const { locale, id } = await params;
  const { focus, view } = await searchParams;
  setRequestLocale(locale);

  if (focus === 'intake') {
    redirect({ href: `/atletas/${id}/intake`, locale });
  }

  const query = new URLSearchParams();
  if (focus) query.set('focus', focus);
  if (view) query.set('view', view);
  const qs = query.toString();

  redirect({ href: `/atletas/${id}${qs ? `?${qs}` : ''}`, locale });
}
