'use client';

// (1) Antes / después — el mismo instante, dos escalas.
//
// Es el escenario que da permiso a todos los demás: sin ver «hoy» al lado, un
// «nuevo» más grande no se distingue de un capricho. La página arranca en HOY
// (el fallo primero) y se pasa a NUEVO deslizando o tocando la etiqueta — las
// DOS a tamaño real, nunca una miniatura a ojo (`atomos.tsx#VolanteHoyNuevo`).

import { useState } from 'react';
import { useTicker } from '../../sim';
import { W, zoneColor } from '../watch-live/theme';
import { AccionBanda, Contexto, Lienzo, Nota, Numeral, SegundoNivel, VolanteHoyNuevo, type Escala } from './atomos';
import { ESTACIONES, INSTANTE, clock } from './modelo';

export function AntesDespues({ onLog }: { onLog: (linea: string) => void }) {
  const [t, setT] = useState<number>(INSTANTE.segundosDesde);
  useTicker(true, (s) => setT(INSTANTE.segundosDesde + s));

  const estacion = ESTACIONES[INSTANTE.estacionIndex]!;
  const luego = ESTACIONES[INSTANTE.estacionIndex + 1]!;

  return (
    <VolanteHoyNuevo inicial="hoy" onLog={onLog}>
      {(escala: Escala) => <Pagina escala={escala} contexto={`${estacion} · 4/8`} tiempo={clock(t)} luego={luego} />}
    </VolanteHoyNuevo>
  );
}

function Pagina({
  escala,
  contexto,
  tiempo,
  luego,
}: {
  escala: Escala;
  contexto: string;
  tiempo: string;
  luego: string;
}) {
  return (
    <Lienzo tinte={escala === 'hoy' ? W.bg : `color-mix(in srgb, ${zoneColor(3)} 14%, ${W.bg})`}>
      <Contexto escala={escala}>{contexto}</Contexto>
      <span style={{ flex: 1 }} />
      <Numeral escala={escala} texto={tiempo} />
      <span style={{ flex: 1 }} />
      <SegundoNivel escala={escala} etiqueta="Luego" valor={luego} />
      <AccionBanda escala={escala}>Toca 2 veces</AccionBanda>
      <Nota escala={escala}>Del reloj</Nota>
    </Lienzo>
  );
}
