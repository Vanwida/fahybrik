'use client';

// (2) El cronómetro en marcha — cruzando de 4 a 5 cifras sin dar un salto.
//
// Arranca en 9:55 y sube: a los cinco segundos entra en el minuto 10 y pasa
// de cuatro cifras a cinco. En HOY eso es cruzar de cubeta (56 → 44 pt, un
// 21 % de golpe, EN MITAD DEL ESFUERZO). En NUEVO el tamaño ya salía del
// ancho disponible, así que un cronómetro de cinco cifras no se lleva una
// sorpresa que uno de cuatro no tuviera: mide lo mismo antes y después del
// minuto 10 porque el ancho que tiene delante no ha cambiado.
//
// Arranca en NUEVO — este escenario no vende el contraste, vende que el
// número deja de dar sustos; volver a HOY (deslizando) es para sentir el
// salto, no el punto de partida.

import { useRef, useState } from 'react';
import { useTicker } from '../../sim';
import { W } from '../watch-live/theme';
import { AccionBanda, Contexto, Lienzo, Numeral, SegundoNivel, VolanteHoyNuevo, type Escala } from './atomos';
import { clock } from './modelo';

const ARRANCA_S = 595; // 9:55 — cinco segundos antes de cruzar a cinco cifras

export function Crono({ onLog }: { onLog: (linea: string) => void }) {
  const [t, setT] = useState(ARRANCA_S);
  const avisado = useRef(false);

  useTicker(true, (s) => {
    const nuevo = ARRANCA_S + s;
    if (nuevo >= 600 && !avisado.current) {
      avisado.current = true;
      onLog('Cruza el minuto 10 · de cuatro a cinco cifras');
    }
    setT(nuevo);
  });

  return (
    <VolanteHoyNuevo inicial="nuevo" onLog={onLog}>
      {(escala: Escala) => (
        <Lienzo>
          <Contexto escala={escala}>Estación 7/8</Contexto>
          <span style={{ flex: 1 }} />
          <Numeral escala={escala} texto={clock(t)} />
          <span style={{ flex: 1 }} />
          <SegundoNivel escala={escala} etiqueta="Reps" valor="18 de 24" color={W.orangeSoft} />
          <AccionBanda escala={escala}>Toca 2 veces</AccionBanda>
        </Lienzo>
      )}
    </VolanteHoyNuevo>
  );
}
