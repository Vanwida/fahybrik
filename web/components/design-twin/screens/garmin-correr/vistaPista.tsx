'use client';

// LA PISTA, PINTADA — la tarjeta de la vuelta y la página Vueltas con su nombre
// (`pista.ts` decide qué dicen; aquí se pintan con las piezas del kit).
//
//   capaDePista(seq, kit)    la capa a pantalla entera: en un paso con vuelta de
//                            pista, la tarjeta «Vuelta 7» en vez de «Kilómetro 7».
//   paginasDePista(seq, cara) Paso · Datos · Vueltas (v 6, v 5…) · Estructura.
//
// Van a las ranuras `capa` y `paginas` de `VistaGarmin`; nada más se toca.
//
// Qué NO hacer: pintar la tarjeta de un km con esto (con 1000 m sirve la del
// kit); contar vueltas aquí.

import type { ReactNode } from 'react';
import {
  CaraKm,
  PaginaDatos,
  PaginaEstructura,
  PintaDisposicion,
  VUELTAS_VISIBLES,
  disponerVueltas,
  useGarmin,
  type PaginaGarmin,
} from '../../kit-garmin';
import type { Secuencia } from '../../kit-reloj/gancho';
import { filasDeVueltas } from '../../kit-reloj/listas';
import type { FilaEstructura } from '../../kit-reloj/paso';
import { vueltasDe } from '../../kit-reloj/vivo';
import { bannerDeVuelta, esVueltaDePista, rotuloDeVuelta, tituloDeVueltas, vueltasDePista } from './pista';

/** La tarjeta de la vuelta de pista; si el paso no es de pista o no hay vuelta recién hecha, la capa del kit. */
export function capaDePista(seq: Secuencia, kit: ReactNode | null): ReactNode | null {
  if (seq.cuenta != null || seq.go || !esVueltaDePista(seq.paso)) return kit;
  const banner = bannerDeVuelta(seq.estado, seq.paso, seq.plan);
  return banner ? <CaraKm banner={banner} /> : kit;
}

/** La página Vueltas de una pista: cada vuelta contra el ritmo del paso, la que se corre encima, todas como «v N». */
export function PaginaVueltasDePista({ seq }: { seq: Secuencia }) {
  const { D } = useGarmin();
  const { objetivo, enCurso } = vueltasDe(seq);
  const vueltas = vueltasDePista(seq.estado.vueltas, seq.paso, seq.plan);
  const { titulo, filas } = filasDeVueltas(vueltas, objetivo, enCurso ? VUELTAS_VISIBLES - 1 : VUELTAS_VISIBLES);
  return <PintaDisposicion d={disponerVueltas(tituloDeVueltas(titulo), filas.map(rotuloDeVuelta), enCurso ? rotuloDeVuelta(enCurso) : null, D)} />;
}

/** Las cuatro páginas de UP/DOWN con la de Vueltas de pista (`paginas` de `VistaGarmin`). */
export function paginasDePista(estructura?: (i: number) => FilaEstructura[]) {
  return (seq: Secuencia, cara: ReactNode): PaginaGarmin[] => [
    { id: 'paso', titulo: 'Paso', contenido: cara },
    { id: 'datos', titulo: 'Datos', contenido: <PaginaDatos seq={seq} /> },
    { id: 'vueltas', titulo: 'Vueltas', contenido: <PaginaVueltasDePista seq={seq} /> },
    { id: 'estructura', titulo: 'Estructura', contenido: <PaginaEstructura seq={seq} estructura={estructura} /> },
  ];
}
