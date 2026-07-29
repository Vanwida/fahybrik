'use client';

// (b) TE TOCA A TI — el sujeto son los metros que te quedan de TU relevo.
//
// No el total conjunto (ese es el marcador, y vive en la fila de contexto), no
// el reloj: los metros que faltan para soltar. Es la única cifra que decide lo
// que haces con el siguiente tirón, y baja sola, que es lo que hace que
// aprietes.
//
// Tu ritmo sí va contra el objetivo del tramo, porque aquí el objetivo es tuyo
// de verdad. Y si el monitor todavía no da ritmo (los primeros tirones), no se
// inventa uno: se dice que aún no lo hay (§7).

import { Delta, FilaApoyos, FranjaAccion, EtiquetaSujeto, MarcoVivo, Numeral, Apoyo } from '../../kit-vivo';
import { reloj } from '../../datos-reales';
import { useElapsed, useTimeline } from '../../sim';
import {
  ApoyoPulso,
  ApoyoReparto,
  Cromo,
  FranjaPareja,
  LienzoVivo,
  MarcadorTramo,
  UnidadSujeto,
  type EscenaLegVista,
  type EstadoPareja,
} from './atoms';
import {
  TRAMO,
  estimaSalidaS,
  metrosEn,
  metrosTexto,
  relojTramoS,
  ritmoCifras,
  ritmoS500,
  pulsoRemando,
  velocidad,
  type Segmento,
} from './data';

/**
 * Metros de TU relevo que hacen falta para que el monitor dé un ritmo con el
 * que se pueda contar (dos tirones largos).
 *
 * Se mide en metros y no en segundos desde que se abrió la pantalla a
 * propósito: lo que da o no da ritmo es la máquina, no el móvil. Si vuelves a
 * esta vista a mitad del relevo, el ritmo está ahí — que es lo que pasa de
 * verdad, porque el monitor lleva contando desde antes.
 */
const METROS_PARA_RITMO = 18;

export function EscenaRemas({ hechos, actual, desdeM, onRelevo, onLog, appearance }: EscenaLegVista) {
  const t = useElapsed();
  const metros = Math.min(actual.hastaM, metrosEn(desdeM, actual.quien, t));
  const restanteM = Math.max(0, actual.hastaM - metros);
  const hechoM = metros - actual.desdeM;
  const largoM = actual.hastaM - actual.desdeM;
  const ppm = pulsoRemando(hechoM / largoM);

  useTimeline([
    {
      at: Math.max(0, estimaSalidaS(actual.hastaM - desdeM, actual.quien) * 1000),
      run: () => onRelevo(actual.hastaM),
    },
  ]);

  const s500 = ritmoS500(actual.quien);
  const hayRitmo = hechoM >= METROS_PARA_RITMO;

  return (
    <LienzoVivo ppm={ppm} appearance={appearance}>
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
            actual={actual}
            metros={metros}
            reloj={reloj(relojTramoS(hechos, actual, metros))}
          />
        }
        sujeto={
          <>
            <EtiquetaSujeto>Te quedan</EtiquetaSujeto>
            <Numeral>
              {metrosTexto(restanteM)}
              <UnidadSujeto>m</UnidadSujeto>
            </Numeral>
            <span style={{ font: '500 13px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              llevas {metrosTexto(hechoM)} de tus {metrosTexto(largoM)} m
            </span>
            {/* La diferencia contra el objetivo del tramo, ya interpretada: a
                170 ppm nadie resta de cabeza «2:02 contra 2:05». */}
            {hayRitmo && (
              <Delta
                valor={s500 - TRAMO.objetivoS500}
                unidad="s"
                mejorEs="menos"
                sufijo={`vs objetivo ${ritmoCifras(TRAMO.objetivoS500)}/500m`}
                textoNulo="en el objetivo"
              />
            )}
          </>
        }
        apoyos={
          <>
            <FranjaPareja estado={descansoDe(hechos)} />
            {/* Sin ritmo del monitor no se pinta un cero, ni un guion, ni una
                celda vacía: se dice quién no lo da todavía, y la celda aparece
                cuando llega (§7). */}
            {!hayRitmo && (
              <span
                style={{
                  font: '500 12px/1.2 var(--twin-font-sans)',
                  color: 'var(--twin-faint)',
                  textAlign: 'center',
                }}
              >
                el monitor del remo aún no da ritmo
              </span>
            )}
            <FilaApoyos>
              {hayRitmo && <Apoyo etiqueta="Tu ritmo" valor={ritmoCifras(s500)} pie="/500m" />}
              <ApoyoPulso ppm={ppm} />
              <ApoyoReparto quien="tu" hechos={hechos} actual={actual} metros={metros} />
            </FilaApoyos>
          </>
        }
        accion={
          <FranjaAccion
            titulo="Relevo"
            nota="sales tú"
            unicaSalida
            onClick={() => {
              onLog(`Relevo a mano: sales con ${metrosTexto(metros)} m de tramo`);
              onRelevo(metros);
            }}
          />
        }
      />
    </LienzoVivo>
  );
}

/**
 * Lo que se enseña de tu pareja mientras descansa: su ÚLTIMO relevo real, no el
 * que le tocaba. Si os habéis cambiado antes de los 250, aquí salen los metros
 * que de verdad hizo — y si aún no ha remado nada, no sale nada (§7).
 */
function descansoDe(hechos: Segmento[]): EstadoPareja {
  const suyo = [...hechos].reverse().find((s) => s.quien === 'pareja');
  if (!suyo) return { modo: 'descansa' };
  const metros = suyo.hastaM - suyo.desdeM;
  return {
    modo: 'descansa',
    ultimo: { metros, tiempo: reloj(metros / velocidad('pareja')) },
  };
}
