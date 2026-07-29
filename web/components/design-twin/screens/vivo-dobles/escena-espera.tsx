'use client';

// (a) TU PAREJA TRABAJA — y el sujeto eres TÚ.
//
// La mitad del entreno de dobles la pasas fuera de la máquina, y esa mitad no
// es una espera muerta: es la preparación de tu salida. Por eso lo que gobierna
// la pantalla NO es el parcial de Ana (eso es contexto), sino cuánto te queda
// para entrar. Si el sujeto fuese lo que ella hace, la pantalla estaría
// contando la vida de otra persona mientras a ti se te pasa el turno.
//
// Las dos mitades de la cifra grande vienen de sitios distintos, y se escriben
// distinto a propósito (§7):
//   · los metros que le quedan los MIDE el monitor  → cifra seca
//   · los segundos hasta tu salida son un CÁLCULO sobre su ritmo de ahora
//     → `~`, redondeo a 5 s de lejos, y la palabra «estimado» al lado
//
// Y el lienzo se tiñe de TU zona mientras ella rema (§10.1): es el dato que
// quieres ver bajar justo ahora, no el suyo — su pulso ni siquiera llega a este
// móvil.

import { SP } from '../../kit';
import {
  EtiquetaSujeto,
  FilaApoyos,
  FranjaAccion,
  MarcoVivo,
  Numeral,
} from '../../kit-vivo';
import { reloj } from '../../datos-reales';
import {
  ApoyoPulso,
  ApoyoReparto,
  Cromo,
  EstimaSujeto,
  FranjaPareja,
  LienzoVivo,
  MarcadorTramo,
  PastillaPersona,
  UnidadSujeto,
  type EscenaLegVista,
} from './atoms';
import {
  PREPARARSE_S,
  TRAMO,
  estimaCifras,
  estimaSalidaS,
  metrosEn,
  metrosTexto,
  relojTramoS,
  ritmoCifras,
  ritmoS500,
  pulsoRecuperando,
} from './data';
import { useElapsed, useTimeline } from '../../sim';

export function EscenaEspera({
  hechos,
  actual,
  desdeM,
  descansoDesdeS,
  onRelevo,
  onLog,
  appearance,
}: EscenaLegVista) {
  const t = useElapsed();
  const metros = Math.min(actual.hastaM, metrosEn(desdeM, actual.quien, t));
  const restanteM = Math.max(0, actual.hastaM - metros);
  const restanteS = estimaSalidaS(restanteM, actual.quien);
  const preparate = restanteS <= PREPARARSE_S;
  const ppm = pulsoRecuperando(descansoDesdeS + t);

  // Cuando la máquina dice que su relevo se ha acabado, el suceso salta solo.
  // Que os hayáis cambiado de asiento eso ya no lo sabe nadie: lo confirma el
  // toque de la pantalla de cambio.
  useTimeline([
    {
      at: Math.max(0, estimaSalidaS(actual.hastaM - desdeM, actual.quien) * 1000),
      run: () => onRelevo(actual.hastaM),
    },
  ]);

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
            {/* En el último tramo la etiqueta cambia de palabra Y de tono: es un
                aviso, no un estado sostenido, así que va en el ámbar de la app y
                no en el naranja de marca (§9.1). */}
            <EtiquetaSujeto tono={preparate ? 'var(--twin-warning)' : 'var(--twin-muted)'}>
              {preparate ? 'Prepárate' : 'Sales en'}
            </EtiquetaSujeto>
            <Numeral>
              <EstimaSujeto />
              {estimaCifras(restanteS)}
              <UnidadSujeto>s</UnidadSujeto>
            </Numeral>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: SP.s,
                font: '500 13px/1.35 var(--twin-font-sans)',
                color: 'var(--twin-muted)',
                textAlign: 'center',
              }}
            >
              <span>estimado con su ritmo · le quedan {metrosTexto(restanteM)} m</span>
              <PastillaPersona
                quien="tu"
                texto={`Tú · ${metrosTexto(TRAMO.relevoM)} m`}
                mayusculas={false}
              />
            </div>
          </>
        }
        apoyos={
          <>
            <FranjaPareja
              estado={{
                modo: 'rema',
                hechoM: metros - actual.desdeM,
                deM: actual.hastaM - actual.desdeM,
                ritmo: ritmoCifras(ritmoS500(actual.quien)),
              }}
            />
            <FilaApoyos>
              <ApoyoPulso ppm={ppm} />
              <ApoyoReparto quien="tu" hechos={hechos} actual={actual} metros={metros} />
              <ApoyoReparto quien="pareja" hechos={hechos} actual={actual} metros={metros} />
            </FilaApoyos>
          </>
        }
        accion={
          <FranjaAccion
            titulo="Relevo"
            nota="entras tú"
            unicaSalida
            onClick={() => {
              onLog(`Relevo a mano: entras tú con ${metrosTexto(metros)} m de tramo`);
              onRelevo(metros);
            }}
          />
        }
      />
    </LienzoVivo>
  );
}
