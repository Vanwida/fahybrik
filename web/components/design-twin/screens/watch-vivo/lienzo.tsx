'use client';

// El marco de dos páginas de la propuesta del 29-jul (tarea + cuerpo).
//
// LO QUE ERA Y LO QUE ES: este fichero tenía dentro el numeral, el segundo
// nivel, el tinte, el destello y el degradado, y `watch-resumen` los importaba
// DESDE AQUÍ — una pantalla tirando de otra pantalla. Todo eso vive ahora en
// `kit-watch/`, que es de donde tiran también las nueve vistas por formato.
// Aquí queda sólo lo propio de esta pantalla: que sus páginas son siempre dos y
// que la segunda es fija.
//
// Y ESO es justamente lo que las nueve corrigen. Dos páginas fijas suponen que
// el reloj siempre mide lo mismo, y no es verdad: en cinta y en ergo no ve la
// máquina, y en fuerza no ve ni la carga ni las reps. Ver `kit-watch/modelo.ts`.

import { useState, type ReactNode } from 'react';
import {
  Destello,
  Numeral,
  SegundoNivel,
  ZONA_NOMBRE,
  altoSujeto,
  tinte,
  versales,
  type EstadoDestello,
} from '../../kit-watch';
import { W, zoneColor } from '../watch-live/theme';
import { zonaDe } from './guion';
import type { CSSProperties } from 'react';

export type { EstadoDestello };

/** Los apoyos de este marco son fijos: segundo nivel, acción y dos páginas. */
const APOYOS = { segundo: true, accion: true, nota: false, puntos: true } as const;

export interface MarcoProps {
  /** Banda superior de una línea: dónde estás. */
  contexto: string;
  /** Color que tiñe el fondo en la página de la tarea (zona o recuperación). */
  color: string;
  aro: ReactNode;
  sujeto: ReactNode;
  segundo: ReactNode;
  /** Etiqueta del gesto («TOCA · HECHA»). Sin ella, la página no avanza nada. */
  accion?: string;
  onAvanzar?: () => void;
  /** El pulso: el reloj lo mide siempre, así que la segunda página nunca falta. */
  bpm: number;
  onLog: (linea: string) => void;
  /** Sube este contador para disparar un destello a pantalla completa. */
  destelloN?: number;
  destelloColor?: string;
}

export function Marco({
  contexto,
  color,
  aro,
  sujeto,
  segundo,
  accion,
  onAvanzar,
  bpm,
  onLog,
  destelloN = 0,
  destelloColor = W.orangeSoft,
}: MarcoProps) {
  const [pagina, setPagina] = useState<'tarea' | 'cuerpo'>('tarea');
  const zona = zonaDe(bpm);
  const enCuerpo = pagina === 'cuerpo';
  const tinteActivo = enCuerpo ? zoneColor(zona) : color;

  const cambiarPagina = () => {
    const destino = enCuerpo ? 'tarea' : 'cuerpo';
    setPagina(destino);
    onLog(destino === 'cuerpo' ? 'Página del cuerpo: pulso y zona' : 'Vuelta a la tarea');
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: W.bg, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: tinte(tinteActivo),
          transition: 'background-color 700ms ease',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: DEGRADADO }} />
      {aro}
      <Destello n={destelloN} color={destelloColor} />

      <div style={{ position: 'absolute', inset: 0, padding: RELLENO, boxSizing: 'border-box' }}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <button
            type="button"
            onClick={enCuerpo ? cambiarPagina : onAvanzar}
            disabled={!enCuerpo && !onAvanzar}
            aria-label={enCuerpo ? 'Volver a la tarea' : (accion ?? 'Sin acción')}
            style={{ ...areaPrincipal, cursor: enCuerpo || onAvanzar ? 'pointer' : 'default' }}
          >
            {enCuerpo ? (
              <PaginaCuerpo bpm={bpm} zona={zona} />
            ) : (
              <>
                <span style={contextoEstilo}>{contexto}</span>
                <span style={{ flex: 1 }} />
                {sujeto}
                <span style={{ flex: 1 }} />
                {segundo}
                <span style={{ ...versales, marginTop: 4, opacity: accion ? 1 : 0 }}>{accion ?? '·'}</span>
              </>
            )}
          </button>
          <button type="button" onClick={cambiarPagina} aria-label="Cambiar de página" style={bandaPuntos}>
            <Punto activo={!enCuerpo} />
            <Punto activo={enCuerpo} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * La página del cuerpo. El reloj mide el pulso SIEMPRE (el sensor es suyo), así
 * que esta página existe en los cuatro escenarios y nunca aparece vacía. La
 * zona, en cambio, cuelga de un umbral que hoy es estimado en toda la base, y
 * eso viaja escrito: el atleta tiene que poder distinguir un dato medido de uno
 * derivado de una estimación.
 */
function PaginaCuerpo({ bpm, zona }: { bpm: number; zona: 1 | 2 | 3 | 4 | 5 }) {
  const texto = String(bpm);
  return (
    <>
      <span style={contextoEstilo}>Pulso</span>
      <span style={{ flex: 1 }} />
      <Numeral texto={texto} alto={altoSujeto(texto, { ...APOYOS, nota: true })} />
      <span style={{ flex: 1 }} />
      <SegundoNivel valor={`Z${zona} ${ZONA_NOMBRE[zona]}`} color={zoneColor(zona)} />
      <span style={{ ...versales, marginTop: 4 }}>ppm · umbral estimado</span>
    </>
  );
}

function Punto({ activo }: { activo: boolean }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: activo ? W.ink : 'rgba(255,255,255,0.28)',
        transition: 'background-color 200ms ease',
      }}
    />
  );
}

/**
 * El sujeto de este marco. El tamaño ya NO se escribe a mano en cada escenario
 * (estaba en 94, 108 y 115 pt según quién lo pintara): sale del presupuesto del
 * lienzo con los apoyos fijos de este marco.
 */
export function Sujeto({
  texto,
  unidad,
  color,
  latido,
}: {
  texto: string;
  unidad?: string;
  color?: string;
  latido?: number;
}) {
  return (
    <Numeral
      texto={texto}
      unidad={unidad}
      alto={altoSujeto(texto, APOYOS, unidad)}
      color={color}
      latido={latido}
    />
  );
}

const contextoEstilo: CSSProperties = {
  ...versales,
  color: 'rgba(255,255,255,0.85)',
  flex: '0 0 auto',
};

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
  padding: 0,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
};
