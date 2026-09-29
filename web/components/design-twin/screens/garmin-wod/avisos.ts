// LA CAMPANA DEL AMRAP — el único aviso propio de esta familia (§6 no lo tiene).
//
// Cuando suena el tiempo de un AMRAP, el motor de `kit-reloj` lo trata como
// cualquier «empieza recuperación» (1 larga + STOP). Para el atleta no es una
// recuperación: es la campana, y se le debe decir con algo suyo (encargo del
// arquitecto, 29-09): TRES largas y un tono propio (tres notas). Como el kit no
// deja añadir una fila a `AVISOS` (su test la cruza fila a fila con §6), la
// campana vive aquí, con el mismo formato (`AvisoGarmin`) y los mismos
// formateadores del kit (`fmtPulsos`, `fmtTono`, `perfilesDe`), y el vivo la
// emite EN VEZ DEL «recupera» del motor (una transición, un aviso).
//
// HUECO DEL MODELO (para el arquitecto): tres largas ya son «sesión hecha»
// (con SUCCESS ×2) y «sensor o GPS perdido» (con FAILURE). Con el sonido apagado
// la campana se confunde por vibración con esos dos; se distingue por el momento
// (sale justo al agotarse la ventana) y por el tono. Propuesta: «4 largas», o
// subir la campana a una fila de §6 con su vibración propia.
//
// Qué NO hacer: emitir la campana fuera de una transición del MOTOR (si el atleta
// salta el AMRAP desde Controles no suena campana: no ha acabado el tiempo); dejar
// que suene además el «recupera» del motor.

import { fmtPulsos, fmtTono, perfilesDe, type AvisoGarmin, type EmisionGarmin, type Nota } from '../../kit-garmin';
import type { Transicion } from '../../kit-reloj/gancho';
import { wodDe } from '../../kit-reloj';

/** Tres notas: dos iguales y una larga que baja, como una campana. Mecanismo (el sonido), no método del coach. */
export const MELODIA_CAMPANA: Nota[] = [
  { hz: 1319, ms: 140 },
  { hz: 1319, ms: 140 },
  { hz: 988, ms: 480 },
];

export const AVISO_CAMPANA: AvisoGarmin = {
  nombre: 'Campana del AMRAP',
  pulsos: ['larga', 'larga', 'larga'],
  tono: { melodia: MELODIA_CAMPANA },
  // Por encima de todo lo que puede coincidir con ella en el mismo segundo.
  prioridad: 12,
};

/** Lo que dice la cronología del panel al sonar la campana, como el resto de avisos. */
export const LINEA_CAMPANA = `${AVISO_CAMPANA.nombre} — vibra ${fmtPulsos(AVISO_CAMPANA, true)} · tono propio (${fmtTono(AVISO_CAMPANA, true)})`;

/** La emisión de la campana para el lector del estudio (`suena` queda nulo: no es ninguno de los eventos de §6). */
export function emisionCampana(n: number): EmisionGarmin {
  return { n, eventos: [], acuse: null, suena: null, perfiles: perfilesDe(AVISO_CAMPANA.pulsos), linea: LINEA_CAMPANA };
}

/** ¿Es esta transición la campana? El motor pasa solo de la ventana de un AMRAP a su puntuación. */
export function esCampana(t: Transicion): boolean {
  const antes = wodDe(t.plan.pasos[t.antes.i]);
  const despues = wodDe(t.plan.pasos[t.despues.i]);
  return t.quien === 'motor' && t.antes.i !== t.despues.i && antes?.formato === 'amrap' && despues?.formato === 'puntuacion';
}
