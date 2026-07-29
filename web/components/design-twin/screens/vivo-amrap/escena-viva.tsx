'use client';

// El AMRAP en marcha: aquí vive el ESTADO, y solo aquí.
//
// La ventana, las rondas cerradas, el cursor del round y lo que marca el
// monitor son una sola cosa; vertical y horizontal son dos maneras de
// pintarla. Por eso girar el móvil no reinicia nada: no hay dos pantallas,
// hay dos caras del mismo estado (`vista.ts` es el contrato).
//
// Quién gobierna, y por qué: en un For Time gobierna el trabajo (te queda una
// lista y el reloj es la puntuación), pero en un AMRAP gobierna el RELOJ como
// ambiente y manda LA RONDA como sujeto. El número que quieres a tres metros
// no es el tiempo: es cuántas llevas, porque es lo que decide si aprietas. El
// tiempo lo lees de reojo en el aro, y solo se pone delante cuando te va a
// sacar.
//
// Y una vez hay una máquina midiendo, la cara horizontal cambia de manos: ver
// `cara-horizontal.tsx`, que es donde vive la regla del tramo.

import { useState } from 'react';
import type { TwinOrientation } from '../../types';
import { useTicker, useTimeline } from '../../sim';
import { reloj } from '../../datos-reales';
import { CaraHorizontal } from './cara-horizontal';
import { CaraVertical } from './cara-vertical';
import {
  ARRANQUE,
  AVISO_FINAL_S,
  MONITOR_CONECTADO,
  MOVIMIENTOS,
  PULSO_MAX_PPM,
  REMATE_FINAL_S,
  RITMO_REMO_S500,
  SPLITS_GUION_S,
  VATIOS_REMO,
  VENTANA_S,
  calEnTramo,
  caraDe,
  cierreGuionS,
  comparaConLaPrimera,
  marcador,
  pulsoEn,
  ventana,
  type LecturaErg,
} from './data';
import { Sellado, type RondaCerrada } from './escena-sellado';
import type { VistaViva } from './vista';

/** Dos toques en menos de esto son el mismo toque: la mano va sudada. */
const TOQUE_MINIMO_S = 2;

export interface EscenaVivaProps {
  arranque: keyof typeof ARRANQUE;
  orientation: TwinOrientation;
  onLog: (linea: string) => void;
}

export function EscenaViva({ arranque, orientation, onLog }: EscenaVivaProps) {
  const inicio = ARRANQUE[arranque];

  const [base, setBase] = useState(inicio.transcurridoS);
  const [t, setT] = useState(inicio.transcurridoS);
  const [pausado, setPausado] = useState(false);
  const [terminado, setTerminado] = useState(false);
  const [marcados, setMarcados] = useState(inicio.marcados);
  const [destello, setDestello] = useState(0);
  const [inicioRondaS, setInicioRondaS] = useState(cierreGuionS(inicio.rondas));
  const [tramoDesdeS, setTramoDesdeS] = useState(inicio.tramoDesdeS);
  const [rondas, setRondas] = useState<RondaCerrada[]>(() =>
    SPLITS_GUION_S.slice(0, inicio.rondas).map((duracionS, i) => ({ indice: i + 1, duracionS })),
  );

  const restanteS = Math.max(0, VENTANA_S - t);
  const tension = restanteS <= AVISO_FINAL_S ? 1 - restanteS / AVISO_FINAL_S : 0;
  const remate = restanteS <= REMATE_FINAL_S;
  const repsMarcadas = MOVIMIENTOS.slice(0, marcados).reduce((n, m) => n + m.dosis, 0);
  const movimientoActual = MOVIMIENTOS[marcados];
  const cara = caraDe(movimientoActual, MONITOR_CONECTADO);
  const erg: LecturaErg | null =
    cara === 'monitor' && movimientoActual
      ? {
          cal: Math.min(movimientoActual.dosis, calEnTramo(t - tramoDesdeS)),
          objetivoCal: movimientoActual.dosis,
          ritmo500: reloj(RITMO_REMO_S500),
          vatios: VATIOS_REMO,
        }
      : null;

  useTimeline([
    {
      at: 0,
      run: () =>
        onLog(
          `AMRAP ${ventana(VENTANA_S)} · vas por ${marcador(rondas.length, repsMarcadas)}, quedan ${ventana(restanteS)}`,
        ),
    },
  ]);

  // ---- las dos maneras de cerrar trabajo: tu dedo, o una máquina que mide --

  const cerrarRondaEn = (ahora: number) => {
    if (pausado || terminado) return;
    const duracionS = ahora - inicioRondaS;
    if (duracionS < TOQUE_MINIMO_S) {
      onLog('Dos toques en el mismo segundo: el segundo no cuenta como ronda');
      return;
    }
    const indice = rondas.length + 1;
    const siguientes = [...rondas, { indice, duracionS }];
    setRondas(siguientes);
    setInicioRondaS(ahora);
    setTramoDesdeS(ahora);
    setMarcados(0);
    setDestello((n) => n + 1);
    const compara = comparaConLaPrimera(
      siguientes.map((r) => r.duracionS),
      siguientes.length - 1,
    );
    onLog(`Ronda ${indice} cerrada en ${reloj(duracionS)}${compara ? ` · ${compara.texto}` : ''}`);
  };

  const marcarEn = (i: number, ahora: number, porMonitor: boolean) => {
    if (pausado || terminado) return;
    if (i + 1 <= marcados) {
      setMarcados(i);
      setTramoDesdeS(ahora);
      onLog(`Desmarcado: ${MOVIMIENTOS[i].nombre}`);
      return;
    }
    if (i + 1 >= MOVIMIENTOS.length) {
      // Marcar el último movimiento ES cerrar la ronda: no se pide un toque de
      // más para decir lo que ya has dicho.
      cerrarRondaEn(ahora);
      return;
    }
    setMarcados(i + 1);
    setTramoDesdeS(ahora);
    const reps = MOVIMIENTOS.slice(0, i + 1).reduce((n, m) => n + m.dosis, 0);
    const como = porMonitor
      ? `${MOVIMIENTOS[i].nombre}: el monitor llegó a ${MOVIMIENTOS[i].dosis} cal y lo cerró solo`
      : `${MOVIMIENTOS[i].nombre} marcado`;
    onLog(`${como} · llevas ${marcador(rondas.length, reps)}`);
  };

  useTicker(!pausado && !terminado, (s) => {
    const ahora = Math.min(VENTANA_S, base + s);
    setT(ahora);
    if (ahora >= VENTANA_S) {
      setTerminado(true);
      onLog(`Se acabó la ventana · ${marcador(rondas.length, repsMarcadas)} sobre la mesa`);
      return;
    }
    // Lo que mide una máquina conectada NO se pide por un toque: cuando el
    // monitor completa la dosis, el tramo se cierra solo y el marcador queda
    // MEDIDO en vez de declarado (0088, `reps_confirmed`). Es la única parte
    // del AMRAP que la app puede saber por su cuenta, y por eso la sabe.
    if (
      MONITOR_CONECTADO &&
      movimientoActual?.mideElMonitor &&
      calEnTramo(ahora - tramoDesdeS) >= movimientoActual.dosis
    ) {
      marcarEn(marcados, ahora, true);
    }
  });

  if (terminado) {
    return (
      <Sellado
        rondas={rondas}
        repsMarcadas={repsMarcadas}
        movimientoEnCurso={marcados < MOVIMIENTOS.length ? MOVIMIENTOS[marcados] : null}
        pulsoMaxPpm={PULSO_MAX_PPM}
        orientation={orientation}
        onLog={onLog}
      />
    );
  }

  const comparaUltima = comparaConLaPrimera(
    rondas.map((r) => r.duracionS),
    rondas.length - 1,
  );

  const vista: VistaViva = {
    rondas: rondas.length,
    repsMarcadas,
    marcados,
    cara,
    ventanaTexto: ventana(restanteS),
    ventanaTotalTexto: ventana(VENTANA_S),
    tension,
    remate,
    aliento: remate ? 'vacía el depósito' : tension > 0 ? 'un minuto, una más' : null,
    fraccion: restanteS / VENTANA_S,
    compara: comparaUltima
      ? { indice: rondas.length, texto: comparaUltima.texto, deltaS: comparaUltima.deltaS }
      : null,
    pulsoPpm: pulsoEn(t),
    erg,
    pausado,
    onCerrarRonda: () => cerrarRondaEn(t),
    onMarcar: (i) => marcarEn(i, t, false),
    onPausa: () => {
      setBase(t);
      setPausado((p) => !p);
      onLog(pausado ? 'Sigue el entreno' : 'En pausa · el reloj está parado');
    },
    onSalir: () => onLog('Mantuviste pulsado para salir · aquí la app pregunta si guardar o descartar'),
    onSeguir: () => {
      setPausado(false);
      onLog('Sigue el entreno');
    },
  };

  return orientation === 'landscape' ? (
    <CaraHorizontal vista={vista} destello={destello} />
  ) : (
    <CaraVertical vista={vista} destello={destello} />
  );
}
