'use client';

// (c) EL CAMBIO — el relevo como SUCESO, no como una transición.
//
// Es el único instante del tramo en el que los dos miráis la misma pantalla, a
// un metro, y hay que entenderla de un vistazo: quién entra y a qué. Por eso se
// come el lienzo entero y se tiñe del color de quien entra: el móvil cambia de
// color en la mano y eso ya es la mitad del mensaje.
//
// La cuenta es una CUENTA DE AVISO, no una medida: la máquina sabe que los
// metros de su relevo se acabaron, pero no sabe si ya os habéis cambiado de
// asiento. Por eso hay botón. Tocarlo confirma el cambio; si no lo tocáis, tras
// el 1 la vista pasa igualmente a quien entra, porque en el box ya estáis
// remando y nadie va a agacharse a buscar el móvil.

import { CTA, Display, Label, Mono, Pantalla, SP } from '../../kit';
import { useElapsed, useTimeline } from '../../sim';
import { reloj } from '../../datos-reales';
import { BarraPareja } from './atoms';
import {
  COLOR,
  COLOR_TEXTO,
  PAREJA,
  TRAMO,
  metrosTexto,
  relojTramoS,
  type Segmento,
} from './data';

/** Los segundos de aviso. Es lo que se tarda en soltar y sentarse. */
export const CUENTA_S = 3;

export function EscenaCambio({
  hechos,
  entra,
  metros,
  onHecho,
}: {
  /** Todo lo remado hasta el cambio, incluido el trozo que se acaba de cerrar. */
  hechos: Segmento[];
  /** El relevo que empieza. */
  entra: Segmento;
  metros: number;
  onHecho: () => void;
}) {
  const t = useElapsed();
  const quedan = Math.max(0, CUENTA_S - t);
  const quien = entra.quien;
  const color = COLOR[quien];

  // Tras el 1, la vista rota sola a quien entra.
  useTimeline([{ at: CUENTA_S * 1000, run: onHecho }]);

  const suyosM = entra.hastaM - entra.desdeM;
  const faltanM = TRAMO.totalM - metros;

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(to bottom, color-mix(in srgb, ${color} 26%, transparent), transparent 62%)`,
        }}
      />
      <div style={{ position: 'relative', height: '100%' }}>
        <Pantalla accion={<CTA title="CAMBIO HECHO" height={96} onClick={onHecho} />}>
          <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'center', paddingTop: SP.s }}>
            <Label size={11} color={COLOR_TEXTO[quien]}>
              Relevo
            </Label>
          </div>

          <div
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.s }}>
              <Display size={40} color={COLOR_TEXTO[quien]}>
                {quien === 'tu' ? 'Te toca' : `Entra ${PAREJA}`}
              </Display>
              <span
                className="t-readout-hero"
                style={{ fontSize: 'clamp(96px, 26vh, 168px)', color: 'var(--twin-fg)' }}
              >
                {Math.max(1, quedan)}
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <Mono size={26} weight={800} color={COLOR_TEXTO[quien]}>
                  {metrosTexto(suyosM)}
                </Mono>
                <span style={{ font: '600 16px/1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
                  m de remo
                </span>
              </div>
              <span style={{ font: '500 13px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                quedan {metrosTexto(faltanM)} m del tramo
              </span>
            </div>
          </div>

          <BarraPareja
            hechos={hechos}
            actual={entra}
            metros={metros}
            reloj={reloj(relojTramoS(hechos, entra, metros))}
          />
        </Pantalla>
      </div>
    </div>
  );
}
