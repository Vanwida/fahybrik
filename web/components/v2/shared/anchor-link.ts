type AnchorClick = Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>;

/** El href conserva el destino tanto en navegación normal como en nueva pestaña. */
export function linkAnchor(href: string): string | null {
  try {
    const url = new URL(href, 'https://dashboard.invalid');
    return url.hash ? decodeURIComponent(url.hash.slice(1)) : url.searchParams.get('seccion');
  } catch {
    return null;
  }
}

/** Repetir un enlace también enfoca su destino, aunque Next conserve la misma URL. */
export function scrollExistingLinkAnchor(event: AnchorClick, href: string): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const id = linkAnchor(href);
  if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
}
