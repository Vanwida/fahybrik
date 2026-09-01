'use client';

// EL RELEVO — el entreno de dobles en vivo.
//
// La tesis de esta pantalla: en dobles la mitad del entreno la pasas FUERA de
// la máquina, y esa mitad tiene sujeto propio. No es una pausa ni una espera:
// es tu salida, y lo que la gobierna es cuánto te queda para entrar. Hoy esa
// mitad se pinta como un cronómetro de descanso con un Spacer() debajo
// (ActiveWorkoutView.relaySurface); aquí el turno de tu pareja y el tuyo son
// dos caras del mismo tramo, cada una con su propio dato al mando.
//
// El módulo es una máquina de estados sobre UNA pieza: el mismo remo de 1.000 m
// en relevos de 250. Los tres escenarios son tres instantes de esa pieza, y se
// encadenan: si dejas correr «te toca», acabarás viendo el cambio y luego el
// turno de Ana. Nada se reinicia entre escenas porque nada se recalcula: todo
// sale de las curvas de `data.ts`.
//
// Lo que NO hace, y es la mitad del diseño (§7):
//   · no pinta el pulso de tu pareja (su reloj no está en este móvil)
//   · no te apunta lo que rema ella (la barra bicolor lo enseña, no lo esconde)
//   · no llama medida a la cuenta de salida (es un cálculo sobre su ritmo)
//   · no da por hecho el cambio (lo confirma un toque; la máquina no os ve)

import { Fragment, useState } from 'react';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { EscenaCambio } from './escena-cambio';
import { EscenaEspera } from './escena-espera';
import { EscenaFin } from './escena-fin';
import { EscenaRemas } from './escena-remas';
import {
  ATLETA,
  CAMBIO_S,
  PAREJA,
  PLAN,
  TRAMO,
  metrosTexto,
  planHasta,
  velocidad,
  type Quien,
  type Segmento,
} from './data';

export const meta: TwinMeta = {
  id: 'vivo-dobles',
  titulo: 'El relevo — dobles en vivo',
  zona: 'Entreno en vivo',
  estado: 'propuesta',
  actualizado: '2026-07-29',
  descripcion:
    'Un remo de 1.000 m a dos, en relevos de 250. La mitad del entreno estás fuera de la máquina: esa mitad tiene su propio sujeto (tu salida), y el cambio es un suceso con cuenta atrás.',
  fuentes: [],
  enApp:
    'En la app el relevo es un botón «Relevo ▸» manual (DoblesTurn); el suceso con cuenta atrás sigue siendo propuesta.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = [
  {
    id: 'pareja-trabaja',
    titulo: 'Rema Ana · tú preparas la salida',
    descripcion:
      'Manda tu cuenta de salida, no su parcial. Su ritmo se ve porque lo mide el monitor; su pulso no, porque no llega a este móvil.',
  },
  {
    id: 'trabajas-tu',
    titulo: 'Te toca · tus 250 drenando',
    descripcion:
      'Manda lo que te queda de TU relevo, con tu ritmo contra el objetivo. Ana pasa a franja, y el total de los dos sigue abajo.',
  },
  {
    id: 'relevo',
    titulo: 'El cambio · 3, 2, 1',
    descripcion:
      'El suceso a pantalla completa, teñida de quien entra. El toque confirma el cambio; tras el 1 la vista rota sola a quien sale.',
  },
];

// ---------------------------------------------------------------------------
// La máquina — un tramo, cuatro relevos, y el reparto REAL que va quedando
// ---------------------------------------------------------------------------

type Fase = 'leg' | 'cambio' | 'fin';

interface Estado {
  fase: Fase;
  /** Relevos ya cerrados, con los metros que de verdad hizo cada uno. */
  hechos: Segmento[];
  /** El relevo en curso. En 'cambio', el que ENTRA. */
  actual: Segmento;
  /** Metros del tramo al montar la escena (la escena avanza desde aquí). */
  desdeM: number;
  /** Lo que llevas fuera de la máquina al montar, para tu pulso. */
  descansoDesdeS: number;
  /** Sube en cada transición: remonta la escena y su reloj arranca de cero. */
  paso: number;
}

function otro(quien: Quien): Quien {
  return quien === 'tu' ? 'pareja' : 'tu';
}

/** El instante en el que arranca cada escenario. Los tres son la MISMA pieza. */
function estadoInicial(escenario: string): Estado {
  if (escenario === 'trabajas-tu') {
    // Relevo 2, el tuyo, recién empezado: los 250 enteros por delante.
    return {
      fase: 'leg',
      hechos: planHasta(1),
      actual: { ...PLAN[1] },
      desdeM: PLAN[1].desdeM,
      descansoDesdeS: 0,
      paso: 0,
    };
  }
  if (escenario === 'relevo') {
    // El cambio del relevo 2 al 3: sales tú, entra Ana.
    return {
      fase: 'cambio',
      hechos: planHasta(2),
      actual: { ...PLAN[2] },
      desdeM: PLAN[2].desdeM,
      descansoDesdeS: 0,
      paso: 0,
    };
  }
  // 'pareja-trabaja': Ana va por la mitad de su segundo relevo (614 del tramo).
  const desdeM = 614;
  return {
    fase: 'leg',
    hechos: planHasta(2),
    actual: { ...PLAN[2] },
    desdeM,
    // Llevas fuera el cambio entero más lo que ella lleva remado.
    descansoDesdeS: CAMBIO_S + (desdeM - PLAN[2].desdeM) / velocidad(PLAN[2].quien),
    paso: 0,
  };
}

export function Screen({ escenario, appearance, onLog }: TwinScreenProps) {
  const [estado, setEstado] = useState<Estado>(() => estadoInicial(escenario));

  /**
   * Se cierra el relevo en curso en `metros` (por la hora o por el toque) y
   * empieza el cambio. Si os cambiáis antes de tiempo el trozo se cierra donde
   * estéis y el que entra rema lo que falte: la barra cuenta lo que pasó, no lo
   * que tocaba.
   */
  const cerrarRelevo = (metros: number) => {
    setEstado((e) => {
      if (e.fase !== 'leg') return e;
      const cerrado: Segmento = { quien: e.actual.quien, desdeM: e.actual.desdeM, hastaM: metros };
      const hechos = [...e.hechos, cerrado];

      if (metros >= TRAMO.totalM) {
        onLog(`Tramo cerrado: ${metrosTexto(TRAMO.totalM)} m entre los dos`);
        return { ...e, fase: 'fin', hechos: e.hechos, actual: e.actual, desdeM: metros, paso: e.paso + 1 };
      }

      const plan = PLAN[hechos.length];
      const entra: Segmento = {
        quien: plan ? plan.quien : otro(e.actual.quien),
        desdeM: metros,
        hastaM: plan ? plan.hastaM : TRAMO.totalM,
      };
      onLog(
        `Relevo ${hechos.length}: sale ${e.actual.quien === 'tu' ? ATLETA : PAREJA}, entra ${
          entra.quien === 'tu' ? ATLETA : PAREJA
        } · ${metrosTexto(entra.hastaM - entra.desdeM)} m`,
      );
      return {
        fase: 'cambio',
        hechos,
        actual: entra,
        desdeM: metros,
        descansoDesdeS: 0,
        paso: e.paso + 1,
      };
    });
  };

  /** El cambio queda confirmado: manda quien entra. */
  const confirmarCambio = () => {
    setEstado((e) => {
      if (e.fase !== 'cambio') return e;
      onLog(e.actual.quien === 'tu' ? 'Cambio hecho · remas tú' : `Cambio hecho · rema ${PAREJA}`);
      return { ...e, fase: 'leg', paso: e.paso + 1 };
    });
  };

  const cuerpo = (() => {
    if (estado.fase === 'fin') {
      return (
        <EscenaFin
          hechos={estado.hechos}
          actual={estado.actual}
          onSiguiente={() => onLog('Siguiente tramo del entreno (fuera del alcance de esta pantalla)')}
          onLog={onLog}
          appearance={appearance}
        />
      );
    }
    if (estado.fase === 'cambio') {
      return (
        <EscenaCambio
          hechos={estado.hechos}
          entra={estado.actual}
          metros={estado.desdeM}
          onHecho={confirmarCambio}
          onLog={onLog}
          appearance={appearance}
        />
      );
    }
    const props = {
      hechos: estado.hechos,
      actual: estado.actual,
      desdeM: estado.desdeM,
      descansoDesdeS: estado.descansoDesdeS,
      onRelevo: cerrarRelevo,
      onLog,
      appearance,
    };
    return estado.actual.quien === 'tu' ? <EscenaRemas {...props} /> : <EscenaEspera {...props} />;
  })();

  // El remonte por paso reinicia el reloj de la escena: cada tramo cuenta el
  // suyo, igual que el remonte por escenario reinicia el guion entero.
  //
  // El safe area lo pone cada escena y no este envoltorio: el tinte de zona vive
  // DETRÁS de él, a sangre, y desde aquí no se puede meter una capa por debajo
  // sin envolver también al ambiente (§10.1).
  return <Fragment key={estado.paso}>{cuerpo}</Fragment>;
}
