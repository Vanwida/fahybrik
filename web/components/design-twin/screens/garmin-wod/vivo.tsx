'use client';

// EL VIVO DEL WOD EN EL RELOJ GARMIN — `useVivoGarmin` + `VistaGarmin` del kit,
// configurados. Lo único que el WOD pone encima es lo que el atleta DECLARA y el
// motor no sabe (`estado.ts`) y lo que sale de ello:
//
//   · las teclas de §5 en cada formato: en un EMOM con dosis, BACK/LAP marca la
//     tarea (no cierra la ventana); en un AMRAP, BACK/LAP es ronda hecha y UP/DOWN
//     son reps +1 / −1 (mantenidos, aceleran); en la campana, START guarda y
//     BACK/LAP solo cierra una ronda en curso; en una ventana que cierra el reloj
//     (minuto entero de remo, Tabata, AMRAP de un movimiento) BACK/LAP no cierra
//     nada. Qué fila es cada paso lo deduce el kit (`estadoDelPaso`); esta familia
//     solo atiende las acciones. Cada acción con su deshacer de 5 s (UP), que es
//     el del kit (`ctx.avisar`).
//   · la campana del AMRAP: el aviso `campana` del kit, en vez del «recupera» del
//     motor (el kit sabe cuándo).
//   · las caras de cada formato, las páginas de UP/DOWN y el aro sin la campana
//     (no es un tramo del coach).
//
// Todo lo demás es el kit tal cual: el motor, las cinco teclas, Controles, la
// pausa, el 3-2-1 y el GO de todo lo que se corre y del ergo, la vuelta por km,
// la recuperación y el descanso, y la tarjeta de sistema (GPS o pulso perdidos).
//
// Qué NO hacer: resolver una tecla con un `if` fuera de `alAccion`; estirar el
// reloj (no hay +30 s en un Tabata: `controles`); guardar un cero que nadie dijo.

import { useState, type ReactNode } from 'react';
import {
  AroGarmin,
  ComparaTamanos,
  PintaDisposicion,
  Tapa,
  VistaGarmin,
  caraPorDefecto,
  useGarmin,
  useVivoGarmin,
  type ContextoAccion,
  type Disposicion,
  type EstadoMandos,
  type IdAccion,
} from '../../kit-garmin';
import { fmtReloj, tinteDelPaso, wodDe, type Secuencia } from '../../kit-reloj';
import { CapaSistema } from '../garmin-correr/vistaSistema';
import { disponerCaraWod, disponerCuentaWod, disponerFinalWod, hayCaraPropia, tieneCuentaPropia, tieneFinalPropio } from './caras';
import type { CasoGarminWod } from './casos';
import {
  ESTADO_DE_EMOM,
  MARCADOR_VACIO,
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
  type EstadoWod,
  type Marcador,
  vueltasDeRondas,
  type VistaWod,
} from './estado';
import { estructuraDeWod } from './estructura';
import { TITULO_DEL_PASO, paginasDe } from './paginas';

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

  // La campana suena EN VEZ del «recupera» del motor, y solo si acaba el tiempo: eso ya lo hace el kit (`eventosDeTransicion`).
  const { seq, avisos } = useVivoGarmin(datos.plan, caso.sim, caso.inicio, { onLog });

  const v = vistaDe(seq, wod);
  const { paso } = seq;
  const tipo = tipoDeMando(paso, wod);
  const t = seq.lecturas.t;
  const clave = claveDeMarcador(v);
  const marcador = marcadorDe(v);
  const w = wodDe(paso);
  const multi = (w?.formato === 'amrap' || w?.formato === 'puntuacion') && w.tareas.length > 1;

  // ── Las acciones de la familia ─────────────────────────────────────────────

  const poner = (id: string, m: Marcador) => setWod((x) => ({ ...x, marcadores: { ...x.marcadores, [id]: m } }));

  /** BACK/LAP en un EMOM con dosis: marca la tarea, sin cerrar la ventana. */
  const tareaHecha = (ctx: ContextoAccion) => {
    if (w?.formato !== 'emom') return;
    setWod((x) => ({ ...x, hechas: { ...x.hechas, [paso.id]: t } }));
    avisos.emitir('paso-a-mano');
    ctx.avisar(`${w.tarea.nombre} hecho`, () =>
      setWod((x) => {
        const hechas = { ...x.hechas };
        delete hechas[paso.id];
        return { ...x, hechas };
      }),
    );
    onLog(`BACK/LAP → tarea hecha a los ${fmtReloj(t)}: la ventana sigue y lo que queda es respiro · 5 s para deshacer con UP`);
  };

  /** BACK/LAP en un AMRAP de varios movimientos, o en su campana si hay una ronda en curso: ronda hecha. */
  const ronda = (ctx: ContextoAccion) => {
    const antes = marcador;
    const n = antes.cierres.length + 1;
    poner(clave, rondaHecha(antes, t));
    avisos.emitir('paso-a-mano');
    ctx.avisar(`Ronda ${n} anotada`, () => poner(clave, antes));
    onLog(`BACK/LAP → ronda ${n} hecha en ${fmtReloj(t - (antes.cierres.at(-1) ?? 0))} · 5 s para deshacer con UP`);
  };

  const alAccion = (a: IdAccion, _s: Secuencia, ctx: ContextoAccion): boolean => {
    if (a === 'serie-hecha' && tipo === 'emom-tarea') {
      tareaHecha(ctx);
      return true;
    }
    if (a === 'ronda-hecha') {
      // La campana: solo hay «ronda hecha» si hay una en curso (con reps contadas); si no, sin efecto (§5).
      if (tipo === 'puntuacion' && !(multi && (marcador.reps ?? 0) > 0)) {
        onLog('BACK/LAP → sin efecto: no hay una ronda en curso (START guarda la puntuación)');
        return true;
      }
      if (tipo === 'amrap-rondas' || tipo === 'puntuacion') {
        ronda(ctx);
        return true;
      }
      return false;
    }
    // UP y DOWN cuentan reps en el AMRAP (con su ventana de UNO y su campana): no hay páginas ahí, las lleva Controles.
    if ((tipo === 'amrap-rondas' || tipo === 'amrap-reps' || tipo === 'puntuacion') && (a === 'reps-mas' || a === 'reps-menos')) {
      const mas = a === 'reps-mas' ? 1 : -1;
      const porRonda = porRondaDe(paso);
      setWod((x) => ({ ...x, marcadores: { ...x.marcadores, [clave]: moverReps(x.marcadores[clave] ?? MARCADOR_VACIO, mas, porRonda, t) } }));
      onLog(`${mas > 0 ? 'UP' : 'DOWN'} → reps ${mas > 0 ? '+1' : '−1'}: ${textoPuntuacion(dialDe(moverReps(marcador, mas, porRonda, t)), multi)}`);
      return true;
    }
    return false;
  };

  /** La fila de §5 la deduce el kit; el WOD solo dice la de un EMOM (tarea que se marca, o ventana que no se salta). */
  const estadoMandos = (_s: Secuencia, base: EstadoMandos): EstadoMandos => (base === 'deshacer' ? base : (ESTADO_DE_EMOM[tipo] ?? base));

  // ── Lo que se pinta ────────────────────────────────────────────────────────

  const u = avisos.ultimo;
  const destello = u && (u.suena === 'afloja' || u.suena === 'aprieta') ? u.n : null;
  const paginasWod = paginasDe(datos);

  // Las rondas de un AMRAP de varias tareas se ofrecen al kit como vueltas: su página Rondas (en Controles) las lista con su tiempo.
  const seqVista: Secuencia = multi ? { ...seq, estado: { ...seq.estado, vueltas: [...seq.estado.vueltas, ...vueltasDeRondas(marcador)] } } : seq;

  return (
    <VistaGarmin
      seq={seqVista}
      avisos={avisos}
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
      controles={(s, por) => controlesDeWod(s.paso, por)}
      capa={(s, kit) => (
        <>
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
