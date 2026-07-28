'use client';

// RunRouteMapView — el mapa vivo de la carrera: la traza recorrida en naranja
// Fabrik siguiendo al atleta, con la insignia HONESTA de señal. No es
// interactivo (es superficie de vistazo, no un mapa para arrastrar).
//
// Espejo de ios/FAHYBRIK/Workout/Outdoor/RunRouteMapView.swift, con UNA
// diferencia inevitable: allí el fondo son teselas de MapKit; aquí es un lienzo
// propio (rejilla de calles sobre surfaceSunken), porque el doble no llama a
// servicios externos. La traza, el punto de cabeza y la insignia sí son 1:1.

import type { CalidadGPS } from './data';
import { ETIQUETA_GPS, trazaHasta } from './data';
import { Icono, type NombreIcono } from './atoms';

/** Ventana de seguimiento: ~450 m de ancho, como el span del mapa de la app. */
const PX_POR_M = 0.9;
const VB_W = 402;
const VB_H = 300;
/** Separación de la rejilla de calles del lienzo, en metros. */
const CALLE_M = 90;

export function MapaRuta({
  metros,
  calidad,
  pausado,
  alto,
}: {
  metros: number;
  calidad: CalidadGPS;
  pausado: boolean;
  alto: number | string;
}) {
  const traza = trazaHasta(metros);
  const cabeza = traza[traza.length - 1];
  const dx = VB_W / 2 - cabeza.x * PX_POR_M;
  const dy = VB_H / 2 - cabeza.y * PX_POR_M;

  const desde = (v: number) => Math.floor((v - 600) / CALLE_M) * CALLE_M;
  const calles: number[] = [];
  for (let i = 0; i < 14; i += 1) calles.push(i * CALLE_M);

  const puntos = traza.map((p) => `${(p.x * PX_POR_M).toFixed(1)},${(p.y * PX_POR_M).toFixed(1)}`).join(' ');

  return (
    <div
      style={{
        position: 'relative',
        height: alto,
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--twin-surface-sunken)',
        border: '1px solid var(--twin-hairline)',
        flex: '0 0 auto',
      }}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ display: 'block', width: '100%', height: '100%' }}
        aria-hidden
      >
        <g transform={`translate(${dx.toFixed(1)} ${dy.toFixed(1)})`}>
          {/* Rejilla de calles: da lectura de ciudad sin depender de teselas */}
          {calles.map((c) => {
            const x = (desde(cabeza.x) + c) * PX_POR_M;
            const y = (desde(cabeza.y) + c) * PX_POR_M;
            const x0 = desde(cabeza.x) * PX_POR_M;
            const y0 = desde(cabeza.y) * PX_POR_M;
            const largo = 14 * CALLE_M * PX_POR_M;
            const gorda = c % (CALLE_M * 4) === 0;
            return (
              <g key={c} stroke="var(--twin-hairline)" strokeWidth={gorda ? 6 : 2} opacity={gorda ? 0.8 : 0.55}>
                <line x1={x} y1={y0} x2={x} y2={y0 + largo} />
                <line x1={x0} y1={y} x2={x0 + largo} y2={y} />
              </g>
            );
          })}

          {traza.length >= 2 && (
            <polyline
              points={puntos}
              fill="none"
              stroke="var(--twin-accent)"
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Punto de cabeza: relleno mientras corre, hueco en (auto)pausa */}
          <circle cx={cabeza.x * PX_POR_M} cy={cabeza.y * PX_POR_M} r={13} fill="var(--twin-accent)" opacity={0.22} />
          <circle
            cx={cabeza.x * PX_POR_M}
            cy={cabeza.y * PX_POR_M}
            r={7}
            fill={pausado ? 'var(--twin-surface)' : 'var(--twin-accent)'}
            stroke={pausado ? 'var(--twin-accent)' : 'rgba(255,255,255,0.9)'}
            strokeWidth={pausado ? 2.5 : 2}
          />
        </g>
      </svg>

      <div style={{ position: 'absolute', top: 8, left: 8 }}>
        <InsigniaGPS calidad={calidad} />
      </div>
    </div>
  );
}

/** GPSQualityBadge — nunca promete de más: fuerte / débil / buscando. */
export function InsigniaGPS({ calidad }: { calidad: CalidadGPS }) {
  const tinte =
    calidad === 'fuerte' ? 'var(--twin-ok)' : calidad === 'debil' ? 'var(--twin-warning)' : 'var(--twin-muted)';
  const icono: NombreIcono =
    calidad === 'fuerte' ? 'location-fill' : calidad === 'debil' ? 'location' : 'location-slash';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 8px',
        borderRadius: 9999,
        color: tinte,
        background: 'color-mix(in srgb, var(--twin-surface) 92%, transparent)',
        border: `1px solid color-mix(in srgb, ${tinte} 35%, transparent)`,
      }}
    >
      <Icono nombre={icono} size={11} />
      <span style={{ font: '600 12px/1 var(--twin-font-sans)' }}>{ETIQUETA_GPS[calidad]}</span>
    </span>
  );
}
