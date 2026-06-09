import { useSyncExternalStore } from 'react';

// Suscripción vacía: el valor "montado" nunca cambia tras la hidratación, así
// que no hay nada a lo que suscribirse.
const noopSubscribe = () => () => {};

/**
 * Gate de montaje para portales (`createPortal` necesita `document.body`, que no
 * existe en SSR). Devuelve `false` en el render del servidor y en el primer
 * render del cliente (para que la hidratación cuadre), y `true` después.
 *
 * Usa `useSyncExternalStore` con snapshots constantes server/cliente en vez del
 * patrón `useEffect(() => setMounted(true), [])`: evita el setState-en-effect
 * (regla react-hooks/set-state-in-effect) y el render extra que provoca.
 */
export function usePortalMount(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true, // cliente: ya montado
    () => false, // servidor: aún no hay DOM
  );
}
