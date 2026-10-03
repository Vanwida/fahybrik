'use client';

// LA CABECERA DEL BLOQUE (`CabeceraDelBloque`): el nombre del bloque que puso el
// coach, «Semana N de M», el rango de fechas y la línea del coach para la semana.
// La voz del coach va marcada con su filo (el sistema no escribe ahí) y se corta
// a dos líneas; si se extiende, un toque la abre entera.
//
// Aquí vive lo que el Swift resolvía con el gesto de deslizar y no enseñaba: las
// dos flechas de semana. «›» lleva un candado cuando el club bloquea la semana que
// viene (y al tocarlo dice por qué): no es un botón muerto. «‹» solo existe
// hojeando.

import { useLayoutEffect, useRef, useState } from 'react';
import { BotonCromo } from '../hoy-dia/cromo';
import { Esqueleto, Etiqueta } from '../../kit-dia/piezas';
import { fuente, TAM } from '../../kit-dia/tokens';
import { IcoCandado, IcoChevronDer, IcoChevronIzq } from './iconos';

const LINEAS_CERRADA = 2;

function Intencion({ texto }: { texto: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [desborda, setDesborda] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Se mide cerrada: un texto que cabe en dos líneas no lleva gesto ni pista.
    el.style.setProperty('-webkit-line-clamp', String(LINEAS_CERRADA));
    setDesborda(el.scrollHeight > el.clientHeight + 1);
  }, [texto]);

  const cuerpo = (
    <>
      <span aria-hidden style={{ width: 3, borderRadius: 2, background: 'var(--twin-accent)', flex: '0 0 auto' }} />
      <span
        ref={ref}
        style={{
          flex: 1,
          minWidth: 0,
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: abierta ? 'unset' : LINEAS_CERRADA,
          overflow: 'hidden',
          ...fuente(500, TAM.cuerpo, 1.35),
          color: 'var(--twin-fg)',
          textWrap: 'pretty',
        }}
      >
        {texto}
      </span>
      {desborda || abierta ? (
        <span aria-hidden style={{ alignSelf: 'flex-end', color: 'var(--twin-muted)', display: 'inline-flex', transform: abierta ? 'rotate(-90deg)' : 'rotate(90deg)' }}>
          <IcoChevronDer tam={16} />
        </span>
      ) : null}
    </>
  );
  const estilo = { display: 'flex', gap: 12, alignItems: 'stretch', textAlign: 'left' } as const;

  return desborda || abierta ? (
    <button
      type="button"
      className="pl-btn"
      aria-expanded={abierta}
      aria-label={`Lo que busca tu coach esta semana: ${texto}`}
      onClick={() => setAbierta((a) => !a)}
      style={{ ...estilo, width: '100%', minHeight: 44 }}
    >
      {cuerpo}
    </button>
  ) : (
    <p aria-label={`Lo que busca tu coach esta semana: ${texto}`} style={{ ...estilo, margin: 0 }}>
      {cuerpo}
    </p>
  );
}

export interface CabeceraProps {
  /** Lo que el coach le puso al bloque. Sin él, «Tu plan». */
  nombreBloque: string | null;
  titulo: string;
  /** «Del 28 sep al 4 oct». */
  rango: string | null;
  intencion: string | null;
  /** Hojeando otra semana: hay «‹», que también es la vuelta a esta semana (no hay pastilla que lo repita). */
  hojeando: boolean;
  /** Hay una semana más adelante que ver. */
  puedeAdelante: boolean;
  /** …pero el club la bloquea: el «›» lleva candado. */
  adelanteBloqueado: boolean;
  onAtras: () => void;
  onAdelante: () => void;
  /** Mientras la semana que se mira carga: el título es real y el resto, esqueleto. */
  cargando?: boolean;
}

export function Cabecera(p: CabeceraProps) {
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {p.cargando ? (
        <span style={{ minHeight: 18, display: 'flex', alignItems: 'center' }}>
          <Esqueleto ancho={150} alto={15} radio={5} />
        </span>
      ) : (
        <Etiqueta
          color="var(--twin-accent-text)"
          style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', overflowWrap: 'anywhere' }}
        >
          {p.nombreBloque ?? 'Tu plan'}
        </Etiqueta>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginRight: -8 }}>
        <h1 style={{ margin: 0, ...fuente(800, TAM.saludo, 1.1, true), letterSpacing: '-0.015em', color: 'var(--twin-fg)', textWrap: 'balance' }}>
          {p.titulo}
        </h1>
        <div style={{ display: 'flex', flex: '0 0 auto' }}>
          {p.hojeando ? (
            <BotonCromo etiqueta="Semana anterior" onClick={p.onAtras}>
              <IcoChevronIzq tam={18} />
            </BotonCromo>
          ) : (
            <span style={{ width: 48 }} />
          )}
          {p.puedeAdelante || p.adelanteBloqueado ? (
            <BotonCromo
              etiqueta={p.adelanteBloqueado ? 'Semana siguiente, bloqueada por tu club' : 'Semana siguiente'}
              onClick={p.onAdelante}
            >
              {p.adelanteBloqueado ? <IcoCandado tam={18} /> : <IcoChevronDer tam={18} />}
            </BotonCromo>
          ) : p.hojeando ? (
            // Sin más semanas por delante el «›» se queda en su sitio, apagado: el «‹» no flota lejos del margen.
            <BotonCromo etiqueta="Semana siguiente: no hay más semanas" onClick={() => undefined} apagado>
              <IcoChevronDer tam={18} />
            </BotonCromo>
          ) : (
            <span style={{ width: 48 }} />
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 24 }}>
        {p.cargando ? (
          <Esqueleto ancho={130} alto={15} radio={5} />
        ) : p.rango ? (
          <span style={{ ...fuente(600, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{p.rango}</span>
        ) : (
          <span />
        )}
      </div>
      {p.cargando ? (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Esqueleto alto={17} radio={5} />
          <Esqueleto ancho="70%" alto={17} radio={5} />
        </div>
      ) : p.intencion ? (
        <div style={{ marginTop: 8 }}>
          <Intencion texto={p.intencion} />
        </div>
      ) : null}
    </header>
  );
}

/** La cabecera en frío: la misma silueta (etiqueta, título, rango, dos líneas de la voz del coach). */
export function CabeceraEsqueleto() {
  return (
    <header aria-hidden style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ minHeight: 18, display: 'flex', alignItems: 'center' }}>
        <Esqueleto ancho={150} alto={15} radio={5} />
      </span>
      <span style={{ minHeight: 48, display: 'flex', alignItems: 'center' }}>
        <Esqueleto ancho={220} alto={32} radio={8} />
      </span>
      <span style={{ minHeight: 24, display: 'flex', alignItems: 'center' }}>
        <Esqueleto ancho={130} alto={15} radio={5} />
      </span>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Esqueleto alto={17} radio={5} />
        <Esqueleto ancho="70%" alto={17} radio={5} />
      </div>
    </header>
  );
}
