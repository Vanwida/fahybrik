'use client';

// EL VIVO DEL WOD EN EL RELOJ GARMIN — `useVivoGarmin` + `VistaGarmin` del kit,
// configurados. Lo único que el WOD pone encima es lo que el atleta DECLARA y el
// motor no sabe (`estado.ts`) y lo que sale de ello:
//
//   · las teclas de §5 en cada formato: en un EMOM con dosis, BACK/LAP marca la
//     tarea (no cierra la ventana); en un AMRAP, BACK/LAP es ronda hecha y UP/DOWN
//     son reps +1 / −1; en la campana, BACK/LAP guarda; en una ventana que cierra
//     el reloj (minuto entero de remo, Tabata, AMRAP de un movimiento) BACK/LAP no
//     cierra nada. Cada acción con su deshacer de 5 s (UP).
//   · la campana del AMRAP: tres largas y un tono propio, en vez del «recupera»
//     del motor (`avisos.ts`).
//   · las caras de cada formato, las páginas de UP/DOWN y el aro sin la campana
//     (no es un tramo del coach).
//
// Todo lo demás es el kit tal cual: el motor, las cinco teclas, Controles, la
// pausa, el 3-2-1 y el GO de todo lo que se corre y del ergo, la vuelta por km,
// la recuperación y el descanso, y la tarjeta de sistema (GPS o pulso perdidos).
//
// Qué NO hacer: resolver una tecla con un `if` fuera de `alAccion`; estirar el
// reloj (no hay +30 s en un Tabata: `controles`); guardar un cero que nadie dijo.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AroGarmin,
  ComparaTamanos,
  FranjaDeshacer,
  PintaDisposicion,
  Tapa,
  VistaGarmin,
  caraPorDefecto,
  eventosDeTransicion,
  useGarmin,
  useVivoGarmin,
  type Avisos,
  type Disposicion,
  type EstadoMandos,
  type IdAccion,
} from '../../kit-garmin';
import { DESHACER_MS, avisoDeCierre, fmtReloj, tinteDelPaso, wodDe, type Secuencia } from '../../kit-reloj';
import { CapaSistema } from '../garmin-correr/vistaSistema';
import { LINEA_CAMPANA, emisionCampana, esCampana } from './avisos';
import { disponerCaraWod, disponerCuentaWod, disponerFinalWod, hayCaraPropia, tieneCuentaPropia, tieneFinalPropio } from './caras';
import type { CasoGarminWod } from './casos';
import {
  ESTADO_DE_MANDOS,
  MARCADOR_VACIO,
  QUE_HACE_BACK,
  claveDeMarcador,
  controlesDeWod,
  dialDe,
  estadoWodInicial,
  marcadorDe,
  moverReps,
  porRondaDe,
  rondaHecha,
  textoPuntuacion,
  tipoDeMando,
  vistaDe,
  type AccionBack,
  type EstadoWod,
  type Marcador,
  vueltasDeRondas,
  type VistaWod,
} from './estado';
import { estructuraDeWod } from './estructura';
import { TITULO_DEL_PASO, paginasDe } from './paginas';

/** Los ids de acción con los que §5 nombra a BACK/LAP según el estado: la familia atiende todos por igual. */
const ATIENDE_BACK: ReadonlySet<IdAccion> = new Set<IdAccion>(['siguiente-paso', 'serie-hecha', 'empezar-ya', 'ronda-hecha']);

/** El deshacer de una acción de la familia: vive `DESHACER_MS` y solo mientras sigue el paso (o el siguiente, si la acción lo cerró). */
interface Toast {
  id: number;
  pasoId: string;
  aviso: string;
  deshacer: () => void;
}

/** Pinta una disposición que depende del reloj en el que está (D): la pieza mínima de una cara o de una página. */
export function PintaDe({ f }: { f: (D: number) => Disposicion }) {
  const { D } = useGarmin();
  return <PintaDisposicion d={f(D)} />;
}

/** La cara del paso si es de un formato de reloj o un ergo; `null` = la del kit (correr, recuperar, descansar). */
function caraDe(v: VistaWod): ReactNode | null {
  return hayCaraPropia(v.paso) ? <PintaDe f={(D) => disponerCaraWod(v, D)!} /> : null;
}

/** El 3-2-1 y el GO de un paso de WOD, con su tarea y su carga; `null` = la tarjeta del kit. */
function cuentaDeWod(s: Secuencia): ReactNode | null {
  const entra = s.cuenta != null && s.paso.siguiente ? s.paso.siguiente : s.go ? s.paso : null;
  if (!entra || !tieneCuentaPropia(entra)) return null;
  const n = s.cuenta != null && s.paso.siguiente ? s.cuenta : 0;
  return (
    <>
      <Tapa />
      <PintaDe f={(D) => disponerCuentaWod(n, entra, D)} />
    </>
  );
}

/** El aro es la sesión; la campana (la puntuación) no es un tramo del coach y no ocupa aro: en ella el aro enseña el AMRAP recién terminado, lleno. */
function AroWod({ seq, destello }: { seq: Secuencia; destello: number | null }) {
  const { plan, paso, estado, lecturas } = seq;
  const visibles = plan.pasos.filter((x) => x.rol !== 'transicion');
  const iAro = visibles.findIndex((x) => x.id === paso.id);
  if (iAro >= 0) return <AroGarmin pasos={visibles} i={iAro} paso={paso} lecturas={lecturas} destello={destello} />;
  const previoI = Math.max(0, plan.pasos.slice(0, estado.i).filter((x) => x.rol !== 'transicion').length - 1);
  const previo = visibles[previoI]!;
  return <AroGarmin pasos={visibles} i={previoI} paso={previo} lecturas={{ ...lecturas, t: previo.medida.prescrito ?? 0, hecho: previo.medida.prescrito }} destello={destello} />;
}

// ---------------------------------------------------------------------------
// El vivo
// ---------------------------------------------------------------------------

export function VivoWod({ caso, onLog }: { caso: CasoGarminWod; onLog: (linea: string) => void }) {
  const { datos } = caso;
  const [wod, setWod] = useState<EstadoWod>(() => estadoWodInicial(datos.plan, caso.wod));
  const [toast, setToast] = useState<Toast | null>(null);
  const [campana, setCampana] = useState<{ baseN: number } | null>(null);
  const ultimoN = useRef(0);

  // La campana suena EN VEZ del «recupera» del motor, y solo si acaba el tiempo (no si el atleta salta el AMRAP).
  const { seq, avisos } = useVivoGarmin(datos.plan, caso.sim, caso.inicio, {
    onLog,
    traducir: (t) => {
      const eventos = eventosDeTransicion(t);
      if (!esCampana(t)) return eventos;
      setCampana({ baseN: ultimoN.current });
      onLog(LINEA_CAMPANA);
      return eventos.filter((e) => e !== 'recupera');
    },
  });
  useEffect(() => {
    ultimoN.current = avisos.ultimo?.n ?? 0;
  });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((x) => (x?.id === toast.id ? null : x)), DESHACER_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const v = vistaDe(seq, wod);
  const { paso } = seq;
  const tipo = tipoDeMando(paso, wod);
  const t = seq.lecturas.t;
  const clave = claveDeMarcador(v);
  const marcador = marcadorDe(v);
  const w = wodDe(paso);
  const multi = (w?.formato === 'amrap' || w?.formato === 'puntuacion') && w.tareas.length > 1;
  const toastVivo = toast && toast.pasoId === paso.id ? toast : null;

  // ── Las acciones de la familia ─────────────────────────────────────────────

  const poner = (id: string, m: Marcador) => setWod((x) => ({ ...x, marcadores: { ...x.marcadores, [id]: m } }));
  const avisar = (aviso: string, deshacer: () => void, pasoId = paso.id) => setToast((x) => ({ id: (x?.id ?? 0) + 1, pasoId, aviso, deshacer }));

  /** BACK/LAP: lo que hace en este tipo de paso. Devuelve lo que se escribe en la cronología. */
  const back = (que: AccionBack): string => {
    switch (que) {
      case 'tarea-hecha': {
        if (w?.formato !== 'emom') return '';
        setWod((x) => ({ ...x, hechas: { ...x.hechas, [paso.id]: t } }));
        avisos.emitir('paso-a-mano');
        avisar(`${w.tarea.nombre} hecho`, () =>
          setWod((x) => {
            const hechas = { ...x.hechas };
            delete hechas[paso.id];
            return { ...x, hechas };
          }),
        );
        return `Tarea hecha a los ${fmtReloj(t)}: la ventana sigue y lo que queda es respiro · 5 s para deshacer con UP`;
      }
      case 'ronda-hecha': {
        const antes = marcador;
        const n = antes.cierres.length + 1;
        poner(clave, rondaHecha(antes, t));
        avisos.emitir('paso-a-mano');
        avisar(`Ronda ${n} anotada`, () => poner(clave, antes));
        return `Ronda ${n} hecha en ${fmtReloj(t - (antes.cierres.at(-1) ?? 0))} · 5 s para deshacer con UP`;
      }
      case 'guardar': {
        const aviso = avisoDeCierre(paso);
        avisar(aviso, seq.deshacer, seq.plan.pasos[seq.estado.i + 1]?.id ?? paso.id);
        seq.cerrar();
        return `${aviso} · 5 s para deshacer con UP`;
      }
      default:
        return 'nada aquí: esta ventana la cierra el reloj (Saltar paso, en Controles)';
    }
  };

  const alAccion = (a: IdAccion): boolean => {
    if (a === 'deshacer' && toastVivo) {
      toastVivo.deshacer();
      setToast(null);
      onLog(`UP → Deshacer: ${toastVivo.aviso}, vuelve atrás`);
      return true;
    }
    if (ATIENDE_BACK.has(a)) {
      const que = QUE_HACE_BACK[tipo];
      if (que === 'kit') return false;
      onLog(`BACK/LAP → ${back(que)}`);
      return true;
    }
    // UP y DOWN cuentan reps en las tres filas de AMRAP de §5. En los 5 s de un deshacer, DOWN es «página siguiente» de la fila del kit: aquí no hay páginas, y sigue siendo reps −1.
    const deAmrap = tipo === 'amrap-rondas' || tipo === 'amrap-reps' || tipo === 'puntuacion';
    if (deAmrap && (a === 'reps-mas' || a === 'reps-menos' || a === 'pagina-siguiente')) {
      const mas = a === 'reps-mas' ? 1 : -1;
      const porRonda = porRondaDe(paso);
      setWod((x) => ({ ...x, marcadores: { ...x.marcadores, [clave]: moverReps(x.marcadores[clave] ?? MARCADOR_VACIO, mas, porRonda, t) } }));
      onLog(`${mas > 0 ? 'UP' : 'DOWN'} → reps ${mas > 0 ? '+1' : '−1'}: ${textoPuntuacion(dialDe(moverReps(marcador, mas, porRonda, t)), multi)}`);
      return true;
    }
    return false;
  };

  const estadoMandos = (_s: Secuencia, base: EstadoMandos): EstadoMandos => (base === 'deshacer' || toastVivo ? 'deshacer' : (ESTADO_DE_MANDOS[tipo] ?? base));

  // ── Lo que se pinta ────────────────────────────────────────────────────────

  const u = avisos.ultimo;
  const destello = u && (u.suena === 'afloja' || u.suena === 'aprieta') ? u.n : null;
  // El lector enseña la campana hasta que suena otro aviso.
  const avisosVista: Avisos = campana && (u == null || u.n <= campana.baseN) ? { ...avisos, ultimo: emisionCampana(campana.baseN + 0.5) } : avisos;
  const paginasWod = paginasDe(datos);

  // Las rondas de un AMRAP de varias tareas se ofrecen al kit como vueltas: su página Vueltas (en Controles) las lista con su tiempo.
  const seqVista: Secuencia = multi ? { ...seq, estado: { ...seq.estado, vueltas: [...seq.estado.vueltas, ...vueltasDeRondas(marcador)] } } : seq;

  return (
    <VistaGarmin
      seq={seqVista}
      avisos={avisosVista}
      cara={(s) => caraDe(vistaDe(s, wod))}
      paginas={
        paginasWod.length > 0
          ? (s, cara) => [
              { id: 'paso', titulo: TITULO_DEL_PASO[datos.formato], contenido: cara },
              ...paginasWod.map((p) => ({ id: p.id, titulo: p.titulo, contenido: <PintaDe f={(D) => p.disponer(vistaDe(s, wod), D)} /> })),
            ]
          : undefined
      }
      estadoMandos={estadoMandos}
      alAccion={alAccion}
      controles={(s, por) => controlesDeWod(s.paso, por, s.plan.pasos)}
      capa={(s, kit) => (
        <>
          {toastVivo ? <FranjaDeshacer aviso={toastVivo.aviso} n={toastVivo.id} /> : null}
          <CapaSistema seq={s} />
          {cuentaDeWod(s) ?? kit}
        </>
      )}
      aro={(s) => <AroWod seq={s} destello={destello} />}
      final={(s) => {
        const vf = vistaDe(s, wod);
        return tieneFinalPropio(vf) ? (
          <>
            <Tapa />
            <PintaDe f={(D) => disponerFinalWod(vf, D)} />
          </>
        ) : null;
      }}
      estructura={estructuraDeWod(datos)}
      guion={caso.guion}
      inicial={caso.inicial}
      onLog={onLog}
    />
  );
}

/** La misma cara del instante en los cuatro relojes, con el motor quieto. */
export function ComparacionWod({ caso, onLog }: { caso: CasoGarminWod; onLog: (linea: string) => void }) {
  const [wod] = useState<EstadoWod>(() => estadoWodInicial(caso.datos.plan, caso.wod));
  const { seq } = useVivoGarmin(caso.datos.plan, caso.sim, caso.inicio, { onLog, corriendo: false });
  const v = vistaDe(seq, wod);
  return (
    <ComparaTamanos tinte={tinteDelPaso(seq.paso, seq.lecturas, seq.plan.zonas)}>
      {() => (
        <>
          {caraDe(v) ?? caraPorDefecto(seq)}
          <AroWod seq={seq} destello={null} />
        </>
      )}
    </ComparaTamanos>
  );
}
