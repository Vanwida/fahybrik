'use client';

// EL VIVO DEL IPHONE — la anatomía fija (I5), montada sobre el MISMO motor y
// las MISMAS reglas que la muñeca (`kit-reloj`): un estado, dos pintores.
//
//   useVivo(plan, sim, inicio, …)      → { seq, eventos }   (kit-reloj)
//   <VistaIphone seq eventos … />       la anatomía con todo lo de por defecto
//   <VivoIphoneDePlan plan sim inicio/> las dos juntas (lo normal)
//
// De arriba abajo, y el sujeto no baila: Cabecera · puntos · Sujeto (alto
// fijo) · Banda del objetivo (si hay) · Trabajo · Rejilla (elástica) · Luego ·
// Tira · Franja de acción. Las páginas laterales (Estructura, Mapa) se
// deslizan bajo la cabecera y sobre la franja: la acción se alcanza siempre.
//
// Todo lo de por defecto se puede cambiar, y NADA más: el héroe (`heroe`), la
// acción primaria (`primaria`), la posición de la cabecera (`posicion`), el
// crono total de un circuito (`cronoTotal`), lo extra de la familia para la
// rejilla (`extra`), la anotación del descanso (`anotar`), los dispositivos
// enlazados y el guion de gestos de una demo.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { arcosDePlan, fraccionDelPaso, type Estimador } from '../kit-reloj/aro';
import { DESTELLA } from '../kit-reloj/Muneca';
import type { Eventos } from '../kit-reloj/eventos';
import type { Secuencia, Traductor } from '../kit-reloj/gancho';
import { useGuion } from '../kit-reloj/gestos';
import { laminaDelPaso, type HeroeVista } from '../kit-reloj/lamina';
import { esTest, familiaDe, formatoDe } from '../kit-reloj/familia';
import { heroeDeFamilia, metricasDelPaso, trabajoDe, type ExtraFamilia } from '../kit-reloj/metricas';
import { luegoDe, posicionDe, type LuegoVista } from '../kit-reloj/posicion';
import { fmtReloj, tinteDelPaso } from '../kit-reloj/reglas';
import type { InicioSecuencia, PlanSesion, Simulador } from '../kit-reloj/secuencia';
import { avisoDeCierre, sesionDe, useVivo } from '../kit-reloj/vivo';
import { AvisoDeshacer, FranjaAccion, HojaTerminar, Terminado, VeloPausa, resumenParaTerminar, type ClavePrimaria, type PrimariaVista } from './accion';
import { Cabecera, PuntosPaginas } from './cabecera';
import { Mas30 } from './descanso';
import { SIN_DISPOSITIVOS, enlacesDe, notaEnlace, usaGps, type ChipEnlace, type Dispositivos } from './enlace';
import { PaginaEstructura, PaginaMapa, PaginasLaterales, type IdPagina, type PaginaLateral } from './paginas';
import { KEYFRAMES_IPHONE, LienzoContexto, useMedidaLienzo } from './piezas';
import { Luego, Rejilla, TiraEstructura } from './rejilla';
import { AvisoVuelta, BandaObjetivo, CuentaAtras, Sujeto, Trabajo, type TrabajoVista } from './sujeto';
import { ALTO, CI, DURACION, HUECO, MARGEN, anchoUtil, tinteAmbiente } from './tokens';

/** Los gestos que un escenario puede guionizar: pasan por el MISMO camino que el dedo. */
export type GestoIphone = 'primaria' | 'pausa' | 'reanudar' | 'terminar' | 'terminar-guardar' | 'seguir' | 'deshacer' | 'mas30' | 'estructura' | 'mapa' | 'vivo';

const PAGINAS: IdPagina[] = ['vivo', 'estructura', 'mapa'];

export interface VistaIphoneProps {
  seq: Secuencia;
  eventos: Eventos;
  dispositivos?: Dispositivos;
  /** Lo que la rejilla y el héroe necesitan además del paso (el total, las rondas, la última serie). */
  extra?: (seq: Secuencia) => ExtraFamilia;
  /** El héroe, si la familia lo cambia; recibe el del kit (`heroeDeFamilia`). */
  heroe?: (seq: Secuencia, porDefecto: HeroeVista) => HeroeVista;
  /** La acción primaria; recibe la del kit. `null` = no hay (manda el reloj). */
  primaria?: (seq: Secuencia, porDefecto: PrimariaVista | null) => PrimariaVista | null;
  /** La posición de la cabecera por partes; sin ella, `contextoDe`. */
  posicion?: (seq: Secuencia) => string[];
  /** El crono TOTAL de un circuito (la puntuación) en la cabecera en vez del de sesión. */
  cronoTotal?: (seq: Secuencia) => number | null;
  /** La anotación de la serie en el descanso de fuerza (I7): va en la franja elástica, sobre la rejilla. */
  anotar?: ReactNode | null;
  /**
   * Lo que la familia mete en la franja elástica DURANTE el trabajo o una
   * transición (la lista ±1 del chipper, la puntuación del AMRAP): sobre las
   * celdas, que pasan a compactas y se recortan a `celdasConApoyo`.
   */
  apoyo?: (seq: Secuencia, kit: { irA: (id: IdPagina) => void }) => ReactNode | null;
  /** Cuántas celdas quedan bajo el apoyo (por defecto 2, como en la anotación). */
  celdasConApoyo?: number;
  /** «Luego ·», si la familia lo cambia; `null` lo quita (cuando el apoyo ya dice lo que viene: un dato, un sitio). */
  luego?: (seq: Secuencia, porDefecto: LuegoVista | null) => LuegoVista | null;
  /** El detalle de «Sesión completada» cuando el motor cierra el último paso (la puntuación de un death by). */
  detalleFin?: (seq: Secuencia) => string | null;
  /** El estimador de duración de cada paso para repartir la tira. */
  duracion?: Estimador;
  /** Qué dice el aviso de deshacer al cerrar a mano. */
  avisoCierre?: (seq: Secuencia) => string;
  /**
   * Antes de empezar (I10: «GPS listo» antes, no a mitad): el motor no corre y
   * la primaria es «Empezar», desactivada hasta que `listo`.
   */
  antes?: { listo: boolean; porQue: string; onEmpezar: () => void } | null;
  paginaInicial?: IdPagina;
  guion?: Array<{ en: number; gesto: GestoIphone }>;
  onLog: (linea: string) => void;
}

// ---------------------------------------------------------------------------
// La acción primaria por defecto (vocabulario cerrado)
// ---------------------------------------------------------------------------

function clavePorDefecto(seq: Secuencia): ClavePrimaria | null {
  const { paso } = seq;
  const f = familiaDe(paso);
  if (f === 'roxzone') return paso.roxzone === 'salida' ? 'salgo a correr' : 'empiezo';
  if (paso.wod?.formato === 'puntuacion') return 'guardar';
  if (paso.rol !== 'trabajo') return 'empezar ya';
  if (f === 'pared') return null;
  if (paso.cierre === 'atleta') {
    if (f === 'fuerza') return 'serie hecha';
    if (f === 'emom') return 'hecho';
    if (f === 'amrap') return null;
    if (f === 'estacion' || f === 'fortime') return 'estación hecha';
    if (f === 'remo' || f === 'ski' || f === 'bici') return paso.posicion?.serie ? 'serie hecha' : 'estación hecha';
    return 'siguiente paso';
  }
  if (paso.vueltaAutoM) return 'vuelta';
  return 'siguiente paso';
}

/** El formato de la cabecera en un descanso o una transición: el del bloque que se está haciendo, no «Descanso». */
function pasoDelFormato(seq: Secuencia) {
  const { paso, plan, estado } = seq;
  if (paso.rol === 'trabajo') return paso;
  return plan.pasos.slice(estado.i + 1).find((q) => q.rol === 'trabajo') ?? [...plan.pasos.slice(0, estado.i)].reverse().find((q) => q.rol === 'trabajo') ?? paso;
}

// ---------------------------------------------------------------------------
// La vista
// ---------------------------------------------------------------------------

export function VistaIphone(p: VistaIphoneProps) {
  const { seq, eventos: ev, onLog } = p;
  const { paso, lecturas, estado, plan } = seq;
  const zonas = plan.zonas;
  const dispositivos = p.dispositivos ?? SIN_DISPOSITIVOS;
  const { ref, lienzo } = useMedidaLienzo();

  const [pagina, setPagina] = useState<number>(Math.max(0, PAGINAS.indexOf(p.paginaInicial ?? 'vivo')));
  const [toast, setToast] = useState<{ n: number; aviso: string; hacer: () => void } | null>(null);
  const [hoja, setHoja] = useState(false);
  const [terminado, setTerminado] = useState(false);
  const [completada, setCompletada] = useState(false);

  // El aviso de deshacer vive 5 s.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast((x) => (x?.n === toast.n ? null : x)), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // El final natural tiene pantalla (P9), un instante después del .success×2.
  useEffect(() => {
    if (!estado.terminado || terminado) return;
    const t = setTimeout(() => setCompletada(true), 700);
    return () => clearTimeout(t);
  }, [estado.terminado, terminado]);

  // «GPS listo» antes de empezar: el evento sale del kit al fijar.
  const gpsAntes = useRef(lecturas.gps);
  useEffect(() => {
    if (p.antes && gpsAntes.current === 'buscando' && lecturas.gps === 'listo') ev.emitir('gps');
    gpsAntes.current = lecturas.gps;
  }, [lecturas.gps, p.antes, ev]);

  // ── lo que se pinta (todo decidido en el kit compartido) ────────────────
  const extra = p.extra?.(seq) ?? {};
  const total = p.cronoTotal ? p.cronoTotal(seq) : null;
  // La ronda en curso de un circuito: lo hecho de esta ronda más este paso.
  const ronda = paso.posicion?.ronda?.n;
  const rondaS = ronda != null ? estado.parciales.filter((x) => plan.pasos[x.i]?.posicion?.ronda?.n === ronda).reduce((a, x) => a + x.segundos, 0) + lecturas.t : null;
  // El paso de trabajo anterior con su parcial (la ronda anterior del tabata): del motor, no de la familia.
  const parcialAnterior = [...estado.parciales].reverse().find((x) => plan.pasos[x.i]?.rol === 'trabajo') ?? null;
  const extraCompleto: ExtraFamilia = {
    metrosPaso: estado.midio ? estado.metros : null,
    total,
    totalEnCabecera: total != null,
    rondaS,
    siguienteNombre: paso.siguiente?.nombre ?? null,
    anterior: parcialAnterior ? { paso: plan.pasos[parcialAnterior.i]!, parcial: parcialAnterior } : null,
    ...extra,
  };
  const heroeKit = heroeDeFamilia(paso, lecturas, zonas, extraCompleto);
  const heroe = p.heroe ? p.heroe(seq, heroeKit) : heroeKit;
  const lamina = laminaDelPaso(paso, lecturas, zonas, plan.reglas);
  const banda = paso.rol === 'trabajo' ? lamina.banda : null;
  const chips: ChipEnlace[] = enlacesDe(dispositivos, paso, lecturas);
  const nota = notaEnlace(chips) ?? (paso.cue ? `Coach · ${paso.cue}` : null);
  const metricas = metricasDelPaso(paso, lecturas, heroe.clase, zonas, extraCompleto, plan.reglas);
  const luegoKit = luegoDe(plan.pasos, estado.i);
  const luego = p.luego ? p.luego(seq, luegoKit) : luegoKit;
  const enDescanso = paso.rol === 'descanso' || paso.rol === 'recuperacion';
  const trabajoKit = trabajoDe(paso, lecturas, heroe.clase);
  // El tempo de fuerza ya tiene celda en la rejilla: la fila del trabajo no lo repite (un dato, un sitio).
  const trabajo: TrabajoVista | null = enDescanso && luegoKit ? { etiqueta: 'viene', valor: luegoKit.que, texto: true } : trabajoKit?.etiqueta === 'tempo' ? null : trabajoKit;
  const posicion = p.posicion ? p.posicion(seq) : posicionDe(paso, extraCompleto);
  // El total en la cabecera (la puntuación, que no se va); si el héroe YA es el total, el de sesión.
  const crono =
    total != null && heroe.etiqueta !== 'total' ? { valor: fmtReloj(total), etiqueta: 'total' as const } : { valor: fmtReloj(estado.sesionT), etiqueta: 'sesión' as const };
  const formato = formatoDe(pasoDelFormato(seq));
  const tinte = tinteDelPaso(paso, lecturas, zonas);
  const arcos = arcosDePlan(plan.pasos, p.duracion);
  const conMapa = plan.pasos.some(usaGps);

  // ── la acción primaria ──────────────────────────────────────────────────
  const aviso = p.avisoCierre ? p.avisoCierre(seq) : avisoDeCierre(paso);
  const avisar = () => setToast((t) => ({ n: (t?.n ?? 0) + 1, aviso, hacer: seq.deshacer }));
  const cerrar = () => {
    seq.cerrar();
    avisar();
  };
  let primariaKit: PrimariaVista | null = null;
  if (p.antes) {
    primariaKit = { clave: 'empezar', hacer: p.antes.onEmpezar, desactivada: p.antes.listo ? null : p.antes.porQue };
  } else if (!estado.terminado) {
    const clave = clavePorDefecto(seq);
    if (clave) primariaKit = { clave, hacer: clave === 'vuelta' ? seq.vuelta : cerrar };
  }
  const primariaFamilia = p.primaria ? p.primaria(seq, primariaKit) : primariaKit;
  // Una acción de la familia con deshacer pasa por el mismo aviso de 5 s que un cierre a mano.
  const primaria: PrimariaVista | null =
    primariaFamilia?.deshacer
      ? {
          ...primariaFamilia,
          hacer: () => {
            const d = primariaFamilia.deshacer!;
            primariaFamilia.hacer();
            setToast((t) => ({ n: (t?.n ?? 0) + 1, aviso: d.aviso, hacer: d.hacer }));
          },
        }
      : primariaFamilia;

  // ── gestos ──────────────────────────────────────────────────────────────
  const pausar = (si: boolean) => {
    seq.pausar(si);
    onLog(si ? 'Pausa → los relojes no corren' : 'Reanudar');
  };
  const irA = (id: IdPagina) => {
    const n = PAGINAS.indexOf(id);
    if (n < 0 || (id === 'mapa' && !conMapa)) return;
    setPagina(n);
    onLog(`Página → ${id === 'vivo' ? 'Vivo' : id === 'estructura' ? 'Estructura' : 'Mapa'}`);
  };
  // Lo que la familia mete en la franja elástica: la anotación en el descanso, o su apoyo en el trabajo.
  const apoyo = enDescanso ? (p.anotar ?? null) : (p.apoyo?.(seq, { irA }) ?? null);
  const terminarYGuardar = () => {
    setHoja(false);
    setTerminado(true);
    seq.terminar();
    ev.emitir('accion');
    onLog('Terminar y guardar → confirmado: lo hecho se guarda');
  };
  useGuion<GestoIphone>(p.guion, (g) => {
    if (g === 'primaria' && primaria && !primaria.desactivada) {
      onLog(`Toque → ${primaria.clave}`);
      primaria.hacer();
    } else if (g === 'pausa') pausar(true);
    else if (g === 'reanudar') pausar(false);
    else if (g === 'terminar') {
      setHoja(true);
      onLog('Terminar mantenido 1 s → «¿Terminar aquí?»');
    } else if (g === 'terminar-guardar') terminarYGuardar();
    else if (g === 'seguir') {
      setHoja(false);
      onLog('¿Terminar? → Seguir');
    } else if (g === 'deshacer' && toast) {
      toast.hacer();
      setToast(null);
      onLog(`Deshacer → ${toast.aviso}: vuelve atrás`);
    } else if (g === 'mas30') seq.sumar30();
    else if (g === 'estructura' || g === 'mapa' || g === 'vivo') irA(g);
  });

  // ── las capas ───────────────────────────────────────────────────────────
  const capa =
    seq.cuenta != null && paso.siguiente ? (
      <CuentaAtras n={seq.cuenta} paso={paso.siguiente} />
    ) : seq.go ? (
      <CuentaAtras n={0} paso={paso} />
    ) : estado.banner ? (
      <AvisoVuelta titulo={estado.banner.titulo} valor={estado.banner.valor} pie={estado.banner.pie} />
    ) : null;

  const destello = ev.ultimo?.vibra && DESTELLA.has(ev.ultimo.vibra) ? ev.ultimo.n : null;

  // ── la anatomía ─────────────────────────────────────────────────────────
  const horizontal = lienzo.horizontal;
  // En horizontal el sujeto vive en la columna izquierda (§3): su ancho y su alto son los de la columna.
  const anchoColumna = Math.floor(((lienzo.ancho - 2 * 59 - HUECO) * 1.1) / 2.1);
  const altoColumna = lienzo.alto - 21 - ALTO.cabecera - (banda ? ALTO.banda + HUECO : 0) - (trabajo ? ALTO.trabajo + HUECO : 0) - 2 * HUECO;
  const sujeto = horizontal ? (
    <Sujeto heroe={heroe} nota={nota} alto={Math.max(120, altoColumna)} ancho={anchoColumna - 2 * MARGEN} />
  ) : (
    <Sujeto heroe={heroe} nota={nota} alto={ALTO.sujeto} ancho={anchoUtil(lienzo.ancho)} />
  );
  const bloqueSujeto = (
    <>
      {sujeto}
      {banda ? <BandaObjetivo banda={banda} /> : null}
      {trabajo ? <Trabajo trabajo={trabajo} extra={enDescanso && paso.rol === 'descanso' ? <Mas30 onMas30={seq.sumar30} /> : undefined} /> : null}
    </>
  );
  const bloqueApoyo = (
    <>
      <Rejilla metricas={apoyo ? metricas.slice(0, p.celdasConApoyo ?? 2) : metricas} compacta={!!apoyo}>
        {apoyo}
      </Rejilla>
      {enDescanso ? null : <Luego luego={luego} />}
      <TiraEstructura arcos={arcos} enCurso={estado.i} fraccion={fraccionDelPaso(paso, lecturas)} onAbrir={() => irA('estructura')} />
    </>
  );
  const franja = (
    <FranjaAccion
      primaria={primaria}
      pausado={seq.pausado}
      onPausa={pausar}
      onTerminar={() => {
        setHoja(true);
        onLog('Terminar mantenido 1 s → «¿Terminar aquí?»');
      }}
      onLog={onLog}
    />
  );

  const paginaVivo = horizontal ? (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: HUECO }}>
      <div style={{ flex: '1.1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: HUECO }}>{bloqueSujeto}</div>
      <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: HUECO, paddingTop: 4 }}>
        {bloqueApoyo}
        {franja}
      </div>
    </div>
  ) : (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: HUECO }}>
      {bloqueSujeto}
      {bloqueApoyo}
    </div>
  );

  const paginas: PaginaLateral[] = [
    { id: 'vivo', titulo: 'Vivo', contenido: paginaVivo },
    { id: 'estructura', titulo: 'Estructura', contenido: <PaginaEstructura plan={plan} estado={estado} /> },
  ];
  if (conMapa) {
    const s = sesionDe(estado);
    paginas.push({ id: 'mapa', titulo: 'Mapa', contenido: <PaginaMapa metros={s.metros ?? 0} ritmoMedio={s.ritmoMedio} /> });
  }
  const activa = Math.min(pagina, paginas.length - 1);

  return (
    <LienzoContexto.Provider value={lienzo}>
      <div
        ref={ref}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          background: tinte ? tinteAmbiente(tinte) : CI.fondo,
          transition: 'background 700ms ease',
          color: CI.tinta,
          fontFamily: 'var(--twin-font-sans)',
          fontVariantNumeric: 'tabular-nums',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchAction: 'none',
        }}
      >
        <style>{KEYFRAMES_IPHONE}</style>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            padding: 'var(--twin-safe-top) var(--twin-safe-right) var(--twin-safe-bottom) var(--twin-safe-left)',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: horizontal ? 0 : HUECO,
            opacity: seq.pausado ? 0.4 : 1,
            transition: 'opacity 200ms ease',
          }}
        >
          <Cabecera posicion={posicion} formato={formato} test={esTest(paso)} crono={crono} chips={chips} onEnlaces={(c) => onLog(`Chip ${c} → abre Conectividad`)} />
          {horizontal ? null : <PuntosPaginas total={paginas.length} activa={activa} />}
          <div style={{ position: 'relative', flex: '1 1 auto', minHeight: 0 }}>
            <PaginasLaterales paginas={paginas} activa={activa} onCambiar={(n) => irA(PAGINAS[n]!)} />
          </div>
          {horizontal ? null : franja}
        </div>

        {toast && !hoja ? <AvisoDeshacer key={`deshacer-${toast.n}`} aviso={toast.aviso} onDeshacer={() => { toast.hacer(); setToast(null); onLog(`Deshacer → ${toast.aviso}: vuelve atrás`); }} /> : null}
        {seq.pausado && !hoja ? <VeloPausa /> : null}
        {capa}
        {destello != null ? <div key={`destello-${destello}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: CI.tinta, opacity: 0, animation: `iphone-destello ${DURACION.destelloMs}ms ease-out` }} /> : null}
        {hoja ? (
          <HojaTerminar
            resumen={resumenParaTerminar(paso, estado)}
            onTerminar={terminarYGuardar}
            onSeguir={() => {
              setHoja(false);
              onLog('¿Terminar? → Seguir');
            }}
          />
        ) : null}
        {terminado ? <Terminado titulo="Sesión terminada" detalle="guardando lo hecho…" /> : completada ? <Terminado titulo="Sesión completada" detalle={p.detalleFin?.(seq) ?? 'guardando…'} /> : null}
      </div>
    </LienzoContexto.Provider>
  );
}

// ---------------------------------------------------------------------------
// Lo normal: el motor y la vista juntos
// ---------------------------------------------------------------------------

export interface VivoIphoneDePlanProps extends Omit<VistaIphoneProps, 'seq' | 'eventos'> {
  plan: PlanSesion;
  sim: Simulador;
  inicio: InicioSecuencia;
  traducir?: Traductor;
  /** `false` congela el motor (antes de empezar). */
  corriendo?: boolean;
}

export function VivoIphoneDePlan(p: VivoIphoneDePlanProps) {
  const { plan, sim, inicio, traducir, corriendo, ...vista } = p;
  const { seq, eventos } = useVivo(plan, sim, inicio, { traducir, onLog: p.onLog, corriendo });
  return <VistaIphone seq={seq} eventos={eventos} {...vista} />;
}
