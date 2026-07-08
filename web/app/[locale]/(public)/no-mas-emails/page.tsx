import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { UnsubscribeConfirm } from '@/components/leads/UnsubscribeConfirm';

// Public RGPD unsubscribe confirmation page (#10) — /{locale}/no-mas-emails?token=…
// Rendered inside the (public) chrome (wordmark + legal footer). Never indexed; the token
// is the only credential. The Confirmar button (client) POSTs to /api/leads/unsubscribe.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Recordatorios — FAHYBRID',
  description: 'Gestiona los recordatorios que te enviamos.',
  robots: { index: false, follow: false },
};

export default async function NoMasEmailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token } = await searchParams;

  return <UnsubscribeConfirm token={token ?? null} />;
}
