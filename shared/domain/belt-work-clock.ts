// Reloj de TRABAJO en cinta FTMS. El de la sesión (lap / EMOM / AMRAP) es
// otro: es de pared. Éste solo suma cuando la máquina manda velocidad.

export const MIN_BELT_MOVING_KMH = 0.5;

export type BeltClockSurface = 'ftms' | 'other';
export type BeltClockWindow = 'work' | 'recovery' | 'count_in' | 'format';

export function beltIsMoving(speedKmh: number | null | undefined): boolean {
  return (speedKmh ?? 0) > MIN_BELT_MOVING_KMH;
}

/**
 * `beltMoving === null`: no hay feed FTMS (cinta tonta, reloj, calle).
 * El reloj de trabajo no se aplica.
 */
export function beltWorkApplies(args: {
  surface: BeltClockSurface;
  window: BeltClockWindow;
  beltMoving: boolean | null;
}): boolean {
  return args.surface === 'ftms' && args.window === 'work' && args.beltMoving !== null;
}

/** dt que cuenta como trabajo. 0 si la banda no manda velocidad. */
export function beltWorkTick(args: {
  wallDt: number;
  surface: BeltClockSurface;
  window: BeltClockWindow;
  beltMoving: boolean | null;
}): number {
  if (!beltWorkApplies(args)) return args.wallDt;
  return args.beltMoving ? args.wallDt : 0;
}

/** Ritmo (s/km) desde km/h. Parado no tiene ritmo. */
export function paceSecPerKmFromKmh(speedKmh: number | null | undefined): number | null {
  if (!beltIsMoving(speedKmh) || speedKmh == null) return null;
  return Math.round(3600 / speedKmh);
}
