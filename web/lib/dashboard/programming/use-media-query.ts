import { useSyncExternalStore } from 'react';

/**
 * Suscripción a una media query con `useSyncExternalStore` (SSR-safe, sin
 * setState-en-effect). Devuelve `false` en el servidor y se sincroniza con el
 * resultado real en el cliente tras la hidratación.
 *
 * Se usa en el studio de programación para distinguir desktop (≥lg) de
 * móvil/tablet y para detectar pointer táctil (desactivar el drag&drop, que en
 * touch secuestraría el scroll del board).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined') return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false),
    () => false, // servidor: sin DOM → asumimos no-match (desktop por defecto)
  );
}
