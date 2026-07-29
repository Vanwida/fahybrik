'use client';

// (c) EL CAMBIO — el relevo como SUCESO, no como una transición.
//
// Es el único instante del tramo en el que los dos miráis la misma pantalla, a
// un metro, y hay que entenderla de un vistazo: quién entra y a qué.
//
// Quién entra lo dice la PASTILLA, que es donde vive la identidad (naranja tú,
// azul tu pareja). Lo que NO hace ya es teñir el lienzo de esa persona: el
// lienzo es tu zona de pulso, como en las otras nueve vistas en vivo (§10.1).
// Teñir de persona convertía el mismo fondo en dos cosas distintas según la
// pantalla, y el color dejaba de querer decir esfuerzo.
//
// La cuenta es una CUENTA DE AVISO, no una medida: la máquina sabe que los
// metros de su relevo se acabaron, pero no sabe si ya os habéis cambiado de
// asiento. Por eso hay botón. Tocarlo confirma el cambio; si no lo tocáis, tras
// el 1 la vista pasa igualmente a quien entra, porque en el box ya estáis
// remando y nadie va a agacharse a buscar el móvil.

import type { TwinAppearance } from '../../types';
import { Apoyo, EtiquetaSujeto, FilaApoyos, FranjaAccion, MarcoVivo, Numeral } from '../../kit-vivo';
import { useElapsed, useTimeline } from '../../sim';
import { reloj } from '../../datos-reales';
import {
  ApoyoReparto,
  Cromo,
  LienzoVivo,
  MarcadorTramo,
  PastillaPersona,
  pulsoTrasRelevo,
} from './atoms';
import { PAREJA, TRAMO, metrosTexto, relojTramoS, type Segmento } from './data';

/** Los segundos de aviso. Es lo que se tarda en soltar y sentarse. */
export const CUENTA_S = 3;

export function EscenaCambio({
  hechos,
  entra,
  metros,
  onHecho,
  onLog,
  appearance,
}: {
  /** Todo lo remado hasta el cambio, incluido el trozo que se acaba de cerrar. */
  hechos: Segmento[];
  /** El relevo que empieza. */
  entra: Segmento;
  metros: number;
  onHecho: () => void;
  onLog: (linea: string) => void;
  appearance: TwinAppearance;
}) {
  const t = useElapsed();
  const quedan = Math.max(0, CUENTA_S - t);
  const quien = entra.quien;

  // Tras el 1, la vista rota sola a quien entra.
  useTimeline([{ at: CUENTA_S * 1000, run: onHecho }]);

  const suyosM = entra.hastaM - entra.desdeM;
  const faltanM = TRAMO.totalM - metros;

  return (
    <LienzoVivo ppm={pulsoTrasRelevo(hechos)} appearance={appearance}>
      <MarcoVivo
        cromo={
          <Cromo
            relevo={hechos.length + 1}
            relevos={TRAMO.totalM / TRAMO.relevoM}
            onSalir={() => onLog('salir del entreno: se guarda lo remado hasta aquí')}
            onPausa={() => onLog('pausar el tramo')}
          />
        }
        contexto={
          <MarcadorTramo
            hechos={hechos}
            actual={entra}
            metros={metros}
            reloj={reloj(relojTramoS(hechos, entra, metros))}
          />
        }
        sujeto={
          <>
            <EtiquetaSujeto>Relevo</EtiquetaSujeto>
            <PastillaPersona quien={quien} texto={quien === 'tu' ? 'Te toca' : `Entra ${PAREJA}`} />
            <Numeral>{Math.max(1, quedan)}</Numeral>
            <span
              style={{
                font: 'italic 800 20px/1.2 var(--twin-font-sans)',
                color: 'var(--twin-fg)',
              }}
            >
              {metrosTexto(suyosM)} m de remo
            </span>
          </>
        }
        apoyos={
          <FilaApoyos>
            <Apoyo etiqueta="Del tramo" valor={`${metrosTexto(faltanM)} m`} pie="por remar" />
            <ApoyoReparto quien="tu" hechos={hechos} actual={entra} metros={metros} />
            <ApoyoReparto quien="pareja" hechos={hechos} actual={entra} metros={metros} />
          </FilaApoyos>
        }
        accion={<FranjaAccion titulo="Cambio hecho" nota="ya estáis cambiados" unicaSalida onClick={onHecho} />}
      />
    </LienzoVivo>
  );
}
