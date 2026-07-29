'use client';

// El marco del resumen en la muñeca.
//
// Reusa el lenguaje que ya construyó `watch-vivo` —el numeral, el segundo
// nivel, el tinte de zona, el aro del bisel— y cambia lo único que de verdad
// cambia: en vivo hay dos páginas fijas (la tarea y el cuerpo) porque en vivo
// sólo hay dos cosas; en un resumen hay tantas como lecturas honestas tenga esa
// carrera, y las decide el dato, no el layout.
//
// La regla se mantiene entera: **un sujeto por página, y ni un tercer nivel.**
// Lo que no cabe no encoge — pasa a la página siguiente. Es lo que obliga a
// elegir el único número que cuenta, que es justo lo que el reloj de Apple no
// hace cuando escribe TIME, DISTANCE, PACE y CADENCE una debajo de otra.

import { useState, type CSSProperties } from 'react';
import { W, zoneColor } from '../watch-live/theme';
import { AroTramos } from '../watch-vivo/aro';
import { SegundoNivel, Sujeto, tinte } from '../watch-vivo/lienzo';
import type { Tramo } from '../../tramos';

export interface Pagina {
  /** Banda superior de una línea: qué estás leyendo. */
  contexto: string;
  sujeto: string;
  unidad?: string;
  /** El segundo nivel, y no hay tercero. */
  segundo?: string;
  etiquetaSegundo?: string;
  /** Versales al pie: la nota de honestidad o la procedencia. */
  nota?: string;
  tono?: string;
}

/** Tope del tinte de estado — el mismo que el marco en vivo, por la misma razón. */
const TINTE_MAX = 38;
/** Alto óptico del sujeto. Cabe una cifra de 4-5 glifos a distancia de brazo. */
const ALTO_SUJETO = 92;

export function MarcoResumen({
  paginas,
  zona,
  tramos,
  onLog,
}: {
  paginas: Pagina[];
  /** Sin ancla de FC no hay tinte: el color es un dato (§10.1). */
  zona: 1 | 2 | 3 | 4 | 5 | null;
  tramos: Tramo[];
  onLog: (linea: string) => void;
}) {
  const [i, setI] = useState(0);
  const p = paginas[i] ?? paginas[0]!;

  const avanzar = () => {
    const siguiente = (i + 1) % paginas.length;
    setI(siguiente);
    onLog(`Página ${siguiente + 1} de ${paginas.length}: ${paginas[siguiente]!.contexto}`);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: W.bg, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: zona ? tinte(zoneColor(zona), TINTE_MAX) : W.bg,
          transition: 'background-color 700ms ease',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: DEGRADADO }} />
      <AroTramos tramos={tramos} />

      <div style={{ position: 'absolute', inset: 0, padding: RELLENO, boxSizing: 'border-box' }}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <button type="button" onClick={avanzar} aria-label={`${p.contexto}. Siguiente página`} style={areaPrincipal}>
            <span style={contextoEstilo}>{p.contexto}</span>
            <span style={{ flex: 1 }} />
            <Sujeto texto={p.sujeto} unidad={p.unidad} alto={ALTO_SUJETO} color={p.tono ?? W.ink} />
            <span style={{ flex: 1 }} />
            {p.segundo ? <SegundoNivel etiqueta={p.etiquetaSegundo} valor={p.segundo} /> : null}
            <span style={{ ...versales, marginTop: 4, opacity: p.nota ? 1 : 0 }}>{p.nota ?? '·'}</span>
          </button>
          <div style={bandaPuntos}>
            {paginas.map((_, n) => (
              <span
                key={n}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: n === i ? W.ink : 'rgba(255,255,255,0.28)',
                  transition: 'background-color 200ms ease',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const versales: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  color: W.dim,
  whiteSpace: 'nowrap',
};

const contextoEstilo: CSSProperties = { ...versales, color: 'rgba(255,255,255,0.85)', flex: '0 0 auto' };

const DEGRADADO =
  'linear-gradient(180deg, #000 0%, rgba(0,0,0,0.80) 14%, rgba(0,0,0,0) 46%, rgba(0,0,0,0.72) 74%, #000 100%)';

const RELLENO =
  'var(--twin-safe-top) calc(var(--twin-safe-right) + 2px) var(--twin-safe-bottom) calc(var(--twin-safe-left) + 2px)';

const areaPrincipal: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '100%',
  padding: 0,
  border: 0,
  background: 'transparent',
  color: W.ink,
  font: 'inherit',
  textAlign: 'center',
  cursor: 'pointer',
};

const bandaPuntos: CSSProperties = {
  flex: '0 0 auto',
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  width: '100%',
};
