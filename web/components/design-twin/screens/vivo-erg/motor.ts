'use client';

// El motor del tramo de ergo. Vive fuera de las vistas porque la cara vertical
// y la cara de monitor son DOS pinturas del MISMO estado: si cada una llevara
// su propia máquina, girar el móvil cambiaría el entreno.
//
// Los cuatro axiomas del dominio, tal y como se ejecutan aquí:
//
//  1. El crono del tramo arranca cuando la máquina se mueve, no al pulsar
//     (`armado` → `trabajando`).
//  2. En el ergo gobierna el HITO: los metros o las calorías los sabe el
//     monitor, y CRUZARLOS saca del tramo.
//  3. Un monitor parado no cierra nada. Cierra el cruce, o tu toque.
//  4. El cruce hay que VERLO. Si las lecturas se cortan y el monitor vuelve ya
//     por encima del objetivo, la serie NO se da por hecha: se pide el toque
//     (docs/DECISIONS.md, 28-jul).
//
// La ventana de la medida se reancla en cada serie: `medidoEn` cuenta desde el
// ancla de ESTA serie, no desde el total del monitor. La ejecución 179 de
// producción (remo 5×500) capturó 1 split de 5 justo por no hacerlo.

import { useCallback, useMemo, useRef, useState } from 'react';
import { fmtClock, useTicker, useTimeline } from '../../sim';
import {
  MAQUINA_NOMBRE,
  PRESCRIPCION,
  PULSO,
  type Maquina,
  type Prescripcion,
  type ResumenSerie,
  medidoEn,
  parcialesDe,
  pulsoDescanso,
  pulsoEn,
  resumenDeSerie,
  ritmoConUnidad,
} from './data';

export type Fase = 'armado' | 'trabajando' | 'cerrando' | 'descanso' | 'hecho';

export interface Guion {
  maquina: Maquina;
  /** Serie en curso al abrir la pantalla. */
  serie: number;
  /** Segundo del tramo en el que ENTRA el doble. 0 = se ve arrancar. */
  entraEnS: number;
  /** Lo que la máquina tarda en moverse tras armar el tramo. */
  esperaS: number;
  /** Corte de lecturas, en segundos del crono del tramo. */
  hueco: { desdeS: number; hastaS: number } | null;
}

export const GUION: Record<string, Guion> = {
  // El doble entra con la serie 2 lanzada: quedan 26 s de trabajo hasta el
  // cruce, y el corte de lecturas cae lejos del hito para que se vea lo que
  // enseña (la ventana no se reinicia) sin tapar el cruce.
  'series-remo': { maquina: 'remo', serie: 2, entraEnS: 86, esperaS: 4, hueco: { desdeS: 92, hastaS: 96 } },
  'ski-continuo': { maquina: 'ski', serie: 1, entraEnS: 0, esperaS: 3, hueco: null },
  // El corte se traga el cruce de las 20 cal: la bici vuelve ya por encima y
  // el tramo NO se cierra solo. Ahí es donde el toque es la salida.
  'bici-calorias': { maquina: 'bici', serie: 2, entraEnS: 22, esperaS: 4, hueco: { desdeS: 48, hastaS: 56 } },
  'horizontal-monitor': { maquina: 'remo', serie: 2, entraEnS: 86, esperaS: 4, hueco: { desdeS: 92, hastaS: 96 } },
};

/** Segundos que dura el fogonazo del cruce antes de pasar de sujeto. */
const FOGONAZO_S = 2;

export interface EstadoErg {
  pres: Prescripcion;
  fase: Fase;
  serie: number;
  /** Crono del tramo, en segundos. */
  t: number;
  /** Segundos que llevas descansando. */
  tDescanso: number;
  /** Lo que el monitor canta acumulado en esta serie. */
  medido: number;
  /** Lo que falta para el hito. */
  restante: number;
  /** El monitor no está dando lecturas ahora mismo. */
  ciego: boolean;
  /** El cruce se perdió dentro del corte: solo cierra el toque. */
  cruceCiego: boolean;
  pausado: boolean;
  fogonazo: boolean;
  pulso: number | null;
  ultimo: ResumenSerie | null;
  /** Cuánto ha bajado el pulso desde el pico de la serie. Nulo si no hay pulso. */
  recuperado: number | null;
  cerrarAMano: () => void;
  alternarPausa: () => void;
  empezarSiguiente: () => void;
}

export function useMotorErg(guion: Guion, onLog: (linea: string) => void): EstadoErg {
  const pres = PRESCRIPCION[guion.maquina];
  const perfil = PULSO[guion.maquina];
  const maquina = MAQUINA_NOMBRE[guion.maquina];

  const [fase, setFase] = useState<Fase>(guion.entraEnS > 0 ? 'trabajando' : 'armado');
  const [serie, setSerie] = useState(guion.serie);
  const [t, setT] = useState(guion.entraEnS);
  const [tDescanso, setTDescanso] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [cruceCiego, setCruceCiego] = useState(false);
  const [fogonazo, setFogonazo] = useState(false);
  const [ultimo, setUltimo] = useState<ResumenSerie | null>(null);
  /** Pulso con el que se entra en la serie: el que dejó el descanso anterior. */
  const [pulsoEnEspera, setPulsoEnEspera] = useState<number | null>(perfil?.base ?? null);

  const baseT = useRef(guion.entraEnS);
  const baseD = useRef(0);
  const parcialesCantados = useRef(0);

  const parciales = useMemo(() => parcialesDe(pres), [pres]);
  /** La unidad, ya en la voz del atleta: 500 metros son «los», 20 calorías «las». */
  const unidad = pres.medida === 'metros' ? 'm' : 'cal';
  const articulo = pres.medida === 'metros' ? 'los' : 'las';

  /** Lo que la app VE. Dentro del corte se congela la última lectura buena. */
  const leer = useCallback(
    (segundo: number): { medido: number; ciego: boolean } => {
      const h = guion.hueco;
      if (h && segundo >= h.desdeS && segundo < h.hastaS) {
        return { medido: medidoEn(pres, Math.max(0, h.desdeS - 1)), ciego: true };
      }
      return { medido: medidoEn(pres, segundo), ciego: false };
    },
    [guion.hueco, pres],
  );

  const cerrar = useCallback(
    (motivo: 'cruce' | 'toque', enS: number) => {
      const pico = perfil ? pulsoEn(perfil, enS) : null;
      const resumen = resumenDeSerie(pres, serie, enS, pico);
      setUltimo(resumen);
      setFogonazo(true);
      setFase('cerrando');
      const cierre =
        motivo === 'cruce' ? `cruzas ${articulo} ${pres.cantidad}` : 'cierras la serie a mano';
      onLog(`${cierre}: ${fmtClock(resumen.duracionS)} y ${resumen.medido} ${unidad} medidos`);
    },
    [articulo, onLog, perfil, pres, serie, unidad],
  );

  // --- el tramo en marcha ---------------------------------------------------
  useTicker(fase === 'trabajando' && !pausado, (s) => {
    const ahora = baseT.current + s;
    setT(ahora);

    const h = guion.hueco;
    if (h && ahora === h.desdeS) onLog(`se cortan las lecturas: ${maquina} deja de cantar, el tramo sigue abierto`);

    let perdido = false;
    if (h && ahora === h.hastaS) {
      const antes = medidoEn(pres, Math.max(0, h.desdeS - 1));
      const vuelve = medidoEn(pres, ahora);
      perdido = antes < pres.cantidad && vuelve >= pres.cantidad;
      if (perdido) {
        setCruceCiego(true);
        onLog(`vuelven las lecturas ya por encima de ${pres.cantidad}: el cruce no se vio, lo cierras tú`);
      } else {
        onLog(`vuelven las lecturas: ${vuelve} ${unidad}, la ventana de la serie no se reinicia`);
      }
    }

    // Los parciales los canta el monitor, no la app: solo cuando ya pasaron.
    if (pres.series === 1) {
      const cantados = parciales.filter((p) => p.acumuladoS <= ahora).length;
      if (cantados > parcialesCantados.current) {
        const p = parciales[cantados - 1];
        onLog(`${p.metros} m en ${fmtClock(Math.round(p.acumuladoS))} a ${ritmoConUnidad(p.ritmo)}`);
        parcialesCantados.current = cantados;
      }
    }

    const lec = leer(ahora);
    if (!lec.ciego && !cruceCiego && !perdido && lec.medido >= pres.cantidad) cerrar('cruce', ahora);
  });

  // --- el fogonazo del cruce ------------------------------------------------
  useTicker(fase === 'cerrando', (s) => {
    if (s >= 1) setFogonazo(false);
    if (s < FOGONAZO_S) return;
    if (serie >= pres.series) {
      setFase('hecho');
      return;
    }
    baseD.current = 0;
    setTDescanso(0);
    setFase('descanso');
    onLog(
      pres.descansoS == null
        ? 'sin descanso escrito: el reloj cuenta hacia arriba y sales tú'
        : `descanso de ${fmtClock(pres.descansoS)}: el pulso empieza a bajar`,
    );
  });

  const empezarSiguiente = useCallback(() => {
    setPulsoEnEspera(ultimo?.pulsoPico != null ? pulsoDescanso(ultimo.pulsoPico, tDescanso) : (perfil?.base ?? null));
    setSerie((n) => n + 1);
    baseT.current = 0;
    setT(0);
    setCruceCiego(false);
    setFase('armado');
    onLog(`la serie ${serie + 1} espera a que ${maquina} se mueva`);
  }, [maquina, onLog, perfil, serie, tDescanso, ultimo]);

  // --- el descanso ----------------------------------------------------------
  useTicker(fase === 'descanso' && !pausado, (s) => {
    const ahora = baseD.current + s;
    setTDescanso(ahora);
    if (pres.descansoS != null && ahora >= pres.descansoS) empezarSiguiente();
  });

  // --- armado: el crono espera a la máquina ---------------------------------
  useTicker(fase === 'armado' && !pausado, (s) => {
    if (s < guion.esperaS) return;
    baseT.current = 0;
    setT(0);
    parcialesCantados.current = 0;
    setFase('trabajando');
    onLog(`${maquina} se mueve, arranca el tramo`);
  });

  // Una línea de apertura para saber por dónde entra el guion.
  useTimeline([
    {
      at: 10,
      run: () => {
        if (guion.entraEnS > 0) {
          const lec = leer(guion.entraEnS);
          onLog(`la serie ${guion.serie} ya iba: ${lec.medido} de ${pres.cantidad} ${unidad} en esta ventana`);
        } else {
          onLog(`${maquina} está quieto: el crono no ha arrancado`);
        }
      },
    },
  ]);

  const alternarPausa = useCallback(() => {
    setPausado((p) => {
      if (!p) {
        baseT.current = t;
        baseD.current = tDescanso;
      }
      return !p;
    });
  }, [t, tDescanso]);

  const cerrarAMano = useCallback(() => cerrar('toque', t), [cerrar, t]);

  // --- lo que se pinta ------------------------------------------------------
  const enTramo = fase === 'trabajando';
  const lectura = enTramo ? leer(t) : { medido: ultimo?.medido ?? leer(t).medido, ciego: false };
  const medido = fase === 'armado' ? 0 : lectura.medido;

  const pulso = (() => {
    if (!perfil) return null;
    if (fase === 'trabajando' || fase === 'cerrando') return pulsoEn(perfil, t);
    if (fase === 'descanso') return pulsoDescanso(ultimo?.pulsoPico ?? perfil.tope, tDescanso);
    if (fase === 'hecho') return pulsoDescanso(ultimo?.pulsoPico ?? perfil.tope, 0);
    return pulsoEnEspera;
  })();

  const recuperado =
    fase === 'descanso' && ultimo?.pulsoPico != null && pulso != null ? ultimo.pulsoPico - pulso : null;

  return {
    pres,
    fase,
    serie,
    t,
    tDescanso,
    medido,
    restante: Math.max(0, pres.cantidad - medido),
    ciego: lectura.ciego,
    cruceCiego,
    pausado,
    fogonazo,
    pulso,
    ultimo,
    recuperado,
    cerrarAMano,
    alternarPausa,
    empezarSiguiente,
  };
}
