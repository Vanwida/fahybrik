'use client';

// EL VIVO DE UN PLAN — la composición estándar: motor + carcasa + caras.
//
// Una pantalla del rediseño que corre un plan no monta nada a mano: pasa el
// plan, el cuerpo (`Simulador`) y el punto de partida, y recibe la muñeca
// entera con las cuatro páginas de la corona (Paso → Datos → Vueltas →
// Estructura), el aro de la sesión, el 3-2-1 / GO, el aviso del km, la acción
// del momento con su deshacer y los controles.
//
// En dos piezas, para que una familia con estado propio (lo anotado en
// fuerza, las rondas del AMRAP) pueda tener sus ganchos entre medias:
//
//   useVivo(plan, sim, inicio, { traducir, onLog }) → { seq, eventos }
//   <VistaVivo seq eventos … />   la carcasa con todo lo de por defecto
//   <VivoDePlan …/>               las dos juntas (lo normal)
//
// Todo lo de por defecto se puede cambiar, y NADA más: la cara de cada paso
// (`cara`, `null` = la de correr, P10), las páginas de la corona (`paginas`),
// la acción del momento (`accion`), la capa a pantalla completa (`capa`), la
// corona enfocada en un valor (`corona`), el aro (`aro`, `duracion`), la cara
// al acabar (`final`) o el final entero (`onFin`), y guardar solo tras un rato
// quieto (`guardarQuieto`).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AroSesion, type Estimador } from './aro';
import { useEventos, type Eventos } from './eventos';
import { estructuraDe } from './estructura';
import { avisoSerie, esFuerza } from './fuerza';
import { useSecuencia, type Secuencia, type Traductor } from './gancho';
import type { Direccion } from './gestos';
import { PaginaDatos, PaginaEstructura, PaginaVueltas } from './listas';
import { Muneca, type AccionPrimaria, type MunecaProps, type PaginaVivo } from './Muneca';
import type { FilaEstructura, Paso, Sesion } from './paso';
import { AvisoVuelta, Descanso, PasoCorrer, Recupera, TresDosUno } from './pasos';
import type { ModeloReloj } from './piezas';
import { fmtObjetivo, fmtReloj, principal, tinteDelPaso } from './reglas';
import type { EstadoSecuencia, InicioSecuencia, PlanSesion, Simulador } from './secuencia';
import { ANCHO_PIE, T, anchoTexto } from './tokens';
import { nombreCuenta } from './voz';

/** La sesión entera, para la página Datos. Sin metros medidos, «—» (nunca 0,00 km). */
export function sesionDe(e: EstadoSecuencia): Sesion {
  return {
    t: e.sesionT,
    metros: e.sesionM > 0 ? e.sesionM : null,
    ritmoMedio: e.sesionM > 50 ? e.sesionT / (e.sesionM / 1000) : null,
    ppmMedio: e.ppmN > 0 ? e.ppmSuma / e.ppmN : null,
  };
}

const cabePie = (s: string) => anchoTexto(s, T.nota.cuerpo) <= ANCHO_PIE;

/**
 * «Serie 3 cerrada», «Recuperación cortada», «A1 · serie 3 hecha», «Sled
 * Push hecho»… el texto del aviso de deshacer. Entero, sin cortar: vive en la
 * franja del pie, así que si el nombre no cabe, se dice el genérico.
 */
export function avisoDeCierre(paso: Paso): string {
  if (paso.rol === 'recuperacion') return 'Recuperación cortada';
  if (paso.rol === 'descanso') return 'Descanso cortado';
  if (esFuerza(paso)) return avisoSerie(paso);
  const w = paso.wod;
  if (w?.formato === 'puntuacion') return 'Puntuación guardada';
  if (w?.formato === 'emom') return `Minuto ${paso.posicion?.serie?.n ?? ''} saltado`;
  if (w?.formato === 'amrap') return 'AMRAP cortado';
  if (paso.rol === 'transicion') return paso.roxzone ? 'Roxzone cerrada' : 'Colócate cortado';
  const tramo = paso.posicion?.tramo;
  if (tramo) return `Tramo ${tramo.n} cerrado`;
  const serie = paso.posicion?.serie;
  if (serie) {
    const c = nombreCuenta(paso);
    return `${c.nombre} ${serie.n} ${c.femenino ? 'cerrada' : 'cerrado'}`;
  }
  if (paso.nombre) {
    const hecho = `${paso.nombre} hecho`;
    if (cabePie(hecho)) return hecho;
    return paso.clase === 'estacion' ? 'Estación hecha' : 'Paso cerrado';
  }
  return 'Paso cerrado';
}

// ---------------------------------------------------------------------------
// El motor y sus eventos
// ---------------------------------------------------------------------------

export function useVivo(
  plan: PlanSesion,
  sim: Simulador,
  inicio: InicioSecuencia,
  opciones: { traducir?: Traductor; onLog: (linea: string) => void },
): { seq: Secuencia; eventos: Eventos } {
  const eventos = useEventos(opciones.onLog);
  const seq = useSecuencia(plan, sim, inicio, eventos, { traducir: opciones.traducir });
  return { seq, eventos };
}

// ---------------------------------------------------------------------------
// La vista
// ---------------------------------------------------------------------------

/** Cómo acabó el vivo: solo (el motor cerró el último paso), el atleta («Terminar y guardar») o quieto (guardado solo). */
export interface FinDeVivo {
  estado: EstadoSecuencia;
  final: 'natural' | 'atleta';
  /** Guardado solo por inactividad: desde qué segundo de sesión estaba quieto. */
  quietoDesde?: number;
}

export interface VistaVivoProps {
  seq: Secuencia;
  eventos: Eventos;
  /** Las filas de la página Estructura según el paso en curso. Sin ellas, las de `estructuraDe`. */
  estructura?: (i: number) => FilaEstructura[];
  /** El control contextual: «Siguiente paso» (sesión con pasos) o «Vuelta» (rodaje). */
  control?: 'siguiente' | 'vuelta';
  /** La etiqueta del control «siguiente» si no es la de por defecto. */
  etiquetaSiguiente?: string;
  /** Cara propia para los pasos que no son de correr; `null` = la del kit. */
  cara?: (seq: Secuencia) => ReactNode | null;
  /** Las páginas de la corona; la primera es la cara. */
  paginas?: (seq: Secuencia, cara: ReactNode) => PaginaVivo[];
  /** La acción del momento; recibe la del kit. */
  accion?: (seq: Secuencia, porDefecto: AccionPrimaria | null) => AccionPrimaria | null;
  /** La capa a pantalla completa (3-2-1, GO, km); recibe la del kit. */
  capa?: (seq: Secuencia, porDefecto: ReactNode) => ReactNode;
  /** La corona enfocada en un valor (ver `MunecaProps.corona`). */
  corona?: (seq: Secuencia, dir: Direccion) => boolean;
  /** El aro, si no es la sesión entera con `AroSesion`. */
  aro?: (seq: Secuencia) => ReactNode;
  /** El estimador de duración de cada paso para repartir el aro. */
  duracion?: Estimador;
  /** Qué dice el aviso de deshacer al cerrar a mano. */
  avisoCierre?: (paso: Paso) => string;
  /** La cara al acabar (el For Time congela su crono = la puntuación). */
  final?: (seq: Secuencia) => ReactNode | null;
  /** El final lo lleva la pantalla (antes y después): se llama al acabar, en vez de «Sesión completada». */
  onFin?: (fin: FinDeVivo) => void;
  /**
   * Guardar solo tras `s` segundos sin moverse y sin tocar nada (el
   * enfriamiento libre tras «Seguir»). `compresion`: segundos simulados por
   * segundo real, SOLO en el doble (para enseñar 10′ en un escenario).
   */
  guardarQuieto?: { s: number; compresion?: number } | null;
  inicial?: MunecaProps['inicial'];
  guion?: MunecaProps['guion'];
  modelo?: ModeloReloj;
  onLog: (linea: string) => void;
}

/**
 * Cuenta lo que lleva el atleta quieto (sin metros nuevos) y sin tocar nada;
 * al llegar a `regla.s`, llama a `alLlegar` una vez con el segundo de sesión
 * en que se paró. Devuelve lo que reinicia la cuenta (cualquier entrada).
 */
function useQuieto(seq: Secuencia, regla: VistaVivoProps['guardarQuieto'], alLlegar: (desde: number) => void) {
  const q = useRef({ s: 0, t: seq.estado.sesionT, desde: seq.estado.sesionT, hecho: false, metros: seq.estado.sesionM + seq.estado.sesionErgoM });
  const t = seq.estado.sesionT;
  const m = seq.estado.sesionM + seq.estado.sesionErgoM;
  useEffect(() => {
    if (!regla) return;
    const x = q.current;
    x.t = t;
    if (m > x.metros + 0.5) {
      x.s = 0;
      x.desde = t;
    } else x.s += regla.compresion ?? 1;
    x.metros = m;
    if (!x.hecho && x.s >= regla.s) {
      x.hecho = true;
      alLlegar(x.desde);
    }
    // Un paso por segundo de motor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
  return () => {
    q.current.s = 0;
    q.current.desde = q.current.t;
  };
}

export function VistaVivo(p: VistaVivoProps) {
  const { seq, eventos: ev } = p;
  const { paso, lecturas, estado, plan } = seq;
  const zonas = plan.zonas;
  const control = p.control ?? 'siguiente';

  // El final lo lleva la pantalla: un instante después del .success×2 y de
  // «Sesión completada.», con lo HECHO (la lámina no se congela).
  const ultimo = useRef({ estado, onFin: p.onFin });
  useEffect(() => {
    ultimo.current = { estado, onFin: p.onFin };
  });
  const terminado = estado.terminado;
  useEffect(() => {
    if (!terminado || !ultimo.current.onFin) return;
    const t = setTimeout(() => ultimo.current.onFin?.({ estado: ultimo.current.estado, final: 'natural' }), 700);
    return () => clearTimeout(t);
  }, [terminado]);
  const [alQuieto] = useState(() => (desde: number) => ultimo.current.onFin?.({ estado: ultimo.current.estado, final: 'natural', quietoDesde: desde }));
  const tocado = useQuieto(seq, p.onFin ? p.guardarQuieto : null, alQuieto);

  const propia = terminado && p.final ? p.final(seq) : (p.cara?.(seq) ?? null);
  const cara =
    propia ??
    (paso.rol === 'recuperacion' ? (
      <Recupera paso={paso} lecturas={lecturas} zonas={zonas} />
    ) : paso.rol === 'descanso' ? (
      <Descanso paso={paso} lecturas={lecturas} onMas30={seq.sumar30} />
    ) : (
      <PasoCorrer paso={paso} lecturas={lecturas} zonas={zonas} />
    ));

  const capaKit =
    seq.cuenta != null && paso.siguiente ? (
      <TresDosUno n={seq.cuenta} paso={paso.siguiente} />
    ) : seq.go ? (
      <TresDosUno n={0} paso={paso} />
    ) : estado.banner ? (
      <AvisoVuelta titulo={estado.banner.titulo} valor={estado.banner.valor} pie={estado.banner.pie} />
    ) : null;
  const capa = terminado && p.final ? null : p.capa ? p.capa(seq, capaKit) : capaKit;

  // La acción del momento (doble toque / Acción / botón): en recuperación y
  // descanso, empezar ya; en un paso de trabajo, cerrarlo (o la vuelta en un
  // rodaje). Todo cierre a mano deja 5 s para deshacer.
  const aviso = (p.avisoCierre ?? avisoDeCierre)(paso);
  const deshacer = { aviso, hacer: seq.deshacer };
  const accionKit: AccionPrimaria | null = terminado
    ? null
    : paso.rol !== 'trabajo'
      ? { etiqueta: 'empezar ya', hacer: seq.cerrar, deshacer }
      : control === 'vuelta'
        ? { etiqueta: 'vuelta', hacer: seq.vuelta }
        : { etiqueta: paso.cierre === 'atleta' ? aviso : 'siguiente paso', hacer: seq.cerrar, deshacer };
  const accion = p.accion ? p.accion(seq, accionKit) : accionKit;

  // Vueltas: el objetivo de las series en la cabecera y la que se corre arriba.
  const deSerie = paso.rol === 'trabajo' ? paso : paso.siguiente;
  const o = deSerie ? principal(deSerie) : null;
  const objetivoSeries = o && (deSerie?.posicion?.serie || deSerie?.posicion?.tramo) ? fmtObjetivo(o) : null;
  const cuenta = paso.posicion?.serie ?? paso.posicion?.tramo;
  const enCurso =
    paso.rol === 'trabajo' && cuenta
      ? { n: paso.posicion?.tanda ? `${paso.posicion.tanda.n}·${cuenta.n}` : String(cuenta.n), valor: fmtReloj(lecturas.t) }
      : paso.vueltaAutoM
        ? { n: `km ${estado.kmN + 1}`, valor: fmtReloj(estado.sesionT - estado.kmDesdeT) }
        : null;
  const estructura = p.estructura ?? estructuraDe(plan.pasos);
  const paginas = p.paginas
    ? p.paginas(seq, cara)
    : [
        { id: 'paso', titulo: 'Paso', contenido: cara },
        { id: 'datos', titulo: 'Datos', contenido: <PaginaDatos sesion={sesionDe(estado)} lecturas={lecturas} zonas={zonas} fuente={paso.entorno === 'cinta' ? 'cinta' : undefined} /> },
        { id: 'vueltas', titulo: 'Vueltas', contenido: <PaginaVueltas vueltas={estado.vueltas} objetivo={objetivoSeries} enCurso={enCurso} /> },
        { id: 'estructura', titulo: 'Estructura', contenido: <PaginaEstructura filas={estructura(estado.i)} /> },
      ];

  return (
    <Muneca
      paginas={paginas}
      aro={p.aro ? p.aro(seq) : <AroSesion pasos={plan.pasos} i={estado.i} paso={paso} lecturas={lecturas} duracion={p.duracion} />}
      tinte={tinteDelPaso(paso, lecturas, zonas)}
      capa={capa}
      pausado={seq.pausado}
      onPausa={seq.pausar}
      siguiente={
        control === 'vuelta'
          ? { etiqueta: 'Vuelta', icono: 'vuelta', onPulsa: seq.vuelta }
          : {
              etiqueta: p.etiquetaSiguiente ?? (paso.clase === 'fuerza' ? 'Siguiente serie' : 'Siguiente paso'),
              icono: 'siguiente',
              onPulsa: seq.cerrar,
              deshacer,
            }
      }
      onTerminar={
        p.onFin
          ? // «Terminar y guardar» ya confirmado: el final, con lo hecho hasta aquí (un tic
            // después, que la cronología recoja antes el .click de la confirmación).
            () => {
              const fin: FinDeVivo = { estado, final: 'atleta' };
              setTimeout(() => ultimo.current.onFin?.(fin), 0);
            }
          : seq.terminar
      }
      completada={terminado && !p.final && !p.onFin}
      accion={accion}
      eventos={ev}
      alPaso={paso.id}
      inicial={p.inicial}
      guion={p.guion}
      modelo={p.modelo}
      corona={p.corona ? (dir) => p.corona!(seq, dir) : undefined}
      onEntrada={p.guardarQuieto ? tocado : undefined}
      onLog={p.onLog}
    />
  );
}

export interface VivoDePlanProps extends Omit<VistaVivoProps, 'seq' | 'eventos'> {
  plan: PlanSesion;
  sim: Simulador;
  inicio: InicioSecuencia;
  /** La familia reescribe lo que se dice al cambiar de paso (ver `Traductor`). */
  traducir?: Traductor;
}

export function VivoDePlan(p: VivoDePlanProps) {
  const { plan, sim, inicio, traducir, ...vista } = p;
  const { seq, eventos } = useVivo(plan, sim, inicio, { traducir, onLog: p.onLog });
  return <VistaVivo seq={seq} eventos={eventos} {...vista} />;
}
