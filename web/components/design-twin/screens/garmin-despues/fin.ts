// G27 · SESIÓN COMPLETADA — el final con su pantalla. PURA.
//
// El motor cierra el último paso (o el atleta termina, o la app murió y se
// recuperó) y el reloj lo dice: qué acabó (completada, terminada, recuperada),
// cuánto, y si está completa, parcial o libre —lo decide lo HECHO
// (`completitud` de kit-reloj), nunca esta pantalla— con su motivo cuando es
// parcial.
//
//   sello ✓ · título · TIEMPO TOTAL (el héroe) · «Completa · 6 de 6 series»
//   · el motivo (si es parcial) o cuánto se ha grabado libre / que se guardó sola
//
// Aquí NO se dice dónde está guardado ni si ha subido: eso es G31 (`envio.ts`)
// y no cabe en dos líneas de un círculo. Lo que se dice es lo que el atleta
// tiene que decidir: mientras `decide` sea cierto, START guarda y BACK sigue
// grabando (los rótulos junto a los botones, `mandos.ts`); ya guardada, START
// pasa al RPE. Los botones no se pintan en la cara: en reposo los rotula la
// carcasa, como el resto del kit.
//
// Qué NO hacer: decidir aquí si la sesión es completa (P0-2); escribir
// «Guardado en el iPhone»; prometer nada de Garmin Connect (H11).

import { lineaCompletitud } from '../../kit-reloj/fin';
import type { Completitud } from '../../kit-reloj/despues';
import { fmtDuracion, fmtReloj } from '../../kit-reloj/reglas';
import { AIRE, REJILLA, SELLO, TG, altoLinea, caja, heroeEn, lineaDePartes, type LineaG } from '../../kit-garmin';
import { ALTO_NOTA, apilarBloques, apilarTexto, lineaNota, type DisposicionFin } from './comun';

export interface DatosFin {
  /** El motor cerró el último paso (si no, el atleta terminó antes o la app se recuperó). */
  natural: boolean;
  /** Una sesión que la app recuperó tras morir (G07/G10): no «terminaste», se cortó. */
  recuperada?: boolean;
  /** Segundos de sesión. */
  t: number;
  metros: number | null;
  c: Completitud;
  /** Lo grabado libre tras «Seguir», en segundos. */
  libreS: number;
  /** Se guardó sola tras este rato quieto (el enfriamiento libre). */
  solaTrasS: number | null;
  /** Aún hay que decir «Guardar» o «Seguir». */
  decide: boolean;
}

/** El título: lo que acabó. */
export function tituloFin(d: Pick<DatosFin, 'natural' | 'recuperada'>): string {
  if (d.recuperada) return 'Sesión recuperada';
  return d.natural ? 'Sesión completada' : 'Sesión terminada';
}

/**
 * Por qué es parcial, dicho como pasó: `completitud` habla de quien terminó
 * («Terminaste en la serie 5 de 6»); una sesión recuperada no la terminó nadie,
 * se cortó («Se cortó en la serie 5 de 6»).
 */
export function motivoDe(d: Pick<DatosFin, 'c' | 'recuperada'>): string | null {
  const m = d.c.motivo;
  if (!m) return null;
  return d.recuperada ? m.replace(/^Terminaste/, 'Se cortó') : m;
}

export function disponerFin(d: DatosFin, D: number): DisposicionFin {
  // El sello ✓, asentado al fondo de la franja del contexto (como el del kit).
  const [, hC] = REJILLA.contexto;
  const sello = { y: (hC - SELLO / 2) * D, talla: SELLO * D };
  const y0 = REJILLA.heroe[0];
  const lineas: LineaG[] = lineaDePartes('titulo', [tituloFin(d)], TG.contexto, caja(y0, altoLinea(TG.contexto, 'texto')), D);
  const bajoTitulo = Math.max(...lineas.map((l) => (l.y + l.alto) / D)) + AIRE.lineas;
  const heroe = heroeEn(fmtReloj(d.t), undefined, bajoTitulo, REJILLA.heroe[1], D);
  // Bajo el héroe se apila, POR PRIORIDAD, lo que cabe: la cuenta (siempre), que se guardó sola, por qué es
  // parcial y lo grabado libre. Un bloque que no cabe entero antes del pie no se pinta a medias: se pierde el
  // menos importante (lo libre ya está en el tiempo total).
  const [yBanda] = REJILLA.banda;
  const cuenta = apilarTexto('completitud', lineaCompletitud(d.c, d.metros, 0), yBanda, TG.nota, D, { tono: 'tinta' });
  lineas.push(...cuenta.lineas);
  lineas.push(
    ...apilarBloques(
      [
        { rol: 'sola', texto: d.solaTrasS != null ? ['Guardada sola', `${fmtDuracion(d.solaTrasS)} sin moverte`] : null },
        { rol: 'motivo', texto: motivoDe(d) },
        { rol: 'libre', texto: d.libreS > 0 ? `+ ${fmtReloj(d.libreS)} libre` : null },
      ],
      cuenta.y1,
      TG.nota,
      D,
    ).lineas,
  );
  return { D, lineas, heroe, pista: null, sello };
}

/** Al salir de la app el reloj vuelve a su esfera (que no es nuestra): una línea, sin adornos. */
export function disponerSalida(D: number): DisposicionFin {
  return { D, lineas: [lineaNota('salida', 'Vuelves a tu esfera', 0.5 - ALTO_NOTA / 2, D)], heroe: null, pista: null };
}
