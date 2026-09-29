'use client';

// LAS CARAS DE DESPUÉS, PINTADAS — cada una es su disposición (`fin.ts`, `rpe.ts`,
// `lista.ts`, `pulso.ts`, `envio.ts`…) sobre el reloj del contexto. Una línea
// por cara: la lógica está en las funciones puras y aquí solo se pinta.
//
//   CaraFin(d)         pinta lo que dibuja el kit (`PintaDisposicion`: líneas,
//                      héroe, pista, sello) y lo que el kit aún no dibuja: las
//                      barras de las zonas de pulso y el glifo del envío.
//   CaraDeFin(haz)     la disposición de un tamaño concreto (`haz(D)`), leída del
//                      reloj en el que se pinta: sirve igual en la carcasa y en
//                      la comparación de los cuatro tamaños.
//   CaraSalida         lo que queda al salir de la app (el reloj vuelve a su esfera).
//
// Todo color pasa por `pinta` (en MIP, `aMip`); ningún tamaño se escribe aquí.
//
// Qué NO hacer: colocar nada a mano (eso es de las disposiciones); usar un color
// de zona para un glifo (los glifos son tinta: su FORMA dice el estado).

import { CG, PintaDisposicion, useGarmin } from '../../kit-garmin';
import type { BarraG, DisposicionFin, GlifoEnvio, GlifoG } from './comun';
import { disponerSalida } from './fin';

/** El trazo de un glifo del envío, en su rejilla de 24. */
const TRAZO_GLIFO = { grosor: 1.9, base: 1.6 } as const;

function Barra({ b }: { b: BarraG }) {
  const { pinta } = useGarmin();
  return (
    <div aria-hidden data-rol="barra" style={{ position: 'absolute', left: b.x, top: b.y, width: b.ancho, height: b.alto, borderRadius: b.alto / 2, background: pinta(CG.carril), overflow: 'hidden' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${b.llena * 100}%`, background: pinta(b.color) }} />
    </div>
  );
}

/** Las formas del envío: el reloj, la nube que sube, el visto, la flecha que repite y el aviso. */
function Forma({ g }: { g: GlifoEnvio }) {
  const { pinta } = useGarmin();
  const tinta = pinta(CG.tinta);
  const p = { fill: 'none', stroke: tinta, strokeWidth: TRAZO_GLIFO.grosor, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (g) {
    case 'visto':
      return (
        <>
          <circle cx="12" cy="12" r="10.5" fill="none" stroke={pinta(CG.tinta2)} strokeWidth={TRAZO_GLIFO.base} />
          <path d="M7.5 12.5 10.3 15.3 16.5 9" {...p} />
        </>
      );
    case 'reloj':
      return (
        <>
          <rect x="6.5" y="6" width="11" height="12" rx="3.2" {...p} />
          <path d="M9 6V3.5h6V6M9 18v2.5h6V18" {...p} />
        </>
      );
    case 'nube':
      return (
        <>
          <path d="M7 18.5h10a4.5 4.5 0 0 0 .7-8.95A6 6 0 0 0 6.2 10.6 4 4 0 0 0 7 18.5Z" {...p} />
          <path d="M12 16v-5.5M9.5 12.8 12 10.3l2.5 2.5" {...p} />
        </>
      );
    case 'reintento':
      return (
        <>
          <path d="M20 12a8 8 0 1 1-2.6-5.9" {...p} />
          <path d="M20 4v5h-5" {...p} />
        </>
      );
    case 'aviso':
      return (
        <>
          <path d="M12 3.5 21.5 20h-19Z" {...p} />
          <path d="M12 10v4.5" {...p} />
          <circle cx="12" cy="17.2" r="1" fill={tinta} />
        </>
      );
  }
}

function Glifo({ g }: { g: GlifoG }) {
  return (
    <svg width={g.talla} height={g.talla} viewBox="0 0 24 24" aria-hidden data-rol="glifo" style={{ position: 'absolute', top: g.y - g.talla / 2, left: '50%', transform: 'translateX(-50%)' }}>
      <Forma g={g.glifo} />
    </svg>
  );
}

/** Pinta una disposición de después: lo del kit y, si la cara los lleva, sus barras y su glifo. */
export function CaraFin({ d }: { d: DisposicionFin }) {
  return (
    <>
      <PintaDisposicion d={d} />
      {d.barras?.map((b, k) => <Barra key={k} b={b} />)}
      {d.glifo ? <Glifo g={d.glifo} /> : null}
    </>
  );
}

/** La cara de un tamaño: `haz` recibe el diámetro del reloj en el que se pinta. */
export function CaraDeFin({ haz }: { haz: (D: number) => DisposicionFin }) {
  const { D } = useGarmin();
  return <CaraFin d={haz(D)} />;
}

export function CaraSalida() {
  const { D } = useGarmin();
  return <CaraFin d={disponerSalida(D)} />;
}
