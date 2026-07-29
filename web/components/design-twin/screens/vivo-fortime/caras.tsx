'use client';

// EL TRAMO DECIDE LA CARA; EL FORMATO NUNCA SUELTA LA FRANJA.
//
// Girar el móvil no cambia de pantalla ni de estado: cambia de CARA. Y cuál
// sale no lo decide el escenario, lo decide el tramo que tienes delante
// (`caraDeMonitor`, en data.ts):
//
//   con máquina  → CARA DE MONITOR. Estás a un metro de un aparato que canta
//                  metros, ritmo y paladas: esas cifras se merecen la pantalla
//                  entera, y el resto se subordina.
//   sin máquina  → CARA DE FORMATO. Un Run o unos thrusters no tienen monitor
//                  que mirar, así que lo que manda sigue siendo el bloque: el
//                  trabajo delante, la ruta y el reloj.
//
// Por eso una misma reproducción puede cambiar de cara SOLA: al cerrarse el
// remo, el tramo siguiente es un Run y la cara pasa a formato sin que nadie
// toque nada. El cambio es la regla funcionando, no una transición decorativa.

import type { ReactNode } from 'react';
import { Label, RAD, SP } from '../../kit';
import { UMBRAL, reloj, type ItemReal } from '../../datos-reales';
import { hrZone } from '../../sim';
import {
  cadenciaDe,
  cifraEnUnidadDe,
  fcEn,
  medidaEnUnidadDe,
  motorDe,
  objetivoDe,
  quienLoSabe,
  reglaDeSalida,
  ritmoDe,
} from './data';
import { Baldosa, type Celda } from './sujeto';
import { FilaTramo, type Fila } from './ruta';

// ---------------------------------------------------------------------------
// La cara de monitor — solo cuando hay una máquina delante
// ---------------------------------------------------------------------------

/**
 * El campo del metro. El sujeto es la medida que sube, y sube ENORME: en
 * horizontal el ancho sobra (756 pt), así que la cifra se queda el campo
 * izquierdo entero y el aparato canta a su lado.
 *
 * `t-readout-hero` (72 pt) es el tope de la escala mono de la app. No se
 * inventa un tamaño mayor aquí: si esta cara pide un escalón más de monitor,
 * el sitio es `twin.css` y con él Theme.swift, no una pantalla suelta.
 */
export function CaraMonitor({ item, parcialS }: { item: ItemReal; parcialS: number }) {
  const motor = motorDe(item);
  const { texto, valor } = objetivoDe(item);
  // El llamador ya comprobó `caraDeMonitor`; esto es la red, no la lógica.
  if (!motor || !texto || !valor) return null;

  const metros = motor.metrosEn(parcialS);
  const cumplido = metros >= valor;
  const ritmo = ritmoDe(item, metros, parcialS);
  const cadencia = cadenciaDe(item);

  const railes: Celda[] = [];
  if (ritmo) railes.push({ label: 'Ritmo', valor: ritmo.valor, unidad: ritmo.unidad });
  if (cadencia) railes.push({ label: 'Paladas', valor: cadencia.valor, unidad: cadencia.unidad });
  railes.push(celdaPulso(parcialS, 'Pulso'));
  railes.push({ label: 'Aquí', valor: reloj(parcialS) });

  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', gap: SP.m, padding: `${SP.s}px ${SP.m}px` }}>
      <div
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <Label size={10}>Llevas</Label>
        <span className="t-readout-hero" style={{ color: 'var(--twin-fg)' }}>
          {cifraEnUnidadDe(texto, metros)}
        </span>
        {/* Al pasar del objetivo la cifra NO se topa: sigue, y esta línea
            cambia de voz. Un «quedan -14 m» sería el redondeo por la puerta
            de atrás. */}
        <span className="t-readout-s" style={{ color: cumplido ? 'var(--twin-ok)' : 'var(--twin-muted)' }}>
          {cumplido ? `${texto} hechos · suelta` : `quedan ${medidaEnUnidadDe(texto, valor - metros)}`}
        </span>
        <span className="t-headline-m" style={{ marginTop: SP.xs }}>
          {item.nombre}
        </span>
        <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
          {`lo mide ${quienLoSabe(item)} · ${reglaDeSalida(item)}`}
        </span>
      </div>
      <div style={{ width: 210, flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: SP.xs }}>
        {railes.map((c) => (
          <Baldosa key={c.label} celda={c} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El suceso, por encima de la cara
// ---------------------------------------------------------------------------

/**
 * La banda del cruce: el tachado con lo MEDIDO, encima de lo que estuvieras
 * mirando. Reutiliza la fila de la ruta a propósito — lo que canta la banda y
 * lo que queda escrito en la ruta tienen que ser literalmente lo mismo.
 */
export function BandaSuceso({ fila }: { fila: Fila }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: SP.m,
        right: SP.m,
        top: SP.s,
        zIndex: 2,
        borderRadius: RAD.l,
        overflow: 'hidden',
        background: 'var(--twin-surface-elevated)',
        border: '1px solid color-mix(in srgb, var(--twin-ok) 55%, transparent)',
        boxShadow: 'var(--twin-shadow-hero)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.s, padding: `${SP.s}px ${SP.m}px 0` }}>
        <Label size={9} color="var(--twin-ok)">
          Hecha
        </Label>
      </div>
      <FilaTramo fila={fila} alto={38} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// La cara de formato — el HUD del bloque, recompuesto a lo ancho
// ---------------------------------------------------------------------------

/**
 * Sin máquina manda el bloque, igual que en vertical. Lo único que cambia es
 * el plegado: lo que en retrato se apila (sujeto arriba, ruta debajo) aquí se
 * reparte en dos campos, porque el alto es el recurso escaso y el ancho sobra.
 */
export function CaraFormato({ sujeto, lateral }: { sujeto: ReactNode; lateral: ReactNode }) {
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', gap: SP.m, padding: `${SP.s}px ${SP.m}px` }}>
      <div style={{ flex: '1 1 58%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: SP.s }}>
        {sujeto}
      </div>
      <div style={{ flex: '1 1 42%', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: SP.s }}>
        {lateral}
      </div>
    </div>
  );
}

/** La línea de apoyo del lateral (proyección, aviso): una sola voz. */
export function NotaLateral({ children, tono = 'muted' }: { children: ReactNode; tono?: 'muted' | 'accent' }) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        textAlign: 'center',
        font: '500 12px/1.3 var(--twin-font-sans)',
        color: tono === 'accent' ? 'var(--twin-accent-text)' : 'var(--twin-muted)',
      }}
    >
      {children}
    </div>
  );
}

/**
 * El pulso con su zona. Vive aquí y lo usan las DOS caras: el mismo pulso no
 * puede salir con zona al girar el móvil y sin ella al volver (§0).
 *
 * La zona se ancla en `UMBRAL`, que hoy es SIEMPRE estimado en toda la base.
 * En vivo va sin marcar, como en la app: lo que viaja marcado hasta el coach
 * es la etiqueta del resumen, no el chip que miras mientras remas.
 */
export function celdaPulso(parcialS: number, label = 'FC'): Celda {
  const fc = fcEn(parcialS);
  return { label, valor: String(fc), unidad: 'ppm', zona: hrZone(fc, UMBRAL.ppm) };
}
