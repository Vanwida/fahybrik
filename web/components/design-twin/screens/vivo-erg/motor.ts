'use client';

// El motor del tramo de ergo. Vive fuera de las vistas porque la cara vertical
// y la cara de monitor son DOS pinturas del MISMO estado: si cada una llevara
// su propia máquina, girar el móvil cambiaría el entreno.
//
// Los axiomas del dominio, tal y como se ejecutan aquí (espejo de
// `ios/FAHYBRIK/Workout/WorkoutSession+Tramo.swift` y `LiveTramo.swift`):
//
//  1. El crono del tramo arranca cuando la máquina se mueve, no al pulsar
//     (`armado` → `trabajando`). PERO solo se arma SI HAY MONITOR: sin nada
//     emparejado no hay nada que esperar, y quedarse armado guardaría un 0:00
//     como si fuera una medida (`tramoClockArmed = … && ergConnected`).
//  2. En el ergo gobierna el HITO: los metros o las calorías los sabe el
//     monitor, y CRUZARLOS saca del tramo.
//  3. Un monitor parado no cierra nada. Cierra el cruce, o tu toque.
//  4. El cruce hay que VERLO (`closesOnMachineGoal` compara el antes con el
//     ahora). Si las lecturas se cortan y el monitor vuelve ya por encima del
//     objetivo, la serie NO se da por hecha: se pide el toque.
//  5. La ventana de la medida se reancla en cada serie, y lo acumulado de la
//     pieza entera se lleva aparte (`accumulatedErgLine`). La ejecución 179 de
//     producción capturó 1 split de 5 justo por no reanclar.
//  6. Los metros cubiertos ANTES de perder el monitor no se tiran: pasaron.

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

export type Fase = 'cuenta' | 'armado' | 'trabajando' | 'cerrando' | 'descanso' | 'hecho';

/** Qué sabe la app del monitor ahora mismo. */
export type EstadoMonitor =
  /** Emparejado y cantando. */
  | 'vivo'
  /** Emparejado, pero todavía no ha mandado una sola lectura. */
  | 'sin-datos'
  /** Corte momentáneo: sigue emparejado, no llegan lecturas. */
  | 'mudo'
  /** No hay monitor: ni se emparejó, o se cayó del todo. */
  | 'ausente';

export interface Guion {
  maquina: Maquina;
  /** Serie en curso al abrir la pantalla. */
  serie: number;
  /** Segundo del tramo en el que ENTRA el doble. 0 = se ve arrancar. */
  entraEnS: number;
  /** Cuenta atrás antes del tramo. 0 = el doble entra con ella hecha. */
  cuentaS: number;
  /** Lo que la máquina tarda en moverse tras armar el tramo. */
  esperaS: number;
  /** Corte de lecturas, en segundos del crono del tramo. */
  hueco: { desdeS: number; hastaS: number } | null;
  /** Nunca hubo monitor: el atleta entró por «empezar sin monitor». */
  sinMonitor?: boolean;
  /** Segundo del tramo en el que el enlace se cae PARA SIEMPRE. */
  pierdeEnS?: number;
}

export const GUION: Record<string, Guion> = {
  // El doble entra con la serie 2 lanzada: quedan 26 s de trabajo hasta el
  // cruce, y el corte de lecturas cae lejos del hito para que se vea lo que
  // enseña (la ventana no se reinicia) sin tapar el cruce.
  'series-remo': { maquina: 'remo', serie: 2, entraEnS: 86, cuentaS: 0, esperaS: 4, hueco: { desdeS: 92, hastaS: 96 } },
  'ski-continuo': { maquina: 'ski', serie: 1, entraEnS: 0, cuentaS: 3, esperaS: 3, hueco: null },
  // El corte se traga el cruce de las 20 cal: la bici vuelve ya por encima y
  // el tramo NO se cierra solo. Ahí es donde el toque es la salida.
  'bici-calorias': { maquina: 'bici', serie: 2, entraEnS: 22, cuentaS: 0, esperaS: 4, hueco: { desdeS: 48, hastaS: 56 } },
  // Mide 20 s y el enlace se muere del todo: el sujeto pasa a ser la orden y
  // los metros que ya habías hecho se quedan, porque pasaron.
  'sin-monitor': { maquina: 'remo', serie: 2, entraEnS: 86, cuentaS: 0, esperaS: 4, hueco: null, pierdeEnS: 106 },
  'horizontal-monitor': { maquina: 'remo', serie: 2, entraEnS: 86, cuentaS: 0, esperaS: 4, hueco: { desdeS: 92, hastaS: 96 } },
  // La puerta de conexión no corre tramo: su guion vive en `conexion.tsx`.
  'conectar-remo': { maquina: 'remo', serie: 1, entraEnS: 0, cuentaS: 3, esperaS: 3, hueco: null },
};

/** Segundos que dura el fogonazo del cruce antes de pasar de sujeto. */
const FOGONAZO_S = 2;

export interface EstadoErg {
  pres: Prescripcion;
  fase: Fase;
  serie: number;
  /** Crono del tramo, en segundos. Retenido en 0 mientras está armado. */
  t: number;
  /** Cuenta atrás de la preparación. */
  cuenta: number;
  /** Segundos que llevas descansando. */
  tDescanso: number;
  monitor: EstadoMonitor;
  /** Lo que el monitor canta acumulado en ESTA serie. Nulo si nadie lo mide. */
  medido: number | null;
  /** Lo que falta para el hito. Nulo cuando no hay medida. */
  restante: number | null;
  /** Lo que se llegó a medir antes de perder el enlace. */
  medidoAntesDePerder: number | null;
  /** El cruce se perdió dentro del corte: solo cierra el toque. */
  cruceCiego: boolean;
  pausado: boolean;
  fogonazo: boolean;
  pulso: number | null;
  /** Las series ya cerradas, en orden. */
  hechas: ResumenSerie[];
  ultimo: ResumenSerie | null;
  /** Cuánto ha bajado el pulso desde el pico de la serie. */
  recuperado: number | null;
  cerrarAMano: () => void;
  alternarPausa: () => void;
  empezarSiguiente: () => void;
  saltarCuenta: () => void;
}

export function useMotorErg(guion: Guion, onLog: (linea: string) => void): EstadoErg {
  const pres = PRESCRIPCION[guion.maquina];
  const perfil = PULSO[guion.maquina];
  const maquina = MAQUINA_NOMBRE[guion.maquina];

  const arranca: Fase =
    guion.cuentaS > 0 ? 'cuenta' : guion.entraEnS > 0 ? 'trabajando' : guion.sinMonitor ? 'trabajando' : 'armado';
  const [fase, setFase] = useState<Fase>(arranca);
  const [serie, setSerie] = useState(guion.serie);
  const [t, setT] = useState(guion.entraEnS);
  const [cuenta, setCuenta] = useState(guion.cuentaS);
  const [tDescanso, setTDescanso] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [cruceCiego, setCruceCiego] = useState(false);
  const [fogonazo, setFogonazo] = useState(false);
  const [perdido, setPerdido] = useState(false);
  const [hechas, setHechas] = useState<ResumenSerie[]>([]);
  const [ultimo, setUltimo] = useState<ResumenSerie | null>(null);
  /** Pulso con el que se entra en la serie: el que dejó el descanso anterior. */
  const [pulsoEnEspera, setPulsoEnEspera] = useState<number | null>(perfil?.base ?? null);

  const baseT = useRef(guion.entraEnS);
  const baseD = useRef(0);
  const parcialesCantados = useRef(0);

  const parciales = useMemo(() => parcialesDe(pres), [pres]);
  const unidad = pres.medida === 'metros' ? 'm' : 'cal';
  const articulo = pres.medida === 'metros' ? 'los' : 'las';

  /** Sin monitor no hay nada que medir, y esa es la verdad que manda la pantalla. */
  const sinMonitor = guion.sinMonitor === true || perdido;

  /** Lo que la app VE. Dentro del corte se congela la última lectura buena. */
  const leer = useCallback(
    (segundo: number): { medido: number; mudo: boolean } => {
      const h = guion.hueco;
      if (h && segundo >= h.desdeS && segundo < h.hastaS) {
        return { medido: medidoEn(pres, Math.max(0, h.desdeS - 1)), mudo: true };
      }
      return { medido: medidoEn(pres, segundo), mudo: false };
    },
    [guion.hueco, pres],
  );

  const cerrar = useCallback(
    (motivo: 'cruce' | 'toque', enS: number) => {
      const pico = perfil ? pulsoEn(perfil, enS) : null;
      const resumen = resumenDeSerie(pres, serie, enS, pico);
      setUltimo(resumen);
      setHechas((prev) => [...prev, resumen]);
      setFogonazo(true);
      setFase('cerrando');
      const cierre = motivo === 'cruce' ? `cruzas ${articulo} ${pres.cantidad}` : 'cierras la serie a mano';
      onLog(`${cierre}: ${fmtClock(resumen.duracionS)} y ${resumen.medido} ${unidad} medidos`);
    },
    [articulo, onLog, perfil, pres, serie, unidad],
  );

  // --- la cuenta atrás de preparación --------------------------------------

  const saltarCuenta = useCallback(() => {
    setCuenta(0);
    setFase(guion.sinMonitor ? 'trabajando' : 'armado');
    onLog('saltas la cuenta atrás');
  }, [guion.sinMonitor, onLog]);

  useTicker(fase === 'cuenta' && !pausado, (s) => {
    const queda = Math.max(0, guion.cuentaS - s);
    setCuenta(queda);
    if (queda > 0) return;
    // Sin monitor no hay nada que esperar: el crono arranca aquí.
    setFase(guion.sinMonitor ? 'trabajando' : 'armado');
  });

  // --- el tramo en marcha ---------------------------------------------------

  useTicker(fase === 'trabajando' && !pausado, (s) => {
    const ahora = baseT.current + s;
    setT(ahora);

    if (guion.pierdeEnS != null && ahora === guion.pierdeEnS) {
      setPerdido(true);
      onLog(`se pierde ${maquina} del todo: lo medido hasta aquí se queda, lo de después no`);
      return;
    }
    if (sinMonitor) return;

    const h = guion.hueco;
    if (h && ahora === h.desdeS) onLog(`se cortan las lecturas: ${maquina} deja de cantar, el tramo sigue abierto`);

    let cruceInvisible = false;
    if (h && ahora === h.hastaS) {
      const antes = medidoEn(pres, Math.max(0, h.desdeS - 1));
      const vuelve = medidoEn(pres, ahora);
      cruceInvisible = antes < pres.cantidad && vuelve >= pres.cantidad;
      if (cruceInvisible) {
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
    if (!lec.mudo && !cruceCiego && !cruceInvisible && lec.medido >= pres.cantidad) cerrar('cruce', ahora);
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
    parcialesCantados.current = 0;
    setFase(sinMonitor ? 'trabajando' : 'armado');
    onLog(
      sinMonitor
        ? `empieza la serie ${serie + 1}: sin monitor, el crono corre desde ya`
        : `la serie ${serie + 1} espera a que ${maquina} se mueva`,
    );
  }, [maquina, onLog, perfil, serie, sinMonitor, tDescanso, ultimo]);

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
        if (guion.sinMonitor) {
          onLog('empiezas sin monitor: la app no puede medir metros, solo el reloj');
        } else if (guion.entraEnS > 0) {
          const lec = leer(guion.entraEnS);
          onLog(`la serie ${guion.serie} ya iba: ${lec.medido} de ${pres.cantidad} ${unidad} en esta ventana`);
        } else if (guion.cuentaS > 0) {
          onLog(`preparados: ${guion.cuentaS} para empezar`);
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
  const lectura = enTramo ? leer(t) : { medido: ultimo?.medido ?? 0, mudo: false };

  const monitor: EstadoMonitor = (() => {
    if (sinMonitor) return 'ausente';
    if (lectura.mudo) return 'mudo';
    // Emparejado y programado, pero todavía sin una sola palada.
    if (fase === 'armado' || fase === 'cuenta') return 'sin-datos';
    return 'vivo';
  })();

  /** Lo medido en la ventana. Sin monitor no hay medida: nulo, no un cero. */
  const medido = (() => {
    if (sinMonitor) return null;
    if (fase === 'armado' || fase === 'cuenta') return 0;
    return lectura.medido;
  })();

  /** Lo que se llegó a medir antes de que el enlace muriera: no se tira. */
  const medidoAntesDePerder =
    perdido && guion.pierdeEnS != null ? medidoEn(pres, guion.pierdeEnS - 1) : null;

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
    cuenta,
    tDescanso,
    monitor,
    medido,
    restante: medido == null ? null : Math.max(0, pres.cantidad - medido),
    medidoAntesDePerder,
    cruceCiego,
    pausado,
    fogonazo,
    pulso,
    hechas,
    ultimo,
    recuperado,
    cerrarAMano,
    alternarPausa,
    empezarSiguiente,
    saltarCuenta,
  };
}

/**
 * La etiqueta de la acción primaria, en la voz de la app shipeada
 * (`ActiveWorkoutView.primaryTitle` / `conditioningPrimaryTitle`): un intervalo
 * cierra con SERIE HECHA y salta el descanso con SALTAR DESCANSO. Aquí no se
 * inventa vocabulario nuevo para lo que el atleta ya lee cada día.
 */
export function tituloAccion(e: EstadoErg): string {
  switch (e.fase) {
    case 'cuenta':
      return 'SALTAR';
    case 'descanso':
      return e.pres.descansoS == null ? `EMPEZAR LA SERIE ${e.serie + 1}` : 'SALTAR DESCANSO';
    case 'hecho':
      return 'TERMINAR';
    default:
      // TERMINAR es de cuando la pieza YA está cerrada. A media serie el botón
      // cierra esta ventana y nada más, aunque sea la última: prometer el final
      // del entreno mientras remas es prometer otra cosa.
      return e.pres.series > 1 ? 'SERIE HECHA' : 'TRAMO HECHO';
  }
}
