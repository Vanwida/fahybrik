'use client';

// LOS CUATRO TAMAÑOS A LA VEZ — la misma cara a 454, 390, 260 y 218, cada
// una a sus píxeles (1:1) y con su color (en MIP, `aMip`). Es donde se juzga
// que el diseño es proporcional de verdad: si algo se corta a 218, aquí se ve.
//
// Sin botones ni estado propio: se le pasa qué pintar (`children(tamano)`),
// normalmente `CaraDelVivo` de un motor congelado.

import type { ReactNode } from 'react';
import { useEncaje } from './carcasa';
import { PantallaGarmin, entornoDe } from './pintar';
import { ESTUDIO, TAMANOS, tinteDeFondo, type Tamano } from './tokens';

export function ComparaTamanos({ children, tinte }: { children: (t: Tamano) => ReactNode; tinte?: string | null }) {
  const [a, b, c, d] = TAMANOS as [Tamano, Tamano, Tamano, Tamano];
  const hueco = ESTUDIO.comparacion;
  const rotulo = ESTUDIO.lector.cuerpo * 2;
  const ancho = a.D + b.D + hueco;
  const alto = a.D + c.D + hueco + 2 * rotulo;
  const { ref, escala } = useEncaje(ancho, alto);
  const reloj = (t: Tamano) => (
    <figure key={t.D} style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: ESTUDIO.hueco / 2 }}>
      <PantallaGarmin entorno={entornoDe(t.D)} fondo={tinteDeFondo(tinte ?? null, t.tec)}>
        {children(t)}
      </PantallaGarmin>
      <figcaption style={{ fontSize: ESTUDIO.lector.cuerpo, color: ESTUDIO.lector.color, fontFamily: 'var(--twin-font-sans)' }}>
        {t.D} px · {t.tec === 'mip' ? 'MIP 64 colores' : 'AMOLED'} · {t.relojes}
      </figcaption>
    </figure>
  );
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      <div style={{ transform: `scale(${escala})`, display: 'grid', gridTemplateColumns: 'auto auto', gap: hueco, alignItems: 'center', justifyItems: 'center' }}>
        {[a, b, c, d].map(reloj)}
      </div>
    </div>
  );
}
