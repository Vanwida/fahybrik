import { coachReturn } from '@/components/v2/shared/context-link';

/** Destino sin locale para Link/useRouter i18n; conserva la ficha exacta de origen. */
export function athleteStructureHref(athleteId: string, origin: string | null, locale: string): string {
  const path = `/${locale}/atletas/${athleteId}`;
  let url = new URL(coachReturn(origin, locale)?.href ?? path, 'https://dashboard.invalid');
  if (url.pathname !== path) url = new URL(path, 'https://dashboard.invalid');
  url.searchParams.set('plan_estructura', '1');
  return `${url.pathname.slice(locale.length + 1)}${url.search}${url.hash}`;
}
