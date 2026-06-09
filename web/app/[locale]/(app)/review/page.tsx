import { redirect } from '@/i18n/navigation';

// /review desapareció como destino (UX redesign §0): la cola de propuestas
// pendientes vive ahora en HOY (/), el inbox único. Los deep-links antiguos
// (notificaciones, marcadores) aterrizan ahí.
export default async function ReviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: '/', locale });
}
