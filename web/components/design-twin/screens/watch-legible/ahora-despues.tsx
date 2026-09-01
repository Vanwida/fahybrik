'use client';

// (3) «Ahora / Después» — página fija, la misma en las nueve familias.
//
// No existe hoy: EMOM y AMRAP la resuelven a su manera («ronda X de Y» ya
// avisa de qué viene) y tabata y death-by no dicen nada del tramo siguiente.
// Aquí el sujeto es SIEMPRE lo que viene después — es la pregunta que el
// atleta no puede responder solo, porque «ahora» ya lo está viviendo — y el
// segundo nivel resume dónde está ahora. Un sujeto, un segundo nivel, cero
// tercero: la regla que ya cumplía el sistema actual, aplicada a una página
// que hoy no existe.

import { useEffect } from 'react';
import { Contexto, Lienzo, Numeral, SegundoNivel } from './atomos';

export function AhoraDespues({ onLog }: { onLog: (linea: string) => void }) {
  useEffect(() => {
    onLog('Página fija · igual en las nueve familias');
  }, [onLog]);

  return (
    <Lienzo>
      <Contexto escala="nuevo">Después</Contexto>
      <span style={{ flex: 1 }} />
      <Numeral escala="nuevo" texto="400" unidad="m" />
      <span style={{ flex: 1, maxHeight: 6 }} />
      <span style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>Remo</span>
      <span style={{ flex: 1 }} />
      <SegundoNivel escala="nuevo" etiqueta="Ahora" valor="Burpees" />
    </Lienzo>
  );
}
