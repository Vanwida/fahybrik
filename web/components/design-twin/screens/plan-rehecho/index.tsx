'use client';

// PLAN · REHECHO — la pestaña donde se decide y se empieza el entreno, con el
// diseño de «Hoy · El día» (29-sep).
//
// TESIS: el atleta abre el Plan para saber qué toca y cómo empezar, sudando y con
// una mano. La pantalla es UN día mostrado en grande, con el tinte de su momento,
// y el carril de la semana como la línea que lo ancla (una muesca de la card
// apunta al chip). Encima, dónde estás en el bloque y lo que busca el coach;
// abajo, UNA acción, siempre la misma puerta.
//
// Recibe una `LecturaPlan` (kit-plan/contrato) y solo PINTA: qué pantalla toca
// (`vista`), qué tinte, qué acción y qué menú lo deciden funciones puras de
// `kit-plan/modelo`, con tests. Aquí vive el estado de la demo (qué día miras,
// qué semana, qué capa está abierta) y las mutaciones se aplican sobre la semana
// para que el prototipo esté vivo: marcar hoy como hecho cambia la card de
// naranja a verde.
//
// LAS DECISIONES DE JERARQUÍA, una línea cada una:
//  1. El sujeto es el día mostrado, el único bloque que pasa de 40 px: si todo
//     pesara lo mismo, el momento no se leería.
//  2. El naranja sólido es solo «haz esto ahora»: hoy y por hacer. Un día que
//     viene lleva el naranja suave; hecho, verde; a medias, ámbar; sin hacer,
//     gris (un hecho, no un juicio); descanso, verde azulado.
//  3. La acción es una pastilla de tinta invertida anclada abajo, no un segundo
//     naranja: el sujeto es lo que miras, la acción es lo que tocas (§10.5).
//  4. La card no lleva acción dentro: como el contenido puede ser largo (16
//     estaciones), la puerta tiene que estar siempre a la vista, sin scrollear.
//  5. Hoy y el día mirado son dos marcas distintas del carril (aro / relleno):
//     hojear no borra dónde estás.
//  6. Tocar un día NO abre otra pantalla: cambia la card. El menú del día cuelga
//     de un «···» visible (además de la pulsación larga, que no se descubre ni
//     se alcanza con teclado).
//  7. La dosis no vive en la card (DECISIONS 7-ago): su sitio es la nota del
//     coach para ese día, y sin nota se calla.
//  8. Las flechas de semana existen y dicen la verdad: el candado explica el
//     límite del club, y cargar o fallar no se disfraza de «tu coach no la ha llenado».
//  9. Cada estado sin día (pausa, vacíos, error) es la MISMA card con otro
//     contenido y su salida anclada en el mismo sitio.
// 10. La segunda sesión (y cualquier otra) es una fila compacta debajo, jamás un
//     segundo héroe, y el sujeto es la que TOCA, no la primera del array.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Pantalla, TabBar } from '../../kit-composicion/chrome';
import { Estilos } from '../../kit-dia/estilos';
import { MARGEN } from '../../kit-dia/tokens';
import type { CasoPlan, LecturaPlan, SemanaDelPlan, SesionDelPlan } from '../../kit-plan/contrato';
import { TODOS_LOS_CASOS, casoDelPlan } from '../../kit-plan/indice';
import {
  accionAnclada,
  accionesDeSesion,
  borrarSesion,
  deshacerHecho,
  desgloseDe,
  diasDestino,
  estadoEfectivo,
  etiquetaDeDiaDestino,
  etiquetaDeFecha,
  marcarHecha,
  moverSesion,
  rangoDeSemana,
  tieneAlgunaSesion,
  tituloDeSemana,
  tonoDelSujeto,
  vista,
  type AccionAnclada,
  type ClaveAccion,
} from '../../kit-plan/modelo';
import { TEXTOS } from '../../kit-plan/textos';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Cabecera, CabeceraEsqueleto } from './cabecera';
import { AvisoDeFallo, HojaAcciones, HojaMover, type GrupoDeAcciones } from './capas';
import { Dialogos, type Dialogo } from './dialogos';
import { Carril, CarrilEsqueleto } from './carril';
import { PlanCromo } from './cromo';
import { SujetoEsqueleto, SujetoEstado } from './estados';
import { Dock, DockEsqueleto, FilaSesion, propsDeDock } from './filas';
import { EstilosPlan } from './estilos';
import { PlanLibre } from './libre';
import { SujetoDescanso, SujetoSesion } from './sujeto';

export const meta: TwinMeta = {
  id: 'plan-rehecho',
  titulo: 'Plan · rehecho',
  zona: 'Plan y hoy',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'La pestaña donde se decide y se empieza el entreno, con el diseño de «Hoy · El día»: la semana como cabecera (bloque, «Semana N de M», línea del coach), un carril de siete días con su sello y, debajo, UN día mostrado en grande con el tinte de su momento (naranja sólido solo si es hoy y está por hacer) y sus partes con los ejercicios reales. Tocar un día cambia la card; la única acción va anclada abajo y es la misma puerta en todos los estados. Incluye la versión sin coach. Prueba: marcar hoy como hecho (la card pasa a verde), hojear la semana que viene, mantener pulsado un día.',
  fuentes: [],
  enApp:
    'Plan es PlanView.swift (cromo con compartir, ciclo, historial y chat; cabecera del bloque; carril de siete días con pulsación larga; héroe de la sesión mostrada; acción anclada) y, sin coach, FreePlanView.swift. Esto conserva todo lo que hacen hoy y cambia el lenguaje visual al de «Hoy · El día». Además corrige siete cosas del Swift que se ven al modelarlo (lista en kit-plan/modelo.ts), entre ellas que «Ver la semana que viene» del vacío con inicio futuro no llevaba a ninguna parte.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = TODOS_LOS_CASOS.map((c) => ({ id: c.id, titulo: c.titulo, descripcion: c.mira }));

export function Screen({ escenario, onLog }: TwinScreenProps) {
  const caso = casoDelPlan(escenario);
  return caso.tipo === 'libre' ? <PlanLibre caso={caso} onLog={onLog} /> : <PlanConCoach caso={caso} onLog={onLog} />;
}

// ---------------------------------------------------------------------------

/** Lo que tarda en «llegar» una semana o un desglose en la demo (en la app es una petición). */
const RETARDO_SEMANA_MS = 700;
const RETARDO_DESGLOSE_MS = 450;
const RETARDO_REINTENTO_MS = 1400;
/** Lo que tarda en fallar «Marcar como hecha» en el escenario que lo hace fallar. */
const RETARDO_FALLO_MS = 700;

type Hoja = { tipo: 'sesiones'; ids: string[] } | { tipo: 'mover'; id: string };

function PlanConCoach({ caso, onLog }: { caso: CasoPlan; onLog: (linea: string) => void }) {
  const base = caso.lectura;
  const [actual, setActual] = useState<SemanaDelPlan | null>(base.actual);
  const [siguiente, setSiguiente] = useState(base.siguiente);
  const [offset, setOffset] = useState(caso.abre?.offset ?? 0);
  const [seleccion, setSeleccion] = useState<string | null>(caso.abre?.iso ?? null);
  const [cargandoSiguiente, setCargandoSiguiente] = useState(false);
  const [reintentando, setReintentando] = useState(false);
  const [hoja, setHoja] = useState<Hoja | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const l: LecturaPlan = useMemo(() => ({ ...base, actual, siguiente }), [base, actual, siguiente]);
  const v = vista(l, { offset, seleccion, cargandoSiguiente });
  const tono = tonoDelSujeto(v);
  const accion = accionAnclada(v, l);
  const dock = accion ? propsDeDock(accion, base.coach) : null;

  const semana = v.tipo === 'semana' ? v.semana : null;
  const cuerpo = v.tipo === 'semana' ? v.cuerpo : null;
  const mostrada = cuerpo && (cuerpo.tipo === 'sesion' || cuerpo.tipo === 'descanso') ? cuerpo.dia : null;
  const indice = semana && mostrada ? semana.dias.findIndex((d) => d.iso === mostrada.iso) : -1;

  // ── Temporizadores de la demo (se limpian al cambiar de escenario) ─────────
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const luego = (ms: number, f: () => void) => {
    timers.current.push(setTimeout(f, ms));
  };
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    onLog(
      v.tipo === 'semana' && v.cuerpo.tipo === 'sesion'
        ? `Sujeto: ${v.cuerpo.principal.titulo} (${v.cuerpo.estado}) · ${etiquetaDeFecha(v.cuerpo.dia.iso, l.hoyIso)}`
        : `Sujeto: ${v.tipo}${v.tipo === 'semana' ? ` · ${v.cuerpo.tipo}` : ''}`,
    );
    // Solo al abrir el escenario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── El desglose del día mostrado llega aparte (una petición por día) ──────
  // La primera card ya está en memoria (cache-first) y no espera; las que se
  // miran después se piden: esqueleto con la forma de las partes hasta que llegan.
  const idMostrado = cuerpo?.tipo === 'sesion' ? cuerpo.principal.id : null;
  const [llegados, setLlegados] = useState<Set<string>>(() => {
    const v0 = vista(base, { offset: caso.abre?.offset ?? 0, seleccion: caso.abre?.iso ?? null, cargandoSiguiente: false });
    return new Set(v0.tipo === 'semana' && v0.cuerpo.tipo === 'sesion' ? [v0.cuerpo.principal.id] : []);
  });
  useEffect(() => {
    if (!idMostrado || llegados.has(idMostrado)) return;
    const t = setTimeout(() => setLlegados((s) => new Set(s).add(idMostrado)), RETARDO_DESGLOSE_MS);
    return () => clearTimeout(t);
  }, [idMostrado, llegados]);

  const desgloseDeLaCard = (id: string) =>
    !llegados.has(id) && base.desgloses[id]?.estado === 'listo' ? ({ estado: 'cargando' } as const) : desgloseDe(l, id);

  // ── Semana que viene y volver ─────────────────────────────────────────────
  const yaLlegoLaSiguiente = useRef(false);
  const irSiguiente = () => {
    if (!actual) return;
    if (actual.hayMasAdelante) {
      setSeleccion(null);
      setOffset(1);
      onLog('Semana siguiente → pide la semana que viene');
      if (!yaLlegoLaSiguiente.current) {
        setCargandoSiguiente(true);
        luego(RETARDO_SEMANA_MS, () => {
          yaLlegoLaSiguiente.current = true;
          setCargandoSiguiente(false);
        });
      }
    } else if (actual.bloqueadaPorHorizonte) {
      onLog('Semana siguiente → tu club la bloquea: dice por qué');
      setDialogo({ tipo: 'muro' });
    }
  };
  const volver = () => {
    setOffset(0);
    setSeleccion(null);
    onLog('Volver a esta semana → vuelve a hoy');
  };
  const deslizar = (dir: -1 | 1) => {
    if (dir === 1 && offset === 0) irSiguiente();
    else if (dir === -1 && offset > 0) volver();
  };

  const reintentar = () => {
    onLog('Reintentar → vuelve a pedirlo');
    if (cuerpo?.tipo === 'semana-falla') {
      setCargandoSiguiente(true);
      luego(RETARDO_SEMANA_MS, () => setCargandoSiguiente(false));
      return;
    }
    if (reintentando) return;
    setReintentando(true);
    luego(RETARDO_REINTENTO_MS, () => setReintentando(false));
  };

  // ── Abrir y empezar: UNA puerta, con el aviso de lo que se pisaría ─────────
  const empezar = (s: SesionDelPlan) => {
    if (l.guardado) {
      onLog('Empezar → hay un entreno en curso: pregunta antes de pisarlo');
      setDialogo({ tipo: 'conflicto', sesion: s });
    } else {
      onLog(`Empezar → abre la ficha de «${s.titulo}» y de ahí arranca`);
    }
  };

  const alAccion = (a: AccionAnclada) => {
    switch (a.tipo) {
      case 'empezar':
        return empezar(a.sesion);
      case 'ver-hecho':
        return onLog(`Ver lo que hiciste → abre lo que registraste en «${a.sesion.titulo}»`);
      case 'ver-siguiente':
        return onLog(`Ver lo de ${a.cuando} → abre «${a.sesion.titulo}»`);
      case 'escribir-al-coach':
        return onLog('Escribir al coach → abre el chat');
      case 'reintentar':
        return reintentar();
      case 'ver-semana-que-viene':
        return irSiguiente();
      case 'volver-a-esta-semana':
        return volver();
    }
  };

  // ── Mutaciones sobre la semana que se mira ────────────────────────────────
  const mutar = (f: (s: SemanaDelPlan) => SemanaDelPlan) => {
    if (offset === 0) setActual((s) => (s ? f(s) : s));
    else setSiguiente((s) => (typeof s === 'object' && s !== null ? f(s) : s));
  };
  const fallos = useRef(caso.fallaAcciones ? 1 : 0);

  const marcar = (s: SesionDelPlan) => {
    const previo = semana;
    mutar((sem) => marcarHecha(sem, s.id, l.hoyIso));
    if (fallos.current > 0 && previo) {
      // El servidor rechaza: la marca optimista se revierte y se dice qué pasó.
      fallos.current -= 1;
      onLog(`Marcar como hecha → «${s.titulo}» queda hecha al momento...`);
      luego(RETARDO_FALLO_MS, () => {
        mutar(() => previo);
        setAviso(TEXTOS.fallo.marcar);
        onLog('Marcar como hecha → el servidor falla: se revierte y se avisa');
      });
    } else {
      onLog(`Marcar como hecha → «${s.titulo}» queda hecha, sin inventar minutos`);
    }
  };

  const elegirAccion = (clave: ClaveAccion, s: SesionDelPlan) => {
    if (clave === 'mover') return setHoja({ tipo: 'mover', id: s.id });
    setHoja(null);
    switch (clave) {
      case 'tecnica':
        return onLog(`Ver ejercicios y técnica → abre la hoja de «${s.titulo}»`);
      case 'preguntar':
        return onLog(`Preguntar al coach → abre el chat con «${s.titulo}» ya señalado`);
      case 'marcar-hecha':
        return marcar(s);
      case 'completar':
        return empezar(s);
      case 'deshacer':
        return setDialogo({ tipo: 'deshacer', sesion: s });
      case 'editar-libre':
        return onLog(`Editar entreno libre → abre el constructor con «${s.titulo}»`);
      case 'borrar-libre':
        return setDialogo({ tipo: 'borrar', sesion: s });
    }
  };

  const gruposDe = (ids: string[]): GrupoDeAcciones[] => {
    const dias = semana?.dias ?? [];
    return ids.flatMap((id) => {
      const dia = dias.find((d) => d.sesiones.some((s) => s.id === id));
      const sesion = dia?.sesiones.find((s) => s.id === id);
      return dia && sesion
        ? [{ sesion, cuando: etiquetaDeFecha(dia.iso, l.hoyIso), acciones: accionesDeSesion(sesion, { conCoach: true }) }]
        : [];
    });
  };

  const sesionPorId = (id: string) => semana?.dias.flatMap((d) => d.sesiones).find((s) => s.id === id) ?? null;

  // ── Pintura ───────────────────────────────────────────────────────────────
  const columna: CSSProperties = {
    minHeight: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: `6px ${MARGEN}px 24px`,
  };

  // Los estados sin día que mostrar se CENTRAN (§6.1): una sola decisión, el aire simétrico.
  const centrado = v.tipo === 'error' || v.tipo === 'pausa' || v.tipo === 'sin-plan' || (v.tipo === 'semana' && ['semana-falla', 'semana-vacia'].includes(v.cuerpo.tipo));

  const claveDeDia = `${offset}|${mostrada?.iso ?? v.tipo}|${cuerpo?.tipo === 'sesion' ? cuerpo.principal.id : ''}`;

  const cabecera =
    v.tipo === 'cargando' ? (
      <CabeceraEsqueleto />
    ) : v.tipo === 'semana' ? (
      <Cabecera
        nombreBloque={semana?.nombreBloque ?? null}
        titulo={tituloDeSemana(semana?.posicion ?? null, offset)}
        rango={semana ? rangoDeSemana(semana.desde, semana.hasta) : null}
        intencion={semana?.intencion ?? null}
        hojeando={offset > 0}
        puedeAdelante={offset === 0 && !!actual?.hayMasAdelante}
        adelanteBloqueado={offset === 0 && !!actual?.bloqueadaPorHorizonte}
        cargando={cuerpo?.tipo === 'semana-cargando'}
        onAtras={volver}
        onAdelante={irSiguiente}
        onVolver={volver}
      />
    ) : null;

  return (
    <div className="twin-screen-safe">
      <Estilos />
      <EstilosPlan />
      <Pantalla
        estrategia="llena"
        cabecera={
          <PlanCromo
            companero={base.companero}
            conSemana={semana ? tieneAlgunaSesion(semana) : false}
            conChat
            onLog={onLog}
          />
        }
        pie={
          v.tipo === 'cargando' ? (
            <DockEsqueleto />
          ) : accion ? (
            <Dock
              texto={dock!.texto}
              icono={dock!.icono}
              alFinal={dock!.alFinal}
              ocupada={reintentando && accion.tipo === 'reintentar'}
              onAccion={() => alAccion(accion)}
              onMenu={dock!.conMenu && cuerpo?.tipo === 'sesion' ? () => setHoja({ tipo: 'sesiones', ids: [cuerpo.principal.id] }) : undefined}
            />
          ) : null
        }
        tabBar={<TabBar activa="Plan" />}
      >
        <div style={columna}>
          {cabecera ? (
            <div className="hd-sube" style={{ '--i': 0 } as CSSProperties}>
              {cabecera}
            </div>
          ) : null}
          {v.tipo === 'cargando' ? <CarrilEsqueleto /> : null}
          {v.tipo === 'semana' && cuerpo?.tipo === 'semana-cargando' ? <CarrilEsqueleto /> : null}
          {semana && v.tipo === 'semana' ? (
            <div className="hd-sube" style={{ '--i': 1 } as CSSProperties}>
              <Carril
                dias={semana.dias}
                hoyIso={l.hoyIso}
                mostradoIso={mostrada?.iso ?? null}
                tono={tono}
                onDia={(d) => {
                  setSeleccion(d.iso);
                  onLog(`${etiquetaDeFecha(d.iso, l.hoyIso)} → la card enseña ese día`);
                }}
                onLargo={(d) => {
                  onLog(`${etiquetaDeFecha(d.iso, l.hoyIso)} → pulsación larga: sus acciones`);
                  setHoja({ tipo: 'sesiones', ids: d.sesiones.map((s) => s.id) });
                }}
                onDeslizar={deslizar}
              />
            </div>
          ) : null}

          <div
            key={claveDeDia}
            className="pl-cambia"
            style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '1 0 auto', justifyContent: centrado ? 'center' : undefined }}
          >
            {v.tipo === 'cargando' || (v.tipo === 'semana' && cuerpo?.tipo === 'semana-cargando') ? (
              <SujetoEsqueleto />
            ) : v.tipo === 'semana' && cuerpo?.tipo === 'sesion' && semana ? (
              <>
                <SujetoSesion
                  cuerpo={cuerpo}
                  l={l}
                  semana={semana}
                  offset={offset}
                  desglose={desgloseDeLaCard(cuerpo.principal.id)}
                  tono={tono}
                  indice={indice >= 0 ? indice : null}
                  onLog={onLog}
                />
                {cuerpo.otras.map((o) => (
                  <FilaSesion
                    key={o.id}
                    sesion={o}
                    dia={cuerpo.dia}
                    l={l}
                    onAbrir={() =>
                      estadoEfectivo(o, cuerpo.dia.iso, l.hoyIso) === 'hecha' || o.estado === 'parcial'
                        ? onLog(`Ver lo que hiciste → abre lo que registraste en «${o.titulo}»`)
                        : empezar(o)
                    }
                    onMenu={() => setHoja({ tipo: 'sesiones', ids: [o.id] })}
                  />
                ))}
              </>
            ) : v.tipo === 'semana' && cuerpo?.tipo === 'descanso' && semana ? (
              <SujetoDescanso cuerpo={cuerpo} l={l} semana={semana} tono={tono} indice={indice >= 0 ? indice : null} onLog={onLog} />
            ) : (
              <SujetoEstado v={v} l={l} tono={tono} />
            )}
          </div>
        </div>
      </Pantalla>

      {hoja?.tipo === 'sesiones' && gruposDe(hoja.ids).length > 0 ? (
        <HojaAcciones grupos={gruposDe(hoja.ids)} onElegir={elegirAccion} onCerrar={() => setHoja(null)} />
      ) : null}
      {hoja?.tipo === 'mover' && semana && sesionPorId(hoja.id) ? (
        <HojaMover
          sesion={sesionPorId(hoja.id)!}
          destinos={diasDestino(semana, sesionPorId(hoja.id)!).map((d) => ({ iso: d.iso, etiqueta: etiquetaDeDiaDestino(d) }))}
          onAtras={() => setHoja({ tipo: 'sesiones', ids: [hoja.id] })}
          onElegir={(iso, etiqueta) => {
            const s = sesionPorId(hoja.id)!;
            mutar((sem) => moverSesion(sem, s.id, iso, l.hoyIso));
            setSeleccion(iso);
            setHoja(null);
            onLog(`Mover a otro día → «${s.titulo}» pasa a ${etiqueta}`);
          }}
          onCerrar={() => setHoja(null)}
        />
      ) : null}

      <Dialogos
        dialogo={dialogo}
        muro={l.muro}
        guardado={l.guardado?.titulo ?? null}
        onCerrar={() => setDialogo(null)}
        onDeshacer={(s) => {
          mutar((sem) => deshacerHecho(sem, s.id, l.hoyIso));
          setDialogo(null);
          onLog(`Deshacer hecho → «${s.titulo}» vuelve a pendiente`);
        }}
        onBorrar={(s) => {
          mutar((sem) => borrarSesion(sem, s.id, l.hoyIso));
          setDialogo(null);
          onLog(`Borrar entreno libre → «${s.titulo}» se borra del todo`);
        }}
        onLog={onLog}
      />
      {aviso ? <AvisoDeFallo texto={aviso} onCerrar={() => setAviso(null)} /> : null}
    </div>
  );
}
