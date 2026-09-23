// /negocio → la primera pestaña.

import { redirect } from 'next/navigation';

export default async function NegocioIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/negocio/leads`);
}
