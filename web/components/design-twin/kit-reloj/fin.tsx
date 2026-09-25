'use client';

// EL FINAL — la sesión acaba y la muñeca lo dice (P9, P13).
//
// El final natural TIENE pantalla (hoy se congela la lámina y los toques
// siguen grabando vueltas fantasma, P0-1). Dice si está completa o parcial, y
// por qué — lo decide lo hecho (`completitud`), nunca un `.partial` cableado
// (P0-2). Guardar, o Seguir: sigue grabando un enfriamiento libre. Tras
// «Terminar y guardar» (ya confirmado) no pregunta otra vez: dice cómo quedó y
// sigue sola. Si se guardó sola (quieto tras «Seguir»), lo dice.

import { useEffect } from 'react';
import type { Completitud } from './despues';
import type { Emision } from './eventos';
import type { GestoGuion } from './gestos';
import { Pila } from './pila';
import { Columna } from './pasos';
import { BotonAccion, Nota } from './piezas';
import { fmtDistancia, fmtDuracion, fmtReloj } from './reglas';
import { ANCHO_UTIL, C, FILA, T, cuerpoQueCabe } from './tokens';

const SIN_LADOS = 'La sesión ya terminó: no hay Controles ni Ahora suena';

function Sello() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10.5" fill="none" stroke={C.tinta2} strokeWidth="1.6" />
      <path d="M7.5 12.5 10.3 15.3 16.5 9" fill="none" stroke={C.tinta} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ESTADO = { completa: 'Completa', parcial: 'Parcial', libre: 'Libre' } as const;

/** «Completa · 6 de 6 series», «Parcial · 4 de 6 series», «Libre · 5,21 km». */
export function lineaCompletitud(c: Completitud, metros: number | null, libreS = 0): string {
  const d = metros != null ? fmtDistancia(metros) : null;
  const detalle = libreS > 0 ? `+ ${fmtReloj(libreS)} libre` : c.estado === 'libre' ? (d ? `${d.valor} ${d.unidad}` : null) : c.cuenta;
  return detalle ? `${ESTADO[c.estado]} · ${detalle}` : ESTADO[c.estado];
}

export function Completada({
  natural,
  completitud,
  metros,
  libreS,
  solaTrasS = null,
  onGuardar,
  onSeguir,
  onSigue,
  ultimo,
  guion,
  onLog,
}: {
  /** Final natural: se decide aquí (Guardar / Seguir). Si no, ya se confirmó «Terminar y guardar». */
  natural: boolean;
  completitud: Completitud;
  metros: number | null;
  libreS: number;
  /** Se guardó sola tras este rato quieto (el enfriamiento libre tras «Seguir»). */
  solaTrasS?: number | null;
  onGuardar: () => void;
  onSeguir: () => void;
  /** Cuando no hay nada que decidir: pasa sola a lo siguiente (el RPE). */
  onSigue: () => void;
  ultimo: Emision | null;
  guion?: Array<{ en: number; gesto: GestoGuion }>;
  onLog: (l: string) => void;
}) {
  const decide = natural && libreS === 0 && solaTrasS == null;
  useEffect(() => {
    if (decide) return;
    const t = setTimeout(onSigue, 2400);
    return () => clearTimeout(t);
    // Una vez por montaje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const titulo = natural ? 'Sesión completada' : 'Sesión terminada';
  const linea = lineaCompletitud(completitud, metros, libreS);
  return (
    <Pila
      paginas={[
        {
          id: 'fin',
          titulo,
          contenido: (
            <Columna estilo={{ justifyContent: 'center', gap: 6 }}>
              <Sello />
              <span style={{ fontSize: cuerpoQueCabe(titulo, T.tercero.cuerpo, ANCHO_UTIL), fontWeight: 600, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{titulo}</span>
              <Nota tono={C.tinta}>{linea}</Nota>
              {completitud.motivo ? <Nota>{completitud.motivo}</Nota> : null}
              {solaTrasS != null ? <Nota>{`Guardada sola · ${fmtDuracion(solaTrasS)} sin moverte`}</Nota> : null}
              {decide ? (
                <div style={{ display: 'flex', gap: 6, width: '100%', height: FILA.boton, alignItems: 'center', padding: '0 4px', boxSizing: 'border-box', marginTop: 6 }}>
                  <BotonAccion etiqueta="Seguir" variante="superficie" ancho={80} onPulsa={onSeguir} />
                  <BotonAccion etiqueta="Guardar" ancho={98} onPulsa={onGuardar} />
                </div>
              ) : null}
            </Columna>
          ),
        },
      ]}
      accion={decide ? { etiqueta: 'guardar', hacer: onGuardar } : null}
      ultimo={ultimo}
      guion={guion}
      sinLados={SIN_LADOS}
      onLog={onLog}
    />
  );
}
