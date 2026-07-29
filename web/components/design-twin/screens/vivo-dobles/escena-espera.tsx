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

import { CTA, Pantalla, SP } from '../../kit';
import { TopStrip } from '../entreno-vivo/piezas';
import { reloj } from '../../datos-reales';
import {
  BarraPareja,
  FranjaPareja,
  PastillaPersona,
  PulsoTuyo,
  Sujeto,
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
  type EscenaLegProps,
} from './data';
import { useElapsed, useTimeline } from '../../sim';

export function EscenaEspera({
  hechos,
  actual,
  desdeM,
  descansoDesdeS,
  onRelevo,
  onLog,
}: EscenaLegProps) {
  const t = useElapsed();
  const metros = Math.min(actual.hastaM, metrosEn(desdeM, actual.quien, t));
  const restanteM = Math.max(0, actual.hastaM - metros);
  const restanteS = estimaSalidaS(restanteM, actual.quien);
  const preparate = restanteS <= PREPARARSE_S;

  // Cuando la máquina dice que su relevo se ha acabado, el suceso salta solo.
  // Que os hayáis cambiado de asiento eso ya no lo sabe nadie: lo confirma el
  // toque de la pantalla de cambio.
  useTimeline([
    {
      at: Math.max(0, estimaSalidaS(actual.hastaM - desdeM, actual.quien) * 1000),
      run: () => onRelevo(actual.hastaM),
    },
  ]);

  const miRelevo = TRAMO.relevoM;

  return (
    <Pantalla
      accion={
        <CTA
          title="RELEVO ▸"
          height={96}
          onClick={() => {
            onLog(`Relevo a mano: entras tú con ${metrosTexto(metros)} m de tramo`);
            onRelevo(metros);
          }}
        />
      }
    >
      <TopStrip
        faseLabel={null}
        segmentoTitulo={`${TRAMO.titulo} · dobles`}
        indice={hechos.length + 1}
        total={TRAMO.totalM / TRAMO.relevoM}
      />

      <FranjaPareja
        estado={{
          modo: 'rema',
          hechoM: metros - actual.desdeM,
          deM: actual.hastaM - actual.desdeM,
          ritmo: ritmoCifras(ritmoS500(actual.quien)),
        }}
      />

      <Sujeto
        quien="tu"
        label={preparate ? 'Prepárate' : 'Sales en'}
        prefijo="~"
        valor={estimaCifras(restanteS)}
        unidad="s"
        resaltado={preparate}
        nota={
          <>
            <span>
              estimado con su ritmo · le quedan {metrosTexto(restanteM)} m
            </span>
            <span style={{ display: 'inline-flex', gap: SP.s, alignItems: 'center' }}>
              <PastillaPersona quien="tu" texto={`Tú · ${metrosTexto(miRelevo)} m`} mayusculas={false} />
            </span>
          </>
        }
      />

      <PulsoTuyo ppm={pulsoRecuperando(descansoDesdeS + t)} />

      <BarraPareja
        hechos={hechos}
        actual={actual}
        metros={metros}
        reloj={reloj(relojTramoS(hechos, actual, metros))}
      />
    </Pantalla>
  );
}
