// G31 · EL ESTADO DE ENVÍO, HONESTO — dónde está la sesión y qué falta. PURO.
//
// La sesión sale del reloj a NUESTRO servidor (`POST /api/sync/workout-execution`,
// modelo §8): la cola vive en el reloj, sin caducidad, hasta que el servidor
// acusa. Aquí no hay móvil nuestro por medio (el reloj habla por Garmin
// Connect), así que la pantalla dice lo que el reloj SABE y nada más:
//
//   en-reloj            «Guardado en el reloj · sube al tener el móvil»: no hay móvil
//                       a mano; nada se ha intentado.
//   enviando            hay móvil y va en camino.
//   enviado             «Enviado ✓»: el servidor acusó.
//   reintentando        hay móvil pero sin cobertura: no ha subido, y sigue
//                       intentándolo solo (no hay nada que hacer).
//   servidor-no-responde  el servidor no contesta (5xx o sin respuesta): «lo reintento
//                       solo». El reloj no pregunta nada.
//   sesion-caducada     el servidor dijo 401: la sesión del reloj caducó y hay que
//                       VINCULAR OTRA VEZ (G06). El entreno no se tira: espera en el
//                       reloj (G8) hasta el acuse, y se sube al volver a vincular.
//
// NO EXISTE «rechazado con Reintentar» (DECISIONS 28-09, «Nunca 4xx por un entreno
// con trabajo»): el servidor no rechaza un entreno con trabajo, y repetir un 4xx da el
// mismo 4xx. Los únicos fallos honestos de un envío son estos: sin red, sin servidor,
// sin sesión. Ninguno pide una decisión al atleta con un botón de reintento.
//
// El envío no avisa (vibración y tono): §6 no tiene fila para él.
//
// Qué NO hacer: escribir «Guardado en el iPhone»; prometer que la sesión cuente
// para Garmin (H11); llamar «guardado» a lo que solo está en cola.

import { RPE_PALABRA_DEFECTO } from '../../kit-reloj/tokens';
import { AIRE, REJILLA, TG } from '../../kit-garmin';
import { apilarTexto, type DisposicionFin, type GlifoEnvio } from './comun';

export type EstadoEnvio = 'en-reloj' | 'enviando' | 'enviado' | 'reintentando' | 'servidor-no-responde' | 'sesion-caducada';

/** Los estados en el orden de una sesión que sale bien, y luego los que fallan (para los tests y la cronología). */
export const ESTADOS_ENVIO: readonly EstadoEnvio[] = ['en-reloj', 'enviando', 'enviado', 'reintentando', 'servidor-no-responde', 'sesion-caducada'];

export interface TextoEnvio {
  titulo: string;
  detalle: string;
  glifo: GlifoEnvio;
  /** Lo que dice la cronología del doble, con el nombre técnico para el estudio. */
  cronologia: string;
}

export const TEXTO_ENVIO: Record<EstadoEnvio, TextoEnvio> = {
  'en-reloj': { titulo: 'Guardado en el reloj', detalle: 'Sube al tener el móvil', glifo: 'reloj', cronologia: 'guardado en el reloj, sin móvil a mano (cola sin caducidad)' },
  enviando: { titulo: 'Enviando', detalle: 'Ya va de camino', glifo: 'nube', cronologia: 'con móvil: la petición va de camino' },
  enviado: { titulo: 'Enviado', detalle: 'Ya lo tiene tu coach', glifo: 'visto', cronologia: 'el servidor acusó (2xx): se borra de la cola' },
  reintentando: { titulo: 'Reintentando', detalle: 'Aún no ha subido. Lo sigue intentando', glifo: 'reintento', cronologia: 'con móvil pero sin cobertura: reintenta solo, sin caducidad' },
  'servidor-no-responde': { titulo: 'El servidor no contesta', detalle: 'Lo reintento solo', glifo: 'reintento', cronologia: 'el servidor no contesta (5xx): reintenta solo, sin caducidad' },
  'sesion-caducada': { titulo: 'Sesión caducada', detalle: 'Vuelve a vincular el reloj. Tu entreno espera', glifo: 'aviso', cronologia: 'el servidor contestó 401: hay que vincular otra vez; el entreno no se tira y espera en el reloj' },
};

/** «RPE 7 · fuerte» o «Sin RPE»: lo que viaja con la sesión (un RPE omitido es nulo, no un cero). */
export const notaDeRpe = (rpe: number | null, palabras: Record<number, string> = RPE_PALABRA_DEFECTO): string => (rpe == null ? 'Sin RPE' : `RPE ${rpe} · ${palabras[rpe] ?? ''}`.trimEnd());

export interface OpcionesEnvio {
  palabras?: Record<number, string>;
}

/** El glifo del estado, en fracción de D: mayor que el sello de un final, porque aquí es lo primero que se lee. */
export const TALLA_GLIFO = 0.1;

export function disponerEnvio(estado: EstadoEnvio, rpe: number | null, D: number, o: OpcionesEnvio = {}): DisposicionFin {
  const t = TEXTO_ENVIO[estado];
  // El texto, apilado desde `y0`: el título grande, el detalle y el RPE que viaja con la sesión.
  const pila = (y0: number) => {
    const titulo = apilarTexto('titulo', [t.titulo], y0, TG.segundo, D, { cara: 'texto' });
    const cuerpo = apilarTexto('detalle', t.detalle, titulo.y1, TG.nota, D, { tono: 'tinta2' });
    const nota = apilarTexto('rpe', notaDeRpe(rpe, o.palabras), cuerpo.y1, TG.nota, D, { tono: 'tinta2' });
    return { lineas: [...titulo.lineas, ...cuerpo.lineas, ...nota.lineas], alto: nota.y1 - AIRE.lineas - y0 };
  };
  // El glifo y el texto son UN grupo y se centran juntos en el círculo, donde la cuerda es más ancha (dos pasadas:
  // con el grupo más al centro el texto puede necesitar menos líneas).
  let y0: number = REJILLA.heroe[0];
  for (let k = 0; k < 2; k++) y0 = 0.5 - (TALLA_GLIFO + AIRE.piezas + pila(y0).alto) / 2 + TALLA_GLIFO + AIRE.piezas;
  const glifo = { glifo: t.glifo, y: (y0 - AIRE.piezas - TALLA_GLIFO / 2) * D, talla: TALLA_GLIFO * D };
  return { D, lineas: pila(y0).lineas, heroe: null, pista: null, glifo, barras: [] };
}
