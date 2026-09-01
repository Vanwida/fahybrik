// Física del salto vertical por tiempo de vuelo.
//
// Mecanismo, no método: un proyectil que sale y vuelve a la misma altura de
// cadera. g no se edita. El /8 sale de h = ½ g (t/2)².

export const JUMP_G = 9.81;

export function flightTimeSeconds(
  takeoffFrame: number,
  landingFrame: number,
  fps: number,
): number | null {
  if (!(fps > 0)) return null;
  if (!Number.isFinite(takeoffFrame) || !Number.isFinite(landingFrame)) return null;
  if (landingFrame <= takeoffFrame) return null;
  return (landingFrame - takeoffFrame) / fps;
}

export function heightMeters(flightTimeS: number, g: number = JUMP_G): number | null {
  if (!(flightTimeS > 0) || !(g > 0)) return null;
  return (g * flightTimeS * flightTimeS) / 8;
}

export function heightCm(flightTimeS: number, g: number = JUMP_G): number | null {
  const m = heightMeters(flightTimeS, g);
  return m == null ? null : m * 100;
}

export function takeoffVelocityMs(flightTimeS: number, g: number = JUMP_G): number | null {
  if (!(flightTimeS > 0) || !(g > 0)) return null;
  return (g * flightTimeS) / 2;
}

/** Error de altura si el despegue o el aterrizaje se marcan un frame mal. */
export function uncertaintyCm(fps: number, g: number = JUMP_G): number | null {
  if (!(fps > 0) || !(g > 0)) return null;
  const dt = 1 / fps;
  // dh/dt = g t / 4; alrededor de un CMJ de ~0.62 s (~47 cm) ≈ 0.6 cm a 240 fps.
  // Reportamos el error de UN frame en el vuelo, independiente de t: Δh ≈ g (2t Δt)/8
  // con t típico 0.62. Más honesto y estable: diferencia de altura entre t y t+Δt
  // en un vuelo de referencia de 47 cm.
  const tRef = Math.sqrt((8 * 0.47) / g);
  const h0 = heightCm(tRef, g);
  const h1 = heightCm(tRef + dt, g);
  if (h0 == null || h1 == null) return null;
  return Math.abs(h1 - h0);
}
