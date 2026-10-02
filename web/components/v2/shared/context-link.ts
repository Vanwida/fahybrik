/** El regreso contextual solo puede apuntar a una ficha o un grupo del dashboard. */
export function coachReturn(value: string | null, locale: string): { href: string; label: string } | null {
  if (!value || value.length > 2400 || /[\u0000-\u001f\u007f]/.test(value) || !['es', 'en'].includes(locale)) return null;
  const prefix = `/${locale}/`;
  if (!value.startsWith(prefix) || value.includes('\\')) return null;
  const url = new URL(value, 'https://dashboard.invalid');
  if (url.origin !== 'https://dashboard.invalid') return null;
  const path = url.pathname.slice(prefix.length);
  if (/^atletas\/\d+$/.test(path)) return { href: value, label: 'Volver al atleta' };
  if (/^programar\/grupos\/\d+$/.test(path)) return { href: value, label: 'Volver al grupo' };
  return null;
}

export function withCoachReturn(destination: string, origin: string): string {
  const url = new URL(destination, 'https://dashboard.invalid');
  url.searchParams.set('volver', origin);
  return `${url.pathname}${url.search}${url.hash}`;
}
