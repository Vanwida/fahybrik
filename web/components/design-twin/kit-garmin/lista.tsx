'use client';

// LA LISTA CON VENTANA — la página Estructura del vivo y la «Estructura
// completa» del brief son UNA sola pieza (§5, «Páginas de lista»). UP y DOWN
// mueven la ventana de uno en uno; en el borde la lista no se mueve y la tecla
// pasa de página. Al irse y volver, la ventana vuelve a «ahora»: no se pierde
// dónde estás.
//
//   ListaEstructura   la lista pintada, con su ventana
//   MoverLista        lo que llama quien atiende UP/DOWN: `false` = en el borde
//   ProveeLista       quien monta las páginas (`VistaGarmin`, o una pantalla de
//                     antes) da aquí dónde registrar el `mover` de la página activa
//   filasDeEstructura las filas de kit-reloj, con su texto
//
// Qué NO hacer: mover la ventana con un `if` propio en una familia (se registra
// el `mover` aquí); pintar una lista larga sin ventana.

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { textoFila, type FilaLista } from '../kit-reloj/listas';
import type { FilaEstructura } from '../kit-reloj/paso';
import { arranqueEstructura, disponerEstructura, moverEstructura } from './paginas';
import { PintaDisposicion, useGarmin } from './pintar';

/** Quién mueve la lista: devuelve `false` si está en el borde (y entonces la tecla pasa de página). */
export type MoverLista = (dir: 1 | -1) => boolean;

/** Dónde registra la página activa su `mover` (`null` al irse). Sin proveedor, nadie lo atiende. */
export type RegistrarLista = (mover: MoverLista | null) => void;

const Registro = createContext<RegistrarLista>(() => undefined);
export const ProveeLista = Registro.Provider;

/** Dónde registra su `mover` una lista propia de una familia (la de ejercicios de fuerza). */
export const useRegistrarLista = (): RegistrarLista => useContext(Registro);

/** Las filas de la estructura de kit-reloj como las pinta la lista. */
export const filasDeEstructura = (filas: FilaEstructura[]): FilaLista[] => filas.map((f) => ({ ...textoFila(f), estado: f.estado }));

/** UNA LISTA CON VENTANA: se registra en quien la provee y se mueve con UP/DOWN. */
export function ListaEstructura({ filas, registrar }: { filas: FilaLista[]; registrar?: RegistrarLista }) {
  const { D } = useGarmin();
  const delContexto = useContext(Registro);
  const registro = registrar ?? delContexto;
  const [desde, setDesde] = useState(() => arranqueEstructura(filas, D));
  const ultimo = useRef({ filas, desde, D });
  useEffect(() => {
    ultimo.current = { filas, desde, D };
  });
  useEffect(() => {
    registro((dir) => {
      const { filas: f, desde: d, D: dd } = ultimo.current;
      const nuevo = moverEstructura(f, d, dir, dd);
      if (nuevo == null) return false;
      ultimo.current = { ...ultimo.current, desde: nuevo };
      setDesde(nuevo);
      return true;
    });
    return () => registro(null);
  }, [registro]);
  return <PintaDisposicion d={disponerEstructura(filas, D, desde)} />;
}
