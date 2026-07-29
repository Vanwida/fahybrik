'use client';

// EL TRAMO DECIDE LA CARA; EL FORMATO NUNCA SUELTA SU CONTEXTO.
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
//
// POR QUÉ APAISADO NO USA `MarcoVivo` (§10.3): la banda del sujeto son 340 pt y
// el lienzo apaisado mide ~390. `MarcoVivo` ya contempla degradar a `centra`
// ahí, pero su degradado es de UNA columna, y un For Time apaisado necesita
// dos: el sujeto a la izquierda y la ruta (o el raíl del monitor) a la derecha.
// Metidos en una sola columna, o se clipa el numeral o desaparece la ruta. Así
// que aquí viven `MarcoPlano` + `DosCampos`, que conservan la VOZ del §10
// (mismo cromo, mismo contexto, mismo numeral, misma franja de acción) y solo
// cambian el reparto del cuerpo. Anotado como hueco del contrato en el informe.

import type { ReactNode } from 'react';
import { RAD, SP } from '../../kit';
import { UMBRAL, reloj, type ItemReal } from '../../datos-reales';
import { hrZone } from '../../sim';
import type { TwinAppearance } from '../../types';
import { Ambiente, Apoyo, BANDA, BandaSujeto, FilaApoyos, colorZona, type Zona } from '../../kit-vivo';
import {
  cadenciaDe,
  cifraEnUnidadDe,
  fcEn,
  motorDe,
  objetivoDe,
  quienLoSabe,
  reglaDeSalida,
  ritmoDe,
} from './data';
import { SujetoMedida } from './sujeto';
import { FilaTramo, type Fila } from './ruta';

/**
 * En apaisado la acción no se encoge hasta dejar de acertarse sudando: baja de
 * 76 a 64, no a 44. Y sigue abajo en las dos caras a propósito — girar no puede
 * mover el botón de sitio.
 */
export const ACCION_APAISADA = 64;

// ---------------------------------------------------------------------------
// Los apoyos — el tercer nivel, con el vocabulario compartido
// ---------------------------------------------------------------------------

/** Una lectura de apoyo, en los términos de `Apoyo` (kit-vivo). */
export interface CeldaApoyo {
  etiqueta: string;
  valor: string;
  tono?: string;
  pie?: string;
}

/**
 * El pulso con su zona. Vive aquí y lo usan las DOS caras: el mismo pulso no
 * puede salir con zona al girar el móvil y sin ella al volver (§0).
 *
 * La zona se ancla en `UMBRAL`, que hoy es SIEMPRE estimado en toda la base.
 * En vivo va sin marcar, como en la app: lo que viaja marcado hasta el coach es
 * la etiqueta del resumen, no el chip que miras mientras remas. El color de la
 * cifra es el de la zona, el mismo que tiñe el lienzo detrás (§10.1).
 */
export function apoyoPulso(parcialS: number, etiqueta = 'Pulso'): CeldaApoyo {
  const fc = fcEn(parcialS);
  const zona = hrZone(fc, UMBRAL.ppm);
  return { etiqueta, valor: String(fc), tono: colorZona(zona), pie: `ppm · Z${zona}` };
}

/**
 * Las lecturas de apoyo. `fila` es lo normal; `rejilla` existe para el raíl del
 * monitor en apaisado, donde el ancho sobra y el alto no: cuatro lecturas
 * apiladas se salen del cuerpo, en 2×2 caben con aire.
 */
export function Apoyos({ celdas, disposicion = 'fila' }: { celdas: CeldaApoyo[]; disposicion?: 'fila' | 'rejilla' }) {
  const celdasEl = celdas.map((c) => <Apoyo key={c.etiqueta} {...c} />);
  if (disposicion === 'fila') return <FilaApoyos>{celdasEl}</FilaApoyos>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, minHeight: 0 }}>
      {celdasEl}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El marco apaisado — la voz del §10 con el cuerpo en dos campos
// ---------------------------------------------------------------------------

/**
 * EL LIENZO — y lo que lo tiñe.
 *
 * `Ambiente` detrás de todo, teñido por la ZONA DE PULSO y por nada más
 * (§10.1). Sin pulso, `zona` es nulo y el lienzo queda neutro: la pantalla
 * sigue teniendo cromo, banda, numeral y acción, así que no es la versión rota
 * de la buena — es la misma diciendo la verdad.
 */
export function Lienzo({
  zona,
  appearance,
  acento = false,
  children,
}: {
  zona: Zona | null;
  appearance: TwinAppearance;
  /** El instante en que algo se logra: el sello de un For Time acabado. */
  acento?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
      <Ambiente zona={zona} appearance={appearance} acento={acento} />
      <div style={{ position: 'relative', height: '100%' }}>{children}</div>
    </div>
  );
}

/**
 * Cromo · contexto · cuerpo · acción. Las mismas cuatro filas de `MarcoVivo`,
 * sin la banda fija del sujeto — para lo que NO es una cara en vivo (la hoja de
 * la ruta) y para el apaisado, donde el cuerpo se parte en dos campos.
 */
export function MarcoPlano({
  cromo,
  contexto,
  cuerpo,
  accion,
  altoAccion = BANDA.accion,
}: {
  cromo: ReactNode;
  contexto: ReactNode;
  cuerpo: ReactNode;
  accion?: ReactNode;
  altoAccion?: number;
}) {
  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        display: 'grid',
        gridTemplateRows: `${BANDA.cromo}px auto minmax(0, 1fr) ${accion ? altoAccion : 0}px`,
        gap: BANDA.hueco,
        padding: BANDA.hueco,
        boxSizing: 'border-box',
        // El contenedor de consulta del que cuelga la escala del numeral: sin
        // él las unidades `cqw`/`cqh` no resuelven y el número se queda en el
        // suelo del clamp.
        containerType: 'size',
      }}
    >
      <div style={{ minHeight: 0, display: 'flex', alignItems: 'center' }}>{cromo}</div>
      <div style={{ minHeight: 0, display: 'flex', alignItems: 'center' }}>{contexto}</div>
      <div style={{ minHeight: 0, display: 'grid' }}>{cuerpo}</div>
      <div style={{ minHeight: 0 }}>{accion}</div>
    </div>
  );
}

/** El cuerpo apaisado: el sujeto a la izquierda, la ruta o el raíl a la derecha. */
export function DosCampos({ izquierda, derecha }: { izquierda: ReactNode; derecha: ReactNode }) {
  return (
    <div style={{ minHeight: 0, display: 'flex', gap: BANDA.hueco }}>
      {/* El numeral escala con SU lienzo, que aquí es la columna y no la
          pantalla: con el contenedor en la raíz, `16cqw` del apaisado entero
          daban 136 pt y el sujeto se comía la acción. */}
      <div style={{ flex: '1 1 58%', minWidth: 0, minHeight: 0, display: 'grid', containerType: 'size' }}>
        {izquierda}
      </div>
      <div
        style={{
          flex: '1 1 42%',
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: SP.s,
        }}
      >
        {derecha}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La cara de monitor — solo cuando hay una máquina delante
// ---------------------------------------------------------------------------

/**
 * El campo del metro. El sujeto es la medida que sube, y sube ENORME: en
 * apaisado el ancho sobra, así que el numeral escala con el lienzo (`cqw`) y el
 * aparato canta en el raíl de al lado.
 *
 * No es un componente: devuelve los dos campos del `MarcoApaisado`, porque el
 * cromo, el contexto y la acción son los MISMOS que en la cara de formato y no
 * pueden escribirse dos veces.
 *
 * Y el sujeto es literalmente `SujetoMedida`, el de retrato. Antes esta cara
 * escribía el suyo y por eso el mismo remo leía «de 1.000 m» de pie y «quedan
 * 201 m» girado: dos grafías del mismo dato (§2).
 */
export function caraMonitor(item: ItemReal, parcialS: number): { izquierda: ReactNode; derecha: ReactNode } | null {
  const motor = motorDe(item);
  const { texto, valor } = objetivoDe(item);
  // El llamador ya comprobó `caraDeMonitor`; esto es la red, no la lógica.
  if (!motor || !texto || !valor) return null;

  const metros = motor.metrosEn(parcialS);
  const ritmo = ritmoDe(item, metros, parcialS);
  const cadencia = cadenciaDe(item);

  const railes: CeldaApoyo[] = [];
  if (ritmo) railes.push({ etiqueta: 'Ritmo', valor: ritmo.valor, pie: ritmo.unidad });
  if (cadencia) railes.push({ etiqueta: 'Paladas', valor: cadencia.valor, pie: cadencia.unidad });
  railes.push(apoyoPulso(parcialS));
  railes.push({ etiqueta: 'Aquí', valor: reloj(parcialS) });

  return {
    izquierda: (
      <BandaSujeto>
        <SujetoMedida
          horizontal
          cifra={cifraEnUnidadDe(texto, metros)}
          objetivo={texto}
          cumplido={metros >= valor}
          titulo={item.nombre}
          regla={`lo mide ${quienLoSabe(item)} · ${reglaDeSalida(item)}`}
        />
      </BandaSujeto>
    ),
    derecha: <Apoyos celdas={railes} disposicion="rejilla" />,
  };
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
        <span className="t-readout-label" style={{ color: 'var(--twin-ok)', letterSpacing: '0.12em' }}>
          Hecha
        </span>
      </div>
      <FilaTramo fila={fila} alto={38} />
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
