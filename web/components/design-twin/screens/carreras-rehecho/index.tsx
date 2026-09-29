'use client';

// CARRERAS · REHECHO — propuesta de la pestaña «Carreras» con el diseño de
// «Hoy · El día» (29-sep).
//
// TESIS: la pestaña de carreras no enseña el mismo panel siempre, enseña LA
// CARRERA QUE IMPORTA AHORA, y eso cambia a lo largo de la temporada. `sujeto(l)`
// (kit-carreras/decide, puro, con test sobre los veinte casos) decide cuál es con
// una precedencia objetiva: cargando, error, una carrera corrida hace poco a la
// que falta el resultado, el objetivo con su cuenta atrás, la última carrera, la
// invitación. Todo lo demás se subordina a él. Una cosa enorme, el resto discreto.
//
// Recibe una `LecturaCarreras` (kit-carreras/contrato) y solo PINTA. La altura es
// `llena` (CONTRATO-UI §6.1): cromo y barra de pestañas fijos, el cuerpo scrollea
// cuando desborda y, cuando NO llega al alto, el sobrante entra en el propio
// póster (entre su título y su acción), jamás en una cola muerta.
//
// LAS DECISIONES DE JERARQUÍA, una línea cada una:
//  1. El sujeto es un póster con la única foto de la pestaña y el único bloque que
//     pasa de 40 px: si todo pesara lo mismo, «lo que importa ahora» no se leería.
//  2. El naranja sólido es para «haz esto ahora» (la cuenta atrás, fijar, importar);
//     el color de estado (por delante, te faltan) va en la marca, nunca en la cifra.
//  3. La acción es una pastilla de tinta invertida y sola, y es la SALIDA del hueco
//     más importante del póster: sin meta se fija, sin ser principal se hace, sin
//     resultado se importa. Solo con predicho es «Ver mi camino».
//  4. El predicho jamás inventa un tiempo: parcial dice qué tramos faltan, sin
//     datos dice que se llena solo, sin meta dice cómo fijarla.
//  5. «Próximas» y «Pasadas» son secciones, no pilas de tarjetas iguales: el
//     principal y sus secundarias van por día; el historial se despliega a
//     parciales y lo largo se pliega con contador.
//  6. Lo que un atleta no puede llenar (un puesto que nadie midió, una estación sin
//     tiempo) se calla; lo que SÍ puede llenar con un acto se declara con su salida.
//  7. Una carrera de equipo dice, en cada sitio donde aparece, que su tiempo es del
//     equipo. Nunca se compara con una individual.
//  8. Las acciones raras (preguntar al coach, hacer principal, eliminar) cuelgan
//     de un ⋯; «Eliminar» y «No soy yo» siempre pasan por su confirmación.
//  9. Las dos hojas de entrada (importar el historial, buscar y fijar una carrera)
//     y la del tiempo objetivo se prueban de verdad: lo que fijas o importas cambia
//     la lectura y, con ella, el sujeto.
//
// Cada pieza resuelve sus cuatro estados: con datos, en frío (esqueletos con la
// forma final), vacío (invitación con su salida) y error («Reintentar»).

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react';
import { TabBar, Pantalla } from '../../kit-composicion/chrome';
import { CROMO } from '../../kit-composicion/tokens';
import { aplicar, prediccionTras, type Cambio } from '../../kit-carreras/acciones';
import { CASOS_CARRERAS, casoCarreras } from '../../kit-carreras/casos';
import type { LecturaCarreras, Prediccion, ProximaCarrera } from '../../kit-carreras/contrato';
import { ANALISIS_VALENCIA, CANDIDATOS } from '../../kit-carreras/datos';
import { principalDe, proximasRestantes, sujeto, type AccionObjetivo } from '../../kit-carreras/decide';
import type { TwinEscenario, TwinMeta, TwinScreenProps } from '../../types';
import { Estilos } from '../../kit-dia/estilos';
import { IcoChat, IcoCheck } from '../../kit-dia/iconos';
import { Etiqueta } from '../../kit-dia/piezas';
import { fuente, MARGEN, RADIO, TAM, tinte, velo } from '../../kit-dia/tokens';
import { BotonCromo } from '../hoy-dia/cromo';
import { HojaBuscar } from './buscar';
import { EstilosCarreras } from './estilos';
import { Confirmacion, MenuAcciones, type AccionCarrera } from './hojas';
import { HojaImportar } from './importar';
import { HojaMeta } from './meta';
import { Pasadas } from './pasadas';
import { IcoAlerta } from './piezas';
import { PosterObjetivo } from './poster';
import { Proximas } from './proximas';
import { HeroError, PosterCargando, PosterPostcarrera, PosterUltima, PosterVacio } from './sujetos';

export const meta: TwinMeta = {
  id: 'carreras-rehecho',
  titulo: 'Carreras · rehecho',
  zona: 'Marcas y tests',
  estado: 'propuesta',
  actualizado: '2026-09-29',
  descripcion:
    'La pestaña enseña la carrera que importa ahora: el objetivo con su cuenta atrás enorme, su meta y un predicho que nunca inventa un tiempo; la carrera de ayer si falta su resultado; tu última carrera si no hay nada por delante; o la invitación con sus dos salidas. Debajo, las próximas por día y tu historial con su análisis. Prueba de verdad: el ⋯ de una carrera (hacer principal, eliminar), «Buscar carrera» hasta fijarla, «Importar» (escribe «marc»; «zzz» no encuentra nada, «error» falla, y «Marco Vilá» no se puede leer) y «¿No eres tú?».',
  fuentes: [],
  enApp:
    'Carreras es CarrerasView.swift: dos secciones, PRÓXIMAS (una tarjeta por objetivo, el principal abre «predicho hoy + camino») y PASADAS (última carrera, informe, estaciones, ritmo por km, evolución e historial importado, dobles incluidos), con las hojas de importar, buscar y fijar carrera. Esto sustituye la pila de tarjetas iguales por un sujeto adaptativo, sube el predicho del principal a la pestaña, declara el error de carga (hoy parece un vacío) y avisa de que fijar una carrera pasa la actual a secundaria. Los detalles que cuelgan (RaceDetailView, StationDetailView, PredichoVsRealView) no se rehacen: solo su puerta.',
  dispositivo: 'iphone',
  soportaHorizontal: false,
};

export const escenarios: TwinEscenario[] = CASOS_CARRERAS.map((c) => ({ id: c.id, titulo: c.titulo, descripcion: c.mira }));

/** Cuánto dura el aviso de «hecho» antes de irse solo. */
const AVISO_MS = 3400;
/** Un error se queda más: hay que leerlo entero y saber qué hacer. */
const AVISO_ERROR_MS = 6500;
/** Lo que tarda «el predicho» en recalcularse tras cambiar de principal o de meta. */
const RECALCULO_MS = 900;
/** Lo que tarda en volver a cargar la pantalla entera tras un error (para ver el paso de esqueleto a datos). */
const RECARGA_MS = 1200;
/** Lo que dura la importación del caso «en curso» (para poder mirarla) y la de un toque real. */
const IMPORTACION_EN_CURSO_MS = 4500;

/** Los avisos de error de las acciones, con las palabras de la app (nunca un código). */
const FALLO: Partial<Record<Cambio['tipo'], string>> = {
  quitar: 'No pudimos quitar este objetivo. Inténtalo de nuevo.',
  'hacer-principal': 'No pudimos cambiar tu objetivo principal. Inténtalo de nuevo.',
  'deshacer-importacion': 'No pudimos eliminar las carreras importadas. Inténtalo de nuevo.',
};

type HojaAbierta =
  | { tipo: 'importar'; enCurso?: boolean }
  | { tipo: 'buscar' }
  | { tipo: 'acciones'; carrera: ProximaCarrera }
  | { tipo: 'quitar'; carrera: ProximaCarrera }
  | { tipo: 'meta'; carrera: ProximaCarrera }
  | { tipo: 'no-soy-yo' };

/** El cromo de arriba: el logotipo en el centro y el chat a la derecha (solo con coach). Fijo. */
function Cromo({ l, appearance, onLog }: { l: LecturaCarreras; appearance: TwinScreenProps['appearance']; onLog: (linea: string) => void }) {
  const logo = appearance === 'dark' ? '/brand/fh-logo-white.png' : '/brand/fh-logo-black.png';
  const sinLeer = l.carga.hub === 'lista' ? l.noLeidosChat : 0;
  return (
    <div style={{ height: 56, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', padding: '0 8px' }}>
      <span style={{ width: 48, height: 48 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt="FAHYBRID" style={{ height: 24, width: 'auto', display: 'block' }} />
      <div style={{ justifySelf: 'end', display: 'flex' }}>
        {l.conCoach ? (
          <BotonCromo
            etiqueta={sinLeer > 0 ? `Chat con tu coach, ${sinLeer} sin leer` : 'Chat con tu coach'}
            n={sinLeer}
            onClick={() => onLog('Chat → hilo con tu coach')}
          >
            <IcoChat tam={20} />
          </BotonCromo>
        ) : (
          <span style={{ width: 48, height: 48 }} />
        )}
      </div>
    </div>
  );
}

export function Screen({ escenario, appearance, onLog }: TwinScreenProps) {
  const caso = casoCarreras(escenario);
  const [l, dispatch] = useReducer(aplicar, caso.lectura);
  const [hoja, setHoja] = useState<HojaAbierta | null>(caso.abre === 'importando' ? { tipo: 'importar', enCurso: true } : caso.abre === 'no-soy-yo' ? { tipo: 'no-soy-yo' } : null);
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null);
  const avisa = (texto: string) => setAviso({ texto, error: false });
  const avisaError = (texto: string) => setAviso({ texto, error: true });
  const temporizadores = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  // Lo último que se supo del predicho del ATLETA (sus estaciones, su ritmo): no es de una carrera. Al
  // cambiar de principal, el nuevo predicho se recalcula desde aquí, aunque en medio no hubiera principal.
  const baseAtleta = useRef<Prediccion>(caso.lectura.prediccion);

  useEffect(() => () => temporizadores.current.forEach(clearTimeout), []);
  const luego = useCallback((ms: number, f: () => void) => {
    temporizadores.current.push(setTimeout(f, ms));
  }, []);

  const s = useMemo(() => sujeto(l), [l]);
  const restantes = useMemo(() => proximasRestantes(l, s), [l, s]);
  const principal = principalDe(l.proximas);

  useEffect(() => {
    if (['cifra', 'parcial', 'sin-datos'].includes(l.prediccion.tipo)) baseAtleta.current = l.prediccion;
  }, [l.prediccion]);

  useEffect(() => {
    onLog(`Sujeto: ${s.tipo}${s.tipo === 'objetivo' || s.tipo === 'postcarrera' || s.tipo === 'ultima' ? ` · ${s.carrera.nombre}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.tipo]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.error ? AVISO_ERROR_MS : AVISO_MS);
    return () => clearTimeout(t);
  }, [aviso]);

  /** Un cambio de la lectura. Si cambia el principal, el predicho se recalcula (esqueleto y luego cifra). */
  const cambiar = (c: Cambio): boolean => {
    if (caso.fallaAcciones && FALLO[c.tipo]) {
      avisaError(FALLO[c.tipo]!);
      return false;
    }
    const despues = aplicar(l, c);
    dispatch(c);
    if (despues.prediccion.tipo === 'cargando' && l.prediccion.tipo !== 'cargando') {
      const nuevo = principalDe(despues.proximas);
      luego(RECALCULO_MS, () => dispatch({ tipo: 'prediccion', valor: prediccionTras(baseAtleta.current, nuevo) }));
    }
    return true;
  };

  const cierra = () => setHoja(null);

  const abreDetalle = (c: ProximaCarrera) => {
    const esElPrincipal = principal?.raceId === c.raceId;
    onLog(`Carreras → detalle · ${c.nombre}${esElPrincipal ? ' · predicho hoy y camino al objetivo' : ' · «el predicho se calcula para tu principal» y hacerla principal'}`);
  };

  const accionPoster = (a: AccionObjetivo, c: ProximaCarrera) => {
    if (a.tipo === 'ver-camino') return abreDetalle(c);
    if (a.tipo === 'fijar-meta') return setHoja({ tipo: 'meta', carrera: c });
    if (a.tipo === 'hacer-principal') {
      if (cambiar({ tipo: 'hacer-principal', raceId: c.raceId })) avisa(`«${c.nombre}» es ahora tu objetivo principal.`);
      return;
    }
    return onLog('Carreras → detalle · conectar a tu pareja de dobles');
  };

  const eligeAccion = (a: AccionCarrera, c: ProximaCarrera) => {
    if (a === 'quitar') return setHoja({ tipo: 'quitar', carrera: c });
    cierra();
    if (a === 'preguntar') return onLog(`Chat → pregunta sobre la carrera · ${c.nombre}`);
    if (cambiar({ tipo: 'hacer-principal', raceId: c.raceId })) avisa(`«${c.nombre}» es ahora tu objetivo principal.`);
  };

  const reintentarTodo = async () => {
    onLog('Reintentar → volvería a pedir tus carreras');
    dispatch({ tipo: 'parche', parche: { carga: { hub: 'fria', analisis: 'fria' } } });
    await new Promise<void>((ok) => luego(RECARGA_MS, ok));
    dispatch({ tipo: 'parche', parche: casoCarreras('lleno').lectura });
  };

  const reintentarPredicho = () => {
    onLog('Reintentar → volvería a calcular el predicho');
    dispatch({ tipo: 'parche', parche: { prediccion: { tipo: 'cargando' } } });
    luego(RECALCULO_MS, () => dispatch({ tipo: 'prediccion', valor: prediccionTras({ tipo: 'cifra', totalS: 3790, huecoS: 0 }, principal) }));
  };

  const reintentarAnalisis = () => {
    onLog('Reintentar → volvería a pedir el análisis');
    dispatch({ tipo: 'parche', parche: { carga: { ...l.carga, analisis: 'fria' } } });
    luego(RECALCULO_MS, () => dispatch({ tipo: 'parche', parche: { carga: { ...l.carga, analisis: 'lista' }, analisis: ANALISIS_VALENCIA } }));
  };

  const abreBuscar = () => setHoja({ tipo: 'buscar' });
  const abreImportar = () => setHoja({ tipo: 'importar' });

  const sujetoEl = (() => {
    switch (s.tipo) {
      case 'cargando':
        return <PosterCargando />;
      case 'error':
        return <HeroError onReintentar={reintentarTodo} />;
      case 'postcarrera':
        return <PosterPostcarrera s={s} l={l} onImportar={abreImportar} />;
      case 'objetivo':
        return (
          <PosterObjetivo
            s={s}
            l={l}
            onAbre={(a) => accionPoster(a, s.carrera)}
            onAcciones={(c) => setHoja({ tipo: 'acciones', carrera: c })}
            onReintentarPredicho={reintentarPredicho}
          />
        );
      case 'ultima':
        return <PosterUltima s={s} l={l} onBuscar={abreBuscar} />;
      case 'vacio':
        return <PosterVacio onBuscar={abreBuscar} onImportar={abreImportar} />;
    }
  })();

  const verProximas = s.tipo === 'cargando' || s.tipo === 'objetivo' || s.tipo === 'postcarrera';
  const verPasadas = s.tipo !== 'vacio' && s.tipo !== 'error';
  const invitacion =
    s.tipo === 'postcarrera'
      ? { titulo: 'Fija tu próxima carrera', detalle: 'Tendrás cuenta atrás, el predicho de tu tiempo y un plan que apunta a esa fecha.' }
      : { titulo: 'Buscar otra carrera', detalle: 'Fijar una nueva la hace tu principal y pasa la actual a secundaria.' };

  const ocultaFondo = hoja != null;
  const sube = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

  return (
    <div className="twin-screen-safe">
      <Estilos />
      <EstilosCarreras />
      <div inert={ocultaFondo} aria-hidden={ocultaFondo || undefined} style={{ height: '100%' }}>
        <Pantalla estrategia="llena" cabecera={<Cromo l={l} appearance={appearance} onLog={onLog} />} tabBar={<TabBar activa="Carreras" />}>
          <div style={{ minHeight: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 22, padding: `6px ${MARGEN}px 32px` }}>
            <div className="hd-sube" style={{ ...sube(0), display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Etiqueta color="var(--twin-accent-text)">Rendimiento y carreras</Etiqueta>
              <h1 style={{ margin: 0, ...fuente(800, TAM.saludo, 1.1, true), letterSpacing: '-0.02em', color: 'var(--twin-fg)' }}>Mis carreras</h1>
            </div>

            {/* La `key` por sujeto: al cambiar de sujeto, el bloque nuevo entra, no se reescribe. */}
            <div key={s.tipo} className="hd-sube" style={{ ...sube(1), display: 'flex', flexDirection: 'column', flex: '1 0 auto' }}>
              {sujetoEl}
            </div>

            {verProximas ? (
              <div className="hd-sube" style={sube(2)}>
                <Proximas
                  l={l}
                  items={restantes}
                  invitacion={invitacion}
                  onAbre={abreDetalle}
                  onAcciones={(c) => setHoja({ tipo: 'acciones', carrera: c })}
                  onBuscar={abreBuscar}
                />
              </div>
            ) : null}

            {verPasadas ? (
              <div className="hd-sube" style={sube(3)}>
                <Pasadas
                  l={l}
                  s={s}
                  onImportar={abreImportar}
                  onQuitarImportacion={() => setHoja({ tipo: 'no-soy-yo' })}
                  onEstacion={(e) => onLog(`Carreras → detalle de estación · ${e}`)}
                  onPredichoVsReal={() => onLog(`Carreras → predicho contra real · ${l.analisis?.deCarrera.nombre ?? ''}`)}
                  onReintentarAnalisis={reintentarAnalisis}
                />
              </div>
            ) : null}
          </div>
        </Pantalla>
      </div>

      {hoja?.tipo === 'acciones' ? (
        <MenuAcciones
          carrera={hoja.carrera}
          principal={principal?.raceId === hoja.carrera.raceId}
          conCoach={l.conCoach}
          onElige={(a) => eligeAccion(a, hoja.carrera)}
          onCerrar={cierra}
        />
      ) : null}

      {hoja?.tipo === 'quitar' ? (
        <Confirmacion
          titulo="¿Quitar este objetivo?"
          mensaje={`${hoja.carrera.nombre} dejará de contar para tu cuenta atrás. Podrás volver a fijarla cuando quieras.`}
          destructivo="Quitar objetivo"
          onCancelar={cierra}
          onConfirmar={() => {
            const hecho = cambiar({ tipo: 'quitar', raceId: hoja.carrera.raceId });
            cierra();
            if (hecho) avisa('Objetivo quitado.');
          }}
        />
      ) : null}

      {hoja?.tipo === 'no-soy-yo' ? (
        <Confirmacion
          titulo="¿Eliminar las carreras importadas?"
          mensaje="Esto borrará las carreras importadas y podrás volver a buscar tu perfil."
          destructivo="Eliminar carreras importadas"
          onCancelar={cierra}
          onConfirmar={() => {
            // Como en la app: tras borrar, se vuelve a la búsqueda con el campo limpio; si falla, se queda y se dice.
            if (!cambiar({ tipo: 'deshacer-importacion' })) return cierra();
            setHoja({ tipo: 'importar' });
            avisa('Carreras importadas eliminadas.');
          }}
        />
      ) : null}

      {hoja?.tipo === 'importar' ? (
        <HojaImportar
          candidatoInicial={hoja.enCurso ? CANDIDATOS[0] : undefined}
          duracion={hoja.enCurso ? IMPORTACION_EN_CURSO_MS : undefined}
          onCerrar={cierra}
          onImportado={(h) => {
            cambiar({ tipo: 'importar', ...h });
            cierra();
            avisa(h.pasadas.length === 1 ? 'Carrera importada.' : `Historial importado: ${h.pasadas.length} carreras.`);
          }}
        />
      ) : null}

      {hoja?.tipo === 'buscar' ? (
        <HojaBuscar
          principal={principal}
          falla={Boolean(caso.fallaAcciones)}
          onCerrar={cierra}
          onLog={onLog}
          onFijado={(e) => {
            cambiar({ tipo: 'fijar', ...e });
            cierra();
            avisa(`«${e.evento.nombre}» es ahora tu carrera objetivo.`);
          }}
        />
      ) : null}

      {hoja?.tipo === 'meta' ? (
        <HojaMeta
          carrera={hoja.carrera}
          hoy={l.hoy}
          onCerrar={cierra}
          onGuarda={(metaS) => {
            cambiar({ tipo: 'cambiar-meta', raceId: hoja.carrera.raceId, metaS });
            cierra();
            avisa(metaS == null ? 'Sin tiempo objetivo.' : 'Tiempo objetivo guardado.');
          }}
        />
      ) : null}

      {aviso ? (
        // Un aviso pasajero: sobre la barra de pestañas, donde el pulgar no lo tapa. El de error lleva
        // tinte de peligro y su marca con forma, y se anuncia como alerta.
        <div
          role={aviso.error ? 'alert' : 'status'}
          className="hd-aviso"
          style={{
            position: 'absolute',
            left: MARGEN,
            right: MARGEN,
            bottom: `calc(var(--twin-safe-bottom) + ${CROMO.tabBar}px + 12px)`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minHeight: 52,
            padding: '10px 18px',
            boxSizing: 'border-box',
            borderRadius: RADIO.tarjeta,
            background: aviso.error ? tinte('var(--twin-danger)', 16, 'var(--twin-surface-elevated)') : 'var(--twin-fg)',
            border: aviso.error ? `1px solid ${velo('var(--twin-danger)', 50)}` : undefined,
            color: aviso.error ? 'var(--twin-fg)' : 'var(--twin-bg)',
            ...fuente(700, TAM.suelo, 1.3),
            boxShadow: 'var(--twin-shadow-hero)',
            zIndex: 30,
          }}
        >
          {aviso.error ? (
            <span style={{ display: 'inline-flex', color: 'var(--twin-danger)' }}>
              <IcoAlerta tam={20} />
            </span>
          ) : (
            <IcoCheck tam={20} />
          )}
          {aviso.texto}
        </div>
      ) : null}
    </div>
  );
}
