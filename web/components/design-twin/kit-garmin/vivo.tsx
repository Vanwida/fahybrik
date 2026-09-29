'use client';

// EL VIVO GARMIN — el MISMO motor que la muñeca (`useSecuencia` de kit-reloj)
// con otro pintor: la pantalla redonda, cinco botones y avisos de vibración y
// tono. Un estado, dos pintores (G1).
//
//   useVivoGarmin(plan, sim, inicio, { onLog }) → { seq, avisos }
//   <VistaGarmin seq avisos … />       la carcasa con todo lo de por defecto
//   <VivoGarminDePlan plan sim inicio/> las dos juntas (lo normal)
//
// Qué hace cada botón lo dice la tabla de §5 (`mandos.ts`) según el ESTADO de
// mandos, que se deriva aquí: acabado → resumen; un menú abierto → controles;
// en pausa → pausa; durante los 5 s de deshacer → deshacer; recuperación o
// descanso → recupera; una serie de fuerza → fuerza; un AMRAP → amrap; si no,
// paso. La familia puede afinarlo (`estadoMandos`: el anotar de fuerza).
//
// Todo lo de por defecto se puede cambiar, y NADA más: la cara de cada paso
// (`cara`, `null` = la del kit), las páginas UP/DOWN (`paginas`), el estado de
// mandos (`estadoMandos`), las acciones propias (`alAccion`: ronda hecha,
// reps ±1, anotar), la lista de Controles (`controles`), la capa a pantalla
// entera (`capa`), el aro (`aro`, `duracion`), el aviso de deshacer
// (`avisoCierre`), la cara al acabar (`final`) o el final entero (`onFin`).
//
// Qué NO hacer: resolver una tecla con un `if` propio (se añade su acción a
// la tabla y se atiende en `alAccion`); cerrar la app con BACK grabando.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Estimador } from '../kit-reloj/aro';
import { completitud, type HechoSesion, type SerieHecha } from '../kit-reloj/despues';
import { esFuerza } from '../kit-reloj/fuerza';
import { useSecuencia, type Secuencia, type Transicion, type Traductor } from '../kit-reloj/gancho';
import { useGuion } from '../kit-reloj/gestos';
import type { Entorno, FilaEstructura, Paso } from '../kit-reloj/paso';
import { esCarrera, tinteDelPaso } from '../kit-reloj/reglas';
import type { EstadoSecuencia, InicioSecuencia, PlanSesion, Simulador } from '../kit-reloj/secuencia';
import { DESHACER_MS } from '../kit-reloj/tokens';
import { avisoDeCierre, type FinDeVivo } from '../kit-reloj/vivo';
import { AroGarmin } from './aro';
import { useAvisos, type Avisos, type EventoGarmin } from './avisos';
import { CarcasaGarmin } from './carcasa';
import { NOMBRE_BOTON, accionDe, type BotonGarmin, type EstadoMandos, type IdAccion, type Mando } from './mandos';
import {
  CaraCompletada,
  CaraDescartada,
  CaraMenu,
  CaraPausa,
  FranjaDeshacer,
  PaginaDatos,
  PaginaEstructura,
  PaginaVueltas,
  capaPorDefecto,
  caraPorDefecto,
} from './pantalla';
import { TIEMPO, type Diametro } from './tokens';

// ---------------------------------------------------------------------------
// El motor y sus avisos
// ---------------------------------------------------------------------------

/**
 * El motor de kit-reloj con los avisos de Garmin. La transición del motor no
 * vuelve al emisor de la muñeca (el traductor devuelve nada): la traduce
 * `avisos.transicion`, o la `traducir` de la familia (que puede partir de
 * `eventosDeTransicion`).
 */
export function useVivoGarmin(
  plan: PlanSesion,
  sim: Simulador,
  inicio: InicioSecuencia,
  opciones: { onLog: (linea: string) => void; corriendo?: boolean; traducir?: (t: Transicion) => EventoGarmin[] },
): { seq: Secuencia; avisos: Avisos } {
  const avisos = useAvisos(opciones.onLog);
  const traductor: Traductor = (t) => {
    if (opciones.traducir) opciones.traducir(t).forEach(avisos.emitir);
    else avisos.transicion(t);
    return [];
  };
  const seq = useSecuencia(plan, sim, inicio, avisos.comoEventos, { traducir: traductor, corriendo: opciones.corriendo });
  return { seq, avisos };
}

/** Lo hecho, para decidir la completitud (`completitud` de kit-reloj): las series de los parciales. */
export function hechoDe(plan: PlanSesion, e: EstadoSecuencia, final: 'natural' | 'atleta'): HechoSesion {
  const series: SerieHecha[] = e.parciales.flatMap((x) => {
    const p = plan.pasos[x.i];
    const c = p?.posicion?.serie ?? p?.posicion?.tramo;
    if (!p || p.rol !== 'trabajo' || !c) return [];
    const ritmo = x.metros != null && x.metros > 50 ? x.segundos / (x.metros / 1000) : null;
    return [{ n: c.n, tanda: p.posicion?.tanda?.n, clase: p.posicion?.tramo ? 'tramo' : 'serie', segundos: x.segundos, metros: x.metros, ritmo, ppm: x.ppm, veredicto: null, pasoId: p.id }];
  });
  return { pasos: plan.pasos, i: e.i, final, series };
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

export type IdControl = 'pausa' | 'saltar' | 'mas30' | 'entorno' | 'terminar' | 'descartar' | 'datos' | 'vueltas' | 'estructura';

const TEXTO_CONTROL: Record<IdControl, string> = {
  pausa: 'Pausa',
  saltar: 'Saltar paso',
  mas30: '+30 s',
  entorno: 'Cambiar entorno',
  terminar: 'Terminar',
  descartar: 'Descartar',
  datos: 'Datos',
  vueltas: 'Vueltas',
  estructura: 'Estructura',
};

const ENTORNOS: Array<{ id: Entorno; texto: string }> = [
  { id: 'calle', texto: 'Calle' },
  { id: 'cinta', texto: 'Cinta' },
  { id: 'pista', texto: 'Pista' },
];

/** Los Controles de §5: Pausa, Saltar paso, +30 s (solo en descanso), Cambiar entorno, Terminar, Descartar. */
export function controlesPorDefecto(seq: Secuencia, base: EstadoMandos): IdControl[] {
  const c: IdControl[] = ['pausa'];
  if (base === 'amrap') c.push('datos', 'vueltas', 'estructura');
  c.push('saltar');
  if (seq.paso.rol === 'recuperacion' || seq.paso.rol === 'descanso') c.push('mas30');
  if (seq.plan.pasos.some(esCarrera)) c.push('entorno');
  c.push('terminar', 'descartar');
  return c;
}

type Capa =
  | null
  | { tipo: 'controles'; foco: number }
  | { tipo: 'entorno'; foco: number }
  | { tipo: 'terminar' }
  | { tipo: 'descartar'; vez: 1 | 2 }
  | { tipo: 'pagina'; id: 'datos' | 'vueltas' | 'estructura' };

export interface PaginaGarmin {
  id: string;
  titulo: string;
  contenido: ReactNode;
}

// ---------------------------------------------------------------------------
// La vista
// ---------------------------------------------------------------------------

export interface VistaGarminProps {
  seq: Secuencia;
  avisos: Avisos;
  cara?: (seq: Secuencia) => ReactNode | null;
  paginas?: (seq: Secuencia, cara: ReactNode) => PaginaGarmin[];
  estadoMandos?: (seq: Secuencia, porDefecto: EstadoMandos) => EstadoMandos;
  /** Las acciones de la familia (ronda hecha, reps ±1, anotar, empezar…). `true` = atendida. */
  alAccion?: (accion: IdAccion, seq: Secuencia) => boolean;
  controles?: (seq: Secuencia, porDefecto: IdControl[]) => IdControl[];
  capa?: (seq: Secuencia, porDefecto: ReactNode | null) => ReactNode | null;
  aro?: (seq: Secuencia) => ReactNode;
  duracion?: Estimador;
  avisoCierre?: (paso: Paso) => string;
  final?: (seq: Secuencia) => ReactNode | null;
  onFin?: (fin: FinDeVivo) => void;
  estructura?: (i: number) => FilaEstructura[];
  inicial?: { tamano?: Diametro; pagina?: number; controles?: boolean };
  /** Botones guionizados de un escenario: pasan por el MISMO camino que la tecla. */
  guion?: Array<{ en: number; boton: BotonGarmin }>;
  onLog: (linea: string) => void;
}

type Toast = { n: number; aviso: string; hacer: () => void };

export function VistaGarmin(p: VistaGarminProps) {
  const { seq, avisos, onLog } = p;
  const { paso, estado, plan } = seq;
  const [pagina, setPagina] = useState(p.inicial?.pagina ?? 0);
  const [capa, setCapa] = useState<Capa>(p.inicial?.controles ? { tipo: 'controles', foco: 0 } : null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [entorno, setEntorno] = useState<Entorno | null>(null);
  const [fin, setFin] = useState<'natural' | 'atleta' | 'descartada' | null>(null);
  const [pasoVisto, setPasoVisto] = useState(paso.id);

  // Un paso nuevo devuelve a la página del paso (estado derivado, sin efecto).
  if (paso.id !== pasoVisto) {
    setPasoVisto(paso.id);
    if (pagina !== 0) setPagina(0);
  }

  // El deshacer vive 5 s.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((x) => (x?.n === toast.n ? null : x)), DESHACER_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const final = fin ?? (estado.terminado ? 'natural' : null);
  const onFin = useRef(p.onFin);
  useEffect(() => {
    onFin.current = p.onFin;
  });
  const ultimoEstado = useRef(estado);
  useEffect(() => {
    ultimoEstado.current = estado;
  });
  useEffect(() => {
    if (final !== 'natural' || !onFin.current) return;
    const t = setTimeout(() => onFin.current?.({ estado: ultimoEstado.current, final: 'natural' }), TIEMPO.finTrasMs);
    return () => clearTimeout(t);
  }, [final]);

  const visto: Paso = entorno && esCarrera(paso) ? { ...paso, entorno } : paso;
  const base: EstadoMandos = toast
    ? 'deshacer'
    : paso.rol !== 'trabajo'
      ? 'recupera'
      : esFuerza(paso)
        ? 'fuerza'
        : paso.wod?.formato === 'amrap'
          ? 'amrap'
          : 'paso';
  const vivo: EstadoMandos = p.estadoMandos ? p.estadoMandos(seq, base) : base;
  const estadoMandos: EstadoMandos = final ? 'resumen' : capa ? 'controles' : seq.pausado ? 'pausa' : vivo;
  const controles = (p.controles ?? ((_, d) => d))(seq, controlesPorDefecto(seq, vivo));

  const propia = p.cara?.(seq) ?? null;
  const cara = propia ?? caraPorDefecto(seq, visto);
  const paginas = p.paginas
    ? p.paginas(seq, cara)
    : [
        { id: 'paso', titulo: 'Paso', contenido: cara },
        { id: 'datos', titulo: 'Datos', contenido: <PaginaDatos seq={seq} /> },
        { id: 'vueltas', titulo: 'Vueltas', contenido: <PaginaVueltas seq={seq} /> },
        { id: 'estructura', titulo: 'Estructura', contenido: <PaginaEstructura seq={seq} estructura={p.estructura} /> },
      ];
  const activa = Math.min(pagina, paginas.length - 1);

  // ── Las acciones ───────────────────────────────────────────────────────────

  /** BACK/LAP (y «Saltar paso»): cierra el paso, avisa y deja 5 s para deshacer. */
  const cerrarAMano = (como: string) => {
    if (estado.terminado) return;
    const aviso = (p.avisoCierre ?? avisoDeCierre)(paso);
    seq.cerrar();
    setToast((t) => ({ n: (t?.n ?? 0) + 1, aviso, hacer: seq.deshacer }));
    onLog(`${como} → ${aviso} · 5 s para deshacer con UP`);
  };

  const irPagina = (dir: 1 | -1) => {
    const n = (activa + dir + paginas.length) % paginas.length;
    setPagina(n);
    onLog(`Página ${n + 1}/${paginas.length} · ${paginas[n]!.titulo}`);
  };

  const elegirControl = (id: IdControl) => {
    onLog(`Controles → ${TEXTO_CONTROL[id]}`);
    switch (id) {
      case 'pausa':
        seq.pausar(!seq.pausado);
        return setCapa(null);
      case 'saltar':
        setCapa(null);
        return cerrarAMano('Saltar paso');
      case 'mas30':
        seq.sumar30();
        return setCapa(null);
      case 'entorno':
        return setCapa({ tipo: 'entorno', foco: Math.max(0, ENTORNOS.findIndex((e) => e.id === (visto.entorno ?? 'calle'))) });
      case 'terminar':
        return setCapa({ tipo: 'terminar' });
      case 'descartar':
        return setCapa({ tipo: 'descartar', vez: 1 });
      default:
        return setCapa({ tipo: 'pagina', id });
    }
  };

  /** START en un menú (o tocar una opción, fuera del vivo): elige la enfocada, o la `k` tocada. */
  const elegir = (k?: number) => {
    if (!capa) return;
    if (capa.tipo === 'controles') return elegirControl(controles[k ?? capa.foco]!);
    if (capa.tipo === 'entorno') {
      const e = ENTORNOS[k ?? capa.foco]!;
      setEntorno(e.id);
      setCapa(null);
      return onLog(`Entorno → ${e.texto} (el resto de la sesión)`);
    }
    if (capa.tipo === 'terminar') {
      setCapa(null);
      setFin('atleta');
      onLog('Terminar → Guardar lo hecho (completa o parcial: lo decide lo hecho)');
      seq.terminar();
      if (p.onFin) setTimeout(() => onFin.current?.({ estado: ultimoEstado.current, final: 'atleta' }), 0);
      return;
    }
    if (capa.tipo === 'descartar') {
      if (capa.vez === 1) return setCapa({ tipo: 'descartar', vez: 2 });
      setCapa(null);
      setFin('descartada');
      seq.terminar();
      return onLog('Descartar → confirmado dos veces: no se guarda nada');
    }
  };

  /** BACK en un menú: de Controles (o de una página abierta desde él) al vivo; de un submenú, a Controles, en la opción de la que salió. */
  const cerrarCapa = () => {
    if (!capa) return;
    const origen: IdControl | null = capa.tipo === 'entorno' || capa.tipo === 'terminar' || capa.tipo === 'descartar' ? capa.tipo : null;
    const vuelve: Capa = origen ? { tipo: 'controles', foco: Math.max(0, controles.indexOf(origen)) } : null;
    setCapa(vuelve);
    onLog(vuelve ? 'Cerrar → vuelve a Controles' : 'Cerrar → vuelve al vivo');
  };

  const moverFoco = (dir: 1 | -1) => {
    if (capa?.tipo === 'controles') setCapa({ ...capa, foco: Math.min(controles.length - 1, Math.max(0, capa.foco + dir)) });
    if (capa?.tipo === 'entorno') setCapa({ ...capa, foco: Math.min(ENTORNOS.length - 1, Math.max(0, capa.foco + dir)) });
  };

  const ejecutar = (a: IdAccion): string | null => {
    if (p.alAccion?.(a, seq)) return null;
    switch (a) {
      case 'pausa':
        seq.pausar(true);
        return 'en pausa: los relojes se paran';
      case 'reanudar':
        seq.pausar(false);
        return 'sigue';
      case 'siguiente-paso':
      case 'empezar-ya':
      case 'serie-hecha':
        cerrarAMano(NOMBRE_BOTON.back);
        return null;
      case 'deshacer':
        if (toast) {
          toast.hacer();
          setToast(null);
          return `${toast.aviso}: vuelve atrás`;
        }
        return null;
      case 'pagina-anterior':
        irPagina(-1);
        return null;
      case 'pagina-siguiente':
        irPagina(1);
        return null;
      case 'controles':
        setCapa({ tipo: 'controles', foco: 0 });
        return 'Controles';
      case 'elegir':
        elegir();
        return null;
      case 'cerrar':
        cerrarCapa();
        return null;
      case 'anterior':
        moverFoco(-1);
        return null;
      case 'siguiente':
        moverFoco(1);
        return null;
      case 'luz':
        return 'luz de fondo (la enciende el sistema; la app no la toca)';
      default:
        return 'lo lleva la familia (antes y después, fuerza o WOD)';
    }
  };

  const alBoton = (b: BotonGarmin, m: Mando | null) => {
    if (!m) return onLog(`${NOMBRE_BOTON[b]} → nada aquí`);
    const dice = ejecutar(m.accion);
    if (dice) onLog(`${NOMBRE_BOTON[b]} → ${m.rotulo}: ${dice}`);
  };
  // El guion pasa por la MISMA tabla que la tecla (useGuion llama siempre a la versión más reciente).
  useGuion(p.guion?.map((g) => ({ en: g.en, gesto: g.boton })), (b: BotonGarmin) => alBoton(b, accionDe(estadoMandos, b)));

  // ── Lo que se pinta ────────────────────────────────────────────────────────

  const u = avisos.ultimo;
  const destello = u && (u.suena === 'afloja' || u.suena === 'aprieta') ? u.n : null;
  const aro = p.aro ? p.aro(seq) : <AroGarmin pasos={plan.pasos} i={estado.i} paso={paso} lecturas={seq.lecturas} duracion={p.duracion} destello={destello} />;
  let pantalla: ReactNode;
  if (final === 'descartada') pantalla = <CaraDescartada />;
  else if (final) {
    pantalla = p.final?.(seq) ?? (
      <CaraCompletada natural={final === 'natural'} t={estado.sesionT} completitud={completitud(hechoDe(plan, estado, final))} metros={estado.sesionM > 0 ? estado.sesionM : null} />
    );
  } else if (capa?.tipo === 'pagina') {
    pantalla = { datos: <PaginaDatos seq={seq} />, vueltas: <PaginaVueltas seq={seq} />, estructura: <PaginaEstructura seq={seq} estructura={p.estructura} /> }[capa.id];
  } else if (capa) {
    const menu = menuDe(capa, controles, seq.pausado);
    pantalla = (
      <CaraMenu
        titulo={menu.titulo}
        opciones={menu.opciones}
        foco={menu.foco}
        onTocar={(k) => {
          onLog(`Toque en «${menu.opciones[k]!.texto}» (fuera del vivo; su tecla es START)`);
          elegir(k);
        }}
      />
    );
  } else if (seq.pausado) {
    pantalla = (
      <>
        <CaraPausa sesionT={estado.sesionT} paso={paso} />
        {aro}
      </>
    );
  } else {
    const kit = capaPorDefecto(seq);
    pantalla = (
      <>
        {paginas[activa]!.contenido}
        {toast ? <FranjaDeshacer aviso={toast.aviso} n={toast.n} /> : null}
        {p.capa ? p.capa(seq, kit) : kit}
        {aro}
      </>
    );
  }

  const tinte = !final && !capa && !seq.pausado && activa === 0 ? tinteDelPaso(visto, seq.lecturas, plan.zonas) : null;
  return (
    <CarcasaGarmin estado={estadoMandos} onBoton={alBoton} tinte={tinte} ultimo={u} inicial={p.inicial?.tamano} onLog={onLog}>
      {pantalla}
    </CarcasaGarmin>
  );
}

/** El menú que toca según la capa: Controles, el entorno o una confirmación. */
function menuDe(capa: Exclude<Capa, null | { tipo: 'pagina' }>, controles: IdControl[], pausado: boolean) {
  switch (capa.tipo) {
    case 'controles':
      return {
        titulo: ['Controles'],
        opciones: controles.map((id) => ({ id, texto: id === 'pausa' && pausado ? 'Reanudar' : TEXTO_CONTROL[id] })),
        foco: capa.foco,
      };
    case 'entorno':
      return { titulo: ['Entorno'], opciones: ENTORNOS.map((e) => ({ id: e.id, texto: e.texto })), foco: capa.foco };
    case 'terminar':
      return { titulo: ['¿Terminar?'], opciones: [{ id: 'guardar', texto: 'Guardar lo hecho' }], foco: 0 };
    case 'descartar':
      return capa.vez === 1
        ? { titulo: ['¿Descartar?'], opciones: [{ id: 'descartar', texto: 'Descartar' }], foco: 0 }
        : { titulo: ['No se guarda nada'], opciones: [{ id: 'descartar', texto: 'Sí, descartar' }], foco: 0 };
  }
}

export interface VivoGarminDePlanProps extends Omit<VistaGarminProps, 'seq' | 'avisos'> {
  plan: PlanSesion;
  sim: Simulador;
  inicio: InicioSecuencia;
  /** `false` congela el motor (la comparación de tamaños). */
  corriendo?: boolean;
  traducir?: (t: Transicion) => EventoGarmin[];
}

export function VivoGarminDePlan(p: VivoGarminDePlanProps) {
  const { plan, sim, inicio, corriendo, traducir, ...vista } = p;
  const { seq, avisos } = useVivoGarmin(plan, sim, inicio, { onLog: p.onLog, corriendo, traducir });
  return <VistaGarmin seq={seq} avisos={avisos} {...vista} />;
}
