'use client';

// LA CARA DE MONITOR — solo horizontal, y solo para esto: el móvil apoyado en
// el ergo, a metro y medio, con las manos en la maneta.
//
// Es la MISMA máquina de estados que la vertical (`useMotorErg`), así que girar
// el teléfono no cambia el entreno: cambia la lectura. La vertical elige y
// esconde porque cabe una cosa; aquí cabe TODO lo que el monitor sabe, y la
// gracia está en ordenarlo en tres escalones para que siga leyéndose de lejos.
//
// La disposición es la del Swift shipeado (objetivo · héroe · raíl) y el
// contenido es la UNIÓN de las dos caras horizontales que existen hoy: la del
// Swift y la del espejo `benchmark-erg` (que aporta vatios medios, calorías,
// cal/h, proyección y resistencia). Ver `regata.tsx`.
//
// LA ACCIÓN VIVE ABAJO EN LAS DOS ORIENTACIONES. Girado hay un tercio del alto,
// así que la app le da una columna propia a la derecha, al alcance del pulgar
// (`ActiveWorkoutView.landscapeAction`): sin ella, cerrar una serie obligaba a
// girar el teléfono a media pieza. La regla no es una regla si se cae al girar.

import type { ReactNode } from 'react';
import { IconClose, SP } from '../../kit';
import { fmtPace500 } from '../../sim';
import { Ambiente, Fogonazo, Muescas, Pausa, zonaDe } from './atomos';
import { CierreAncho, DescansoAncho, EsperaAncha } from './anchos';
import { CuentaAtras } from './estados';
import { BICI_SERIE_1, MAQUINA_NOMBRE, fmtElapsed, lecturaViva } from './data';
import {
  ColumnaObjetivo,
  HeroRegataCard,
  RailRegata,
  lecturasMenores,
  lineaContexto,
  mediaDeVentana,
  type HeroRegata,
} from './regata';
import { tituloAccion, useMotorErg, type EstadoErg, type Guion } from './motor';

/** Alto de la franja de contexto, en pt del lienzo horizontal. */
const FRANJA_ALTO = 40;

export function CaraMonitor({ guion, onLog }: { guion: Guion; onLog: (linea: string) => void }) {
  const e = useMotorErg(guion, onLog);
  const zona = zonaDe(e.pulso);
  const enDescanso = e.fase === 'descanso';
  const trabajando = e.fase === 'trabajando' || e.fase === 'cerrando';

  // Cada cara se lleva SU acción dentro, con el peso que le toca ahí: grande y
  // primaria donde la acción es lo principal (descanso, cuenta, cierre), y
  // discreta al pie del raíl mientras trabajas, que es cuando la salida a mano
  // es el plan B y no el plan.
  const cuerpo = (() => {
    if (enDescanso) return <DescansoAncho e={e} accion={<Accion e={e} tono="primaria" alto={56} />} />;
    if (e.fase === 'cuenta') return <CuentaAtras e={e} landscape accion={<Accion e={e} tono="ghost" alto={44} ancho={200} />} />;
    if (e.fase === 'hecho') return <CierreAncho e={e} accion={<Accion e={e} tono="primaria" alto={56} ancho={260} />} />;
    if (!trabajando || e.monitor === 'ausente') {
      return <EsperaAncha e={e} guion={guion} accion={<Accion e={e} tono="ghost" alto={44} />} />;
    }
    return <Regata e={e} guion={guion} />;
  })();

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Ambiente zona={enDescanso ? null : zona} intensidad={16} />
      <Fogonazo activo={e.fogonazo} />
      <div
        style={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: `6px ${SP.m}px ${SP.s}px`,
          boxSizing: 'border-box',
        }}
      >
        <Franja e={e} onSalir={() => onLog('salir del entreno desde la cara de monitor')} />
        {cuerpo}
      </div>
      {e.pausado && (
        <Pausa onReanudar={e.alternarPausa} onSalir={() => onLog('salir del entreno desde la cara de monitor')} />
      )}
    </div>
  );
}

/** La misma acción y la misma etiqueta que en vertical: una conducta, dos sitios. */
function Accion({
  e,
  tono,
  alto,
  ancho,
}: {
  e: EstadoErg;
  tono: 'primaria' | 'ghost';
  alto: number;
  ancho?: number;
}) {
  const alPulsar =
    e.fase === 'cuenta' ? e.saltarCuenta : e.fase === 'descanso' ? e.empezarSiguiente : e.cerrarAMano;
  // El cruce perdido es la excepción: ahí el toque es el ÚNICO cierre posible,
  // así que deja de ser el plan B y se pinta como lo que es.
  const primaria = tono === 'primaria' || e.cruceCiego;
  return (
    <button
      type="button"
      onClick={alPulsar}
      className={primaria ? 'tw-btn-primary' : 'tw-btn-secondary'}
      style={{
        width: ancho ?? '100%',
        height: alto,
        fontSize: alto >= 56 ? 15 : 12,
        fontStyle: 'italic',
        fontWeight: 800,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}
    >
      {tituloAccion(e)}
    </button>
  );
}

// ---------------------------------------------------------------------------
// La franja — quién eres, qué haces, qué viene después y el crono
// ---------------------------------------------------------------------------

function Franja({ e, onSalir }: { e: EstadoErg; onSalir: () => void }) {
  // Descansando ya cuentas la SIGUIENTE: es a la que vas, igual que en vertical.
  const serieMostrada = e.fase === 'descanso' ? e.serie + 1 : e.serie;
  // Cortas: la franja compite con el crono y se comía el final de la frase
  // justo donde estaba la instrucción. Lo que ya cuenta la columna del
  // objetivo (que la medida está cubierta) no se repite aquí.
  const aviso = e.cruceCiego
    ? 'El cruce no se vio: ciérrala tú'
    : e.monitor === 'mudo'
      ? 'Sin lecturas: el tramo sigue abierto'
      : null;
  const icono = (etiqueta: string, hijo: ReactNode, click: () => void) => (
    <button
      type="button"
      aria-label={etiqueta}
      onClick={click}
      style={{
        width: 26,
        height: 26,
        border: 0,
        background: 'transparent',
        color: 'var(--twin-muted)',
        cursor: 'pointer',
        fontSize: 14,
        padding: 0,
        flex: '0 0 auto',
      }}
    >
      {hijo}
    </button>
  );
  return (
    <div
      style={{
        height: FRANJA_ALTO,
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: SP.m,
        padding: `0 ${SP.m}px`,
        borderRadius: 12,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
      }}
    >
      {icono('Salir del entreno', <IconClose size={12} />, onSalir)}
      {icono('Pausar el entreno', <span>‖</span>, e.alternarPausa)}
      {e.pres.series > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
          <span
            style={{
              font: 'italic 800 12px/1 var(--twin-font-sans)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--twin-accent-text)',
              whiteSpace: 'nowrap',
            }}
          >
            Serie {serieMostrada}/{e.pres.series}
          </span>
          <Muescas series={e.pres.series} actual={serieMostrada} />
        </div>
      )}
      {/* Cuando algo va mal, ESO es el contexto. En horizontal no hay sitio
          para un cartel, así que la línea que dice contra qué vas cede el
          turno a la que dice por qué la serie no se cierra sola. */}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          font: `${aviso ? 600 : 500} 12px/1.2 var(--twin-font-sans)`,
          color: aviso ? 'var(--twin-warning)' : 'var(--twin-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {aviso ?? lineaContexto(e)}
      </span>
      <span className="t-readout-m">{fmtElapsed(e.t)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El cuerpo de trabajo: objetivo · héroe · raíl
// ---------------------------------------------------------------------------

function Regata({ e, guion }: { e: EstadoErg; guion: Guion }) {
  const viva = lecturaViva(guion.maquina, e.t);
  const mudo = e.monitor === 'mudo';
  const mediaRitmo = mediaDeVentana(e);
  const media = mediaRitmo != null ? fmtPace500(mediaRitmo) : null;

  // Sin lecturas el héroe deja de fingir que mide: gobierna el reloj, que es lo
  // único vivo que le queda a la app. El objetivo se queda al lado con la
  // última lectura buena, apagada y dicha como lo que es.
  const hero: HeroRegata = mudo
    ? {
        etiqueta: 'Sin lecturas',
        valor: fmtElapsed(e.t),
        unidad: `${MAQUINA_NOMBRE[guion.maquina]} no está cantando`,
        px: 110,
        color: 'var(--twin-muted)',
      }
    : e.pres.medida === 'calorias'
      ? {
          etiqueta: 'Ritmo ahora',
          valor: `${viva.vatios}`,
          unidad: 'vatios',
          px: 132,
          delta: {
            valor: viva.vatios - BICI_SERIE_1.vatiosMedios,
            unidad: 'W',
            mejorEs: 'mas',
            sufijo: 'vs serie 1',
            textoNulo: 'igual que la serie 1',
          },
        }
      : {
          etiqueta: 'Split · real',
          valor: viva.ritmo != null ? fmtPace500(viva.ritmo) : fmtElapsed(e.t),
          unidad: '/500m',
          px: 132,
          delta:
            e.pres.objetivo?.clase === 'ritmo' && viva.ritmo != null
              ? {
                  valor: viva.ritmo - e.pres.objetivo.segundosPor500,
                  unidad: 's',
                  mejorEs: 'menos',
                  sufijo: 'vs objetivo',
                  textoNulo: 'en el objetivo',
                }
              : undefined,
        };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 8, alignItems: 'stretch' }}>
      <ColumnaObjetivo e={e} />
      <HeroRegataCard
        e={e}
        hero={hero}
        media={media}
        menores={lecturasMenores(e, viva, guion.maquina, mediaRitmo)}
      />
      <RailRegata
        e={e}
        viva={viva}
        maquina={guion.maquina}
        salida={<Accion e={e} tono="ghost" alto={44} />}
      />
    </div>
  );
}
