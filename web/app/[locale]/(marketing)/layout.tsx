import { setRequestLocale } from 'next-intl/server';
import { SmoothScroll } from '@/components/landing/primitives/SmoothScroll';
import { MarketingHeader } from '@/components/landing/MarketingHeader';
import { MarketingFooter } from '@/components/landing/MarketingFooter';
import '../../../components/landing/landing.css';

interface MarketingLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

// No max-width here — landing sections are full-bleed and own their own container.
export default async function MarketingLayout({
  children,
  params,
}: Readonly<MarketingLayoutProps>) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="min-h-screen bg-[color:var(--bg)] text-[color:var(--fg)] antialiased">
      <SmoothScroll>
        <MarketingHeader />
        <main>{children}</main>
        <MarketingFooter />
      </SmoothScroll>
    </div>
  );
}
