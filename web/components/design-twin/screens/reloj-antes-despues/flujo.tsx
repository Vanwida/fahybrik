'use client';

// EL FLUJO — antes y después de la sesión, de la esfera a la esfera:
//
//   esfera ─toque─▶ brief ─Empezar─▶ (¿dónde?) ─▶ (GPS) ─▶ 3-2-1 ─▶ vivo
//      ▲                                                            │
//      └──Listo── resumen ◀── RPE ◀── Sesión completada ◀──final────┘
//                                         │ Seguir → enfriamiento libre
//
// Cada escenario entra por una fase y desde ahí se puede seguir tocando. Lo
// asíncrono de verdad (el GPS que fija, el pulso que se asienta, los acuses
// del móvil) va con tiempos de guion; lo demás es estado normal.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  C,
  TresDosUno,
  fmtDistancia,
  fmtReloj,
  fmtRitmo,
  useEventos,
  vozInicio,
  type Emision,
  type Entorno,
  type GestoGuion,
  type InicioSecuencia,
  type MunecaProps,
  type PasoBase,
  type PlanSesion,
  type Secuencia,
  type Simulador,
} from '../../kit-reloj';
import { cuerpo } from '../reloj-correr/casos';
import { CaraEstacion, CaraFuerza } from '../reloj-gramatica/caras';
import { Brief, necesitaGps, type EstadoGps } from './brief';
import { METODO_RESUMEN_DEFECTO, completitud, miles, volumen, type MetodoResumen, type Resultado } from './calculo';
import { Esfera, SmartStack, type Hoy } from './esfera';
import { Completada, Rpe } from './fin';
import { DiaLibre, Donde, EntrenoLibre, EsperaGps } from './listo';
import { Pila } from './pila';
import { tiempoCircuito } from './resultados';
import { Resumen, type Acuse } from './resumen';
import { conEntorno, correrLibre, enfriamientoLibre, type Familia, type Sesion } from './sesiones';
import { VivoFin, resultadoDeVivo, type FinDeVivo } from './vivo-fin';

export type FaseId = 'esfera' | 'brief' | 'donde' | 'gps' | 'vivo' | 'fin' | 'rpe' | 'resumen' | 'dia-libre';

export type Arranque =
  | { en: 'esfera' | 'stack' | 'brief' | 'dia-libre' }
  | { en: 'vivo'; inicio: InicioSecuencia; sim?: Simulador; inicial?: MunecaProps['inicial'] }
  | { en: 'fin' | 'rpe' | 'resumen'; r: Resultado; natural?: boolean };

export interface Escena {
  /** La sesión de hoy; `null` = día de descanso (o sin sesión). */
  sesion: Sesion | null;
  /** Lo de mañana, para el día de descanso. */
  manana?: PasoBase[] | null;
  arranque: Arranque;
  /** El resultado de la sesión entera cuando el escenario empieza con ella avanzada. */
  base?: Resultado | null;
  /** ms desde que se abre el brief hasta que fija el GPS; 0 = ya fijado. */
  gpsEn?: number;
  pulsoEn?: number;
  /** Toque guionizado sobre la complicación o el widget del Smart Stack. */
  tocar?: { en: number; donde: 'complicacion' | 'widget' };
  guiones?: Partial<Record<FaseId, Array<{ en: number; gesto: GestoGuion }>>>;
  acuses?: Acuse[];
  inicialResumen?: { pagina?: number };
  metodo?: MetodoResumen;
}

type Fase =
  | { f: 'esfera'; pagina: 0 | 1 }
  | { f: 'dia-libre' }
  | { f: 'entreno-libre' }
  | { f: 'brief' }
  | { f: 'donde' }
  | { f: 'gps' }
  | { f: 'cuenta'; n: number }
  | { f: 'vivo'; plan: PlanSesion; inicio: InicioSecuencia; sim: Simulador; inicial?: MunecaProps['inicial']; enfriamiento: boolean }
  | { f: 'fin'; r: Resultado; natural: boolean }
  | { f: 'rpe'; r: Resultado }
  | { f: 'resumen'; r: Resultado };

const HORA = '7:24';
const PPM_EN_REPOSO = 72;

const KEYFRAMES = `
@keyframes ad-gira { to { transform: rotate(360deg); } }
@keyframes ad-abre { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: none; } }
`;

/** Lo que dice la complicación después: la sesión ya hecha, en su lenguaje. */
function hechaDe(r: Resultado, familia: Familia): Hoy {
  const d = r.metros != null ? fmtDistancia(r.metros) : null;
  const km = d ? `${d.valor} ${d.unidad}` : null;
  const juzgadas = r.series.filter((s) => s.veredicto != null);
  const base = { tipo: 'hecha' as const, pasos: r.pasos };
  if (familia === 'fuerza') {
    const vol = r.fuerza.reduce((a, e) => a + volumen(e), 0);
    return { ...base, titulo: `${r.fuerza.reduce((a, e) => a + e.series.length, 0)} series`, sub: `${miles(vol)} kg · ${fmtReloj(r.t)}` };
  }
  if (familia === 'circuito') return { ...base, titulo: fmtReloj(tiempoCircuito(r)), sub: completitud(r).cuenta ?? '' };
  if (juzgadas.length > 0) {
    const dentro = juzgadas.filter((s) => s.veredicto === 'dentro').length;
    return { ...base, titulo: `${dentro} de ${juzgadas.length} dentro`, sub: [km, fmtReloj(r.t)].filter(Boolean).join(' · ') };
  }
  return { ...base, titulo: km ?? fmtReloj(r.t), sub: `${fmtReloj(r.t)} · ${fmtRitmo(r.metros ? r.t / (r.metros / 1000) : null)} /km` };
}

function faseInicial(a: Arranque): Fase {
  switch (a.en) {
    case 'esfera':
      return { f: 'esfera', pagina: 0 };
    case 'stack':
      return { f: 'esfera', pagina: 1 };
    case 'brief':
      return { f: 'brief' };
    case 'dia-libre':
      return { f: 'dia-libre' };
    case 'fin':
      return { f: 'fin', r: a.r, natural: a.natural ?? true };
    case 'rpe':
      return { f: 'rpe', r: a.r };
    case 'resumen':
      return { f: 'resumen', r: a.r };
    case 'vivo':
      return { f: 'cuenta', n: -1 };
  }
}

/** Las caras que no son de correr, las mínimas del kit (las de verdad: «Muñeca · fuerza» y «· circuito»). */
const cara = (seq: Secuencia) => (seq.paso.clase === 'fuerza' ? <CaraFuerza seq={seq} /> : seq.paso.clase === 'estacion' ? <CaraEstacion seq={seq} /> : null);

export function Flujo({ escena, onLog }: { escena: Escena; onLog: (l: string) => void }) {
  const ev = useEventos(onLog);
  const [sesion, setSesion] = useState<Sesion | null>(escena.sesion);
  const [fase, setFase] = useState<Fase>(() => {
    const a = escena.arranque;
    if (a.en === 'vivo' && escena.sesion) {
      return { f: 'vivo', plan: escena.sesion.plan, inicio: a.inicio, sim: a.sim ?? cuerpo({ ppmDesde: 150 }), inicial: a.inicial, enfriamiento: false };
    }
    return faseInicial(a);
  });
  const [hoy, setHoy] = useState<Hoy>(() => (escena.sesion ? { tipo: 'sesion', pasos: escena.sesion.plan.pasos } : { tipo: 'descanso', manana: escena.manana ?? null }));
  const [gps, setGps] = useState<EstadoGps>(escena.gpsEn === 0 ? 'listo' : 'buscando');
  const [ppm, setPpm] = useState<number | null>(escena.gpsEn === 0 ? PPM_EN_REPOSO : null);
  const [sinGps, setSinGps] = useState(false);
  const [previo, setPrevio] = useState<Resultado | null>(null);
  const [propio, setPropio] = useState<{ e: Emision; desde: number } | null>(null);

  // Lo más reciente para los temporizadores (que no se reinician por repintar).
  const reciente = useRef({ fase, sesion, ultimoN: 0 });
  useEffect(() => {
    reciente.current = { fase, sesion, ultimoN: ev.ultimo?.n ?? 0 };
  });

  // El GPS y el pulso empiezan a buscar al abrir el brief (o al elegir correr libre): prepare().
  const preparando = fase.f === 'brief' || fase.f === 'donde' || fase.f === 'gps';
  const preparado = useRef(false);
  useEffect(() => {
    if (!preparando || preparado.current || escena.gpsEn === 0) return;
    preparado.current = true;
    const tPulso = setTimeout(() => setPpm(PPM_EN_REPOSO), escena.pulsoEn ?? 1600);
    const tGps = setTimeout(() => {
      setGps('listo');
      const s = reciente.current.sesion;
      if (s && !necesitaGps(s)) return;
      // «GPS listo» (§4): .success. El kit aún no tiene este evento: se escribe aquí con su háptico.
      const e: Emision = { n: -1, eventos: [], vibra: 'bloque', haptico: '.success', voz: null, linea: 'GPS listo — háptico .success' };
      setPropio({ e, desde: reciente.current.ultimoN });
      onLog(e.linea);
      if (reciente.current.fase.f === 'gps') setTimeout(() => setFase({ f: 'cuenta', n: 3 }), 900);
    }, escena.gpsEn ?? 4200);
    return () => {
      clearTimeout(tPulso);
      clearTimeout(tGps);
      preparado.current = false;
    };
    // Una sola búsqueda por escenario, desde la primera fase que prepara.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparando]);

  const arrancarVivo = (s: Sesion) => {
    // Sin esperar al GPS: sigue buscando lo que le quedaba (el ritmo es «—» hasta entonces).
    const restante = sinGps ? Math.ceil((escena.gpsEn ?? 4200) / 1000) + 3 : 0;
    const sim = cuerpo({ ppmDesde: PPM_EN_REPOSO, gps: restante > 0 ? (t) => (t < restante ? 'buscando' : 'listo') : undefined });
    setFase({ f: 'vivo', plan: s.plan, inicio: { i: 0, t: 0, sesionT: 0, sesionM: 0 }, sim, enfriamiento: false });
  };

  // El 3-2-1 al empezar (P13): un .click por segundo y el GO con su voz.
  const enCuenta = fase.f === 'cuenta';
  useEffect(() => {
    if (!enCuenta || !reciente.current.sesion) return;
    const s = reciente.current.sesion;
    const primero = s.plan.pasos.find((p) => p.rol === 'trabajo') ?? s.plan.pasos[0]!;
    const t = [
      setTimeout(() => {
        setFase({ f: 'cuenta', n: 3 });
        ev.emitir('cuenta');
      }, 0),
      setTimeout(() => {
        setFase({ f: 'cuenta', n: 2 });
        ev.emitir('cuenta');
      }, 1000),
      setTimeout(() => {
        setFase({ f: 'cuenta', n: 1 });
        ev.emitir('cuenta');
      }, 2000),
      setTimeout(() => {
        setFase({ f: 'cuenta', n: 0 });
        ev.emitir('go', vozInicio(primero));
      }, 3000),
      setTimeout(() => arrancarVivo(s), 3700),
    ];
    return () => t.forEach(clearTimeout);
    // Una cuenta por entrada en la fase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enCuenta]);

  const ultimo = propio && (ev.ultimo?.n ?? 0) <= propio.desde ? propio.e : ev.ultimo;

  const empezar = () => {
    const s = sesion;
    if (!s) return;
    onLog('Empezar (toque 2 desde la esfera)');
    if (s.familia !== 'fuerza' && s.entorno == null) setFase({ f: 'donde' });
    else if (necesitaGps(s) && gps !== 'listo') setFase({ f: 'gps' });
    else setFase({ f: 'cuenta', n: 3 });
  };

  const elegirEntorno = (e: Entorno) => {
    if (!sesion) return;
    const nueva: Sesion = sesion.familia === 'libre' ? correrLibre(e) : { ...sesion, plan: conEntorno(sesion.plan, e), entorno: e };
    setSesion(nueva);
    setFase(e !== 'cinta' && gps !== 'listo' ? { f: 'gps' } : { f: 'cuenta', n: 3 });
  };

  const alFin = (fin: FinDeVivo) => {
    if (fase.f !== 'vivo') return;
    const r = resultadoDeVivo(fase.plan, fin, escena.base ?? null);
    if (fase.enfriamiento && previo) {
      const libreS = r.t - previo.t;
      setFase({ f: 'fin', r: { ...previo, t: r.t, metros: r.metros, ppmMedio: r.ppmMedio, km: [...previo.km, ...r.km], libreS }, natural: true });
      return;
    }
    setFase({ f: 'fin', r, natural: fin.final === 'natural' });
  };

  const abrir = (desde: string) => {
    onLog(`${desde} → abre lo de hoy (toque 1)`);
    setFase(sesion ? { f: 'brief' } : { f: 'dia-libre' });
  };

  const familia: Familia = sesion?.familia ?? 'libre';
  const metodo = escena.metodo ?? METODO_RESUMEN_DEFECTO;
  const g = escena.guiones ?? {};

  let vista: ReactNode = null;
  switch (fase.f) {
    case 'esfera':
      vista = (
        <Pila
          paginas={[
            { id: 'esfera', titulo: 'Esfera', contenido: <Esfera hoy={hoy} hora={HORA} tocarEn={escena.tocar?.donde === 'complicacion' && hoy.tipo !== 'hecha' ? escena.tocar.en : undefined} onAbrir={() => abrir('Complicación')} /> },
            { id: 'stack', titulo: 'Smart Stack', contenido: <SmartStack hoy={hoy} hora={HORA} tocarEn={escena.tocar?.donde === 'widget' && hoy.tipo !== 'hecha' ? escena.tocar.en : undefined} onAbrir={() => abrir('Widget del Smart Stack')} /> },
          ]}
          puntos={false}
          inicial={{ pagina: fase.pagina }}
          ultimo={ultimo}
          guion={hoy.tipo === 'hecha' ? undefined : g.esfera}
          sinLados="En la esfera, deslizar cambia de esfera: aquí solo cuenta lo de hoy"
          onLog={onLog}
        />
      );
      break;
    case 'dia-libre':
      vista = (
        <DiaLibre
          manana={escena.manana ?? null}
          onCorrer={() => {
            onLog('Correr libre → sin plan, sin objetivo; se guarda «libre», nunca «parcial»');
            setSesion(correrLibre(null));
            setFase({ f: 'donde' });
          }}
          onEntreno={() => setFase({ f: 'entreno-libre' })}
          ultimo={ultimo}
          guion={g['dia-libre']}
          onLog={onLog}
        />
      );
      break;
    case 'entreno-libre':
      vista = <EntrenoLibre ultimo={ultimo} onVolver={() => setFase({ f: 'dia-libre' })} onLog={onLog} />;
      break;
    case 'brief':
      vista = sesion ? <Brief sesion={sesion} gps={gps} ppm={ppm} onEmpezar={empezar} ultimo={ultimo} guion={g.brief} onLog={onLog} /> : null;
      break;
    case 'donde':
      vista = <Donde onElige={elegirEntorno} ultimo={ultimo} onLog={onLog} />;
      break;
    case 'gps':
      vista = (
        <EsperaGps
          entorno={sesion?.entorno ?? 'calle'}
          listo={gps === 'listo'}
          ppm={ppm}
          onSinGps={() => {
            setSinGps(true);
            setFase({ f: 'cuenta', n: 3 });
          }}
          ultimo={ultimo}
          onLog={onLog}
        />
      );
      break;
    case 'cuenta': {
      const primero = sesion?.plan.pasos.find((p) => p.rol === 'trabajo');
      vista = primero && fase.n >= 0 ? (
        <div style={{ position: 'absolute', inset: 0, background: C.fondo, fontFamily: 'var(--twin-font-sans)', fontVariantNumeric: 'tabular-nums', color: C.tinta }}>
          <TresDosUno n={fase.n} paso={primero} />
        </div>
      ) : null;
      break;
    }
    case 'vivo':
      vista = (
        <VivoFin
          plan={fase.plan}
          sim={fase.sim}
          inicio={fase.inicio}
          control={fase.plan.pasos.some((p) => p.vueltaAutoM) ? 'vuelta' : 'siguiente'}
          cara={cara}
          inicial={fase.inicial}
          guion={g.vivo}
          onFin={alFin}
          onLog={onLog}
        />
      );
      break;
    case 'fin': {
      const r = fase.r;
      vista = (
        <Completada
          natural={fase.natural}
          completitud={completitud(r, metodo)}
          metros={r.metros}
          libreS={r.libreS}
          onGuardar={() => {
            onLog(`Guardar → se sella la sesión: ${completitud(r, metodo).estado} (lo decide lo hecho, no la pantalla)`);
            ev.emitir('accion');
            setFase({ f: 'rpe', r });
          }}
          onSeguir={() => {
            onLog('Seguir → sigue grabando: enfriamiento libre, en la misma sesión');
            ev.emitir('accion');
            setPrevio(r);
            const e = sesion?.entorno ?? null;
            setFase({
              f: 'vivo',
              plan: enfriamientoLibre(e),
              inicio: { i: 0, t: 0, sesionT: r.t, sesionM: r.metros ?? 0, ppmMedio: r.ppmMedio ?? undefined, kmDesdeT: r.t },
              sim: cuerpo({ ppmDesde: 150 }),
              enfriamiento: true,
            });
          }}
          onSigue={() => setFase({ f: 'rpe', r })}
          ultimo={ultimo}
          guion={g.fin}
          onLog={onLog}
        />
      );
      break;
    }
    case 'rpe':
      vista = <Rpe eventos={ev} onHecho={(rpe) => setFase({ f: 'resumen', r: { ...fase.r, rpe } })} guion={g.rpe} onLog={onLog} />;
      break;
    case 'resumen':
      vista = (
        <Resumen
          r={fase.r}
          familia={familia}
          acuses={escena.acuses}
          metodo={metodo}
          onListo={() => {
            onLog('Listo → la esfera: la complicación ya dice lo hecho');
            setHoy(hechaDe(fase.r, familia));
            setFase({ f: 'esfera', pagina: 0 });
          }}
          ultimo={ultimo}
          guion={g.resumen}
          inicial={escena.inicialResumen}
          onLog={onLog}
        />
      );
      break;
  }

  const clave = fase.f === 'cuenta' ? 'cuenta' : fase.f === 'esfera' ? `esfera-${hoy.tipo}` : fase.f === 'vivo' ? `vivo-${fase.enfriamiento}` : fase.f;
  return (
    <>
      <style>{KEYFRAMES}</style>
      <div key={clave} style={{ position: 'absolute', inset: 0, animation: fase.f === 'cuenta' ? undefined : 'ad-abre 260ms ease-out' }}>
        {vista}
      </div>
    </>
  );
}
