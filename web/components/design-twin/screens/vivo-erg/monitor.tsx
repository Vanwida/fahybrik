'use client';

// La cara de monitor: el móvil apoyado en el ergo, en horizontal, a metro y
// medio de tu cara. Aquí no se navega ni se lee prosa. Se barre.
//
// Es la MISMA máquina de estados que la cara vertical (`useMotorErg`), así que
// girar el teléfono no cambia el entreno: cambia la lectura. Y sigue habiendo
// jerarquía aunque sea una rejilla: la celda de la medida que gobierna va con
// filo naranja y un escalón más de tamaño, para que el ojo caiga ahí primero y
// las otras se lean de barrido.
//
// LA ACCIÓN VIVE ABAJO EN LAS DOS ORIENTACIONES. Girado hay un tercio del alto,
// así que la app shipeada le da una columna propia a la derecha, al alcance del
// pulgar (`ActiveWorkoutView.landscapeAction`): sin ella, cerrar una serie
// obligaba a girar el teléfono a media pieza. Aquí se hace igual, porque la
// regla no es una regla si se cae al girar.

import type { ReactNode } from 'react';
import { IconClose, Label, Mono, SP } from '../../kit';
import { fmtPace500 } from '../../sim';
import {
  Ambiente,
  BarraDrenaje,
  COLOR_ZONA,
  Delta,
  Fogonazo,
  Muescas,
  Pausa,
  zonaDe,
  type Zona,
} from './atomos';
import { CierreAncho, DescansoAncho, EsperaAncha } from './anchos';
import { CuentaAtras } from './estados';
import {
  BICI_SERIE_1,
  CADENCIA_UNIDAD,
  MAQUINA_NOMBRE,
  MEDIDA_UNIDAD,
  caloriasEn,
  fmtElapsed,
  lecturaViva,
  objetivoTexto,
  proyeccionS,
} from './data';
import { tituloAccion, useMotorErg, type EstadoErg, type Guion } from './motor';

/** Alto de la franja de contexto, en pt del lienzo horizontal. */
const FRANJA_ALTO = 46;
/** Ancho de la columna de acción (el mismo que la app: 132 pt). */
const COLUMNA_ACCION = 132;

export function CaraMonitor({ guion, onLog }: { guion: Guion; onLog: (linea: string) => void }) {
  const e = useMotorErg(guion, onLog);
  const zona = zonaDe(e.pulso);
  const enDescanso = e.fase === 'descanso';

  const cuerpo = (() => {
    if (enDescanso) return <DescansoAncho e={e} />;
    if (e.fase === 'cuenta') return <CuentaAtras e={e} landscape />;
    if (e.fase === 'armado' || e.monitor === 'ausente') return <EsperaAncha e={e} guion={guion} />;
    if (e.fase === 'hecho') return <CierreAncho e={e} />;
    return <Rejilla e={e} guion={guion} />;
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
          gap: 10,
          padding: `6px ${SP.m}px ${SP.s}px`,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Franja e={e} onSalir={() => onLog('salir del entreno desde la cara de monitor')} />
          {cuerpo}
        </div>
        <div style={{ width: COLUMNA_ACCION, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <AccionAncha e={e} />
        </div>
      </div>
      {e.pausado && (
        <Pausa onReanudar={e.alternarPausa} onSalir={() => onLog('salir del entreno desde la cara de monitor')} />
      )}
    </div>
  );
}

/** La misma acción y la misma etiqueta que en vertical: una conducta, dos sitios. */
function AccionAncha({ e }: { e: EstadoErg }) {
  const alPulsar =
    e.fase === 'cuenta' ? e.saltarCuenta : e.fase === 'descanso' ? e.empezarSiguiente : e.cerrarAMano;
  const primaria = e.fase === 'descanso' || e.cruceCiego || e.fase === 'cuenta';
  return (
    <button
      type="button"
      onClick={alPulsar}
      className={primaria ? 'tw-btn-primary' : 'tw-btn-secondary'}
      style={{
        width: '100%',
        height: 96,
        fontSize: 15,
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
// La franja — quién eres, cuánto queda, lo cubierto y el total de la pieza
// ---------------------------------------------------------------------------

function Franja({ e, onSalir }: { e: EstadoErg; onSalir: () => void }) {
  const objetivo = objetivoTexto(e.pres);
  const unidad = MEDIDA_UNIDAD[e.pres.medida];
  const enTramo = e.fase === 'trabajando' || e.fase === 'cerrando';
  const hayMedida = e.medido != null && e.restante != null;
  const serieMostrada = e.fase === 'descanso' ? e.serie + 1 : e.serie;
  const icono = (etiqueta: string, hijo: ReactNode, click: () => void) => (
    <button
      type="button"
      aria-label={etiqueta}
      onClick={click}
      style={{
        width: 28,
        height: 28,
        border: 0,
        background: 'transparent',
        color: 'var(--twin-muted)',
        cursor: 'pointer',
        fontSize: 15,
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Descansando ya cuentas la SIGUIENTE: es a la que vas, igual que en
            vertical. Si no, la franja y el cuerpo dirían series distintas. */}
        <span
          style={{
            font: 'italic 800 12px/1 var(--twin-font-sans)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--twin-accent-text)',
            whiteSpace: 'nowrap',
          }}
        >
          {e.pres.series > 1 ? `Serie ${serieMostrada} de ${e.pres.series}` : e.pres.titulo}
        </span>
        <Muescas series={e.pres.series} actual={serieMostrada} />
      </div>

      {enTramo && hayMedida ? (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: SP.s }}>
          <span
            className="t-readout-m"
            style={{
              color: e.cruceCiego ? 'var(--twin-ok)' : e.monitor === 'mudo' ? 'var(--twin-faint)' : 'var(--twin-fg)',
            }}
          >
            {e.cruceCiego ? e.medido : e.restante}
          </span>
          <span className="t-readout-label" style={{ color: 'var(--twin-muted)', whiteSpace: 'nowrap' }}>
            {unidad}
          </span>
          <div style={{ flex: 1, minWidth: 110 }}>
            <BarraDrenaje
              restante={e.restante ?? 0}
              total={e.pres.cantidad}
              ciego={e.monitor === 'mudo'}
              cubierta={e.cruceCiego}
              alto={8}
            />
          </div>
          <Mono size={12} weight={600} color="var(--twin-faint)" style={{ whiteSpace: 'nowrap' }}>
            {e.medido} / {e.pres.cantidad}
          </Mono>
        </div>
      ) : (
        <span style={{ flex: 1 }} />
      )}

      {objetivo && (
        <Mono size={14} weight={800} color="var(--twin-accent-text)" style={{ whiteSpace: 'nowrap' }}>
          {objetivo}
        </Mono>
      )}
      <span className="t-readout-m">{fmtElapsed(e.t)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La rejilla — las lecturas grandes, y la que gobierna manda
// ---------------------------------------------------------------------------

interface Lectura {
  clave: string;
  etiqueta: string;
  valor: string;
  color?: string;
  zona?: Zona | null;
  principal?: boolean;
  /** Segunda línea de la celda: la media, que la app enseña bajo el ritmo. */
  pie?: string;
  delta?: { valor: number; unidad: string; mejorEs: 'menos' | 'mas'; sufijo: string; textoNulo: string };
}

function Rejilla({ e, guion }: { e: EstadoErg; guion: Guion }) {
  const viva = lecturaViva(guion.maquina, e.t);
  const zona = zonaDe(e.pulso);
  const objetivo = e.pres.objetivo;
  const esBici = e.pres.medida === 'calorias';
  const mudo = e.monitor === 'mudo';

  const lecturas: Lectura[] = [];

  if (esBici) {
    lecturas.push({
      clave: 'cal',
      etiqueta: e.cruceCiego ? 'cal hechas' : 'cal para cerrar',
      valor: `${e.cruceCiego ? (e.medido ?? 0) : (e.restante ?? 0)}`,
      color: e.cruceCiego ? 'var(--twin-ok)' : undefined,
      principal: true,
    });
    if (!mudo) {
      lecturas.push({
        clave: 'vatios',
        etiqueta: 'vatios',
        valor: `${viva.vatios}`,
        delta: {
          valor: viva.vatios - BICI_SERIE_1.vatiosMedios,
          unidad: 'W',
          mejorEs: 'mas',
          sufijo: 'vs serie 1',
          textoNulo: 'igual que la serie 1',
        },
      });
      lecturas.push({ clave: 'cad', etiqueta: CADENCIA_UNIDAD[guion.maquina], valor: `${viva.cadencia}` });
    }
  } else {
    // Sin lecturas del monitor no hay ritmo que pintar: la celda que gobierna
    // desaparece y el crono de la franja se queda como única verdad viva.
    if (!mudo && viva.ritmo != null) {
      lecturas.push({
        clave: 'ritmo',
        etiqueta: '/500m',
        valor: fmtPace500(viva.ritmo),
        principal: true,
        delta:
          objetivo?.clase === 'ritmo'
            ? {
                valor: viva.ritmo - objetivo.segundosPor500,
                unidad: 's',
                mejorEs: 'menos',
                sufijo: 'vs objetivo',
                textoNulo: 'en el objetivo',
              }
            : undefined,
      });
    }
    if (!mudo) {
      lecturas.push({ clave: 'cad', etiqueta: CADENCIA_UNIDAD[guion.maquina], valor: `${viva.cadencia}` });
      lecturas.push({ clave: 'vatios', etiqueta: 'vatios', valor: `${viva.vatios}` });
    }
  }

  // Sin reloj no hay pulso. La pieza de esquí real se corrió así y la rejilla
  // se queda en tres: mejor tres verdades que cuatro con una inventada (§7).
  if (e.pulso != null) {
    lecturas.push({
      clave: 'pulso',
      etiqueta: 'pulso',
      valor: `${e.pulso}`,
      color: COLOR_ZONA(zona),
      zona,
    });
  }

  if (mudo) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Label size={11} color="var(--twin-warning)">Sin lecturas</Label>
            <span className="t-readout-hero" style={{ fontSize: 92, color: 'var(--twin-muted)' }}>
              {fmtElapsed(e.t)}
            </span>
            <span style={{ font: '600 15px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
              {MAQUINA_NOMBRE[guion.maquina]} no está cantando. El tramo sigue abierto.
            </span>
          </div>
        </div>
        {lecturas.length > 0 && <Cuadricula lecturas={lecturas} compacta />}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Cuadricula lecturas={lecturas} />
      <ParadaAncha e={e} guion={guion} ritmo={viva.ritmo} />
    </div>
  );
}

/**
 * Lo que el monitor sabe y en vertical no cabe a media pieza: calorías,
 * proyección de acabado y la resistencia del ventilador. En horizontal SÍ hay
 * sitio, y el móvil está apoyado: se leen sin soltar la maneta.
 */
function ParadaAncha({ e, guion, ritmo }: { e: EstadoErg; guion: Guion; ritmo: number | null }) {
  const proy = e.medido == null ? null : proyeccionS(e.pres, e.t, e.medido, ritmo);
  const media = e.medido != null && e.medido > 0 && e.t > 0 ? fmtPace500((500 * e.t) / e.medido) : null;
  const celdas: Array<{ etiqueta: string; valor: string }> = [
    { etiqueta: 'cal', valor: `${caloriasEn(guion.maquina, e.t)}` },
  ];
  if (media) celdas.push({ etiqueta: 'media /500m', valor: media });
  if (proy != null) celdas.push({ etiqueta: 'proyección', valor: fmtElapsed(proy) });
  celdas.push({ etiqueta: 'resistencia', valor: '118' });
  return (
    <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
      {celdas.map((c) => (
        <div
          key={c.etiqueta}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            gap: 6,
            padding: '6px 8px',
            borderRadius: 10,
            background: 'var(--twin-surface)',
          }}
        >
          <span className="t-readout-s">{c.valor}</span>
          <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>{c.etiqueta}</span>
        </div>
      ))}
    </div>
  );
}

function Cuadricula({ lecturas, compacta = false }: { lecturas: Lectura[]; compacta?: boolean }) {
  // Los tamaños los fija el ALTO de la celda, no el ancho: con la franja, la
  // fila de lecturas de parada y dos filas de rejilla, cada celda tiene ~131 pt.
  // Una cifra de 96 más su línea de etiqueta y delta (26) los llena justos; a
  // 104 la pastilla del delta se salía por abajo.
  const columnas = lecturas.length >= 4 ? 2 : Math.max(1, lecturas.length);
  const tamPrincipal = compacta ? 44 : columnas === 2 ? 96 : 88;
  const tamNormal = compacta ? 34 : columnas === 2 ? 74 : 68;
  return (
    <div
      style={{
        flex: compacta ? '0 0 auto' : 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${columnas}, 1fr)`,
        gap: 8,
      }}
    >
      {lecturas.map((l) => (
        <div
          key={l.clave}
          style={{
            position: 'relative',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            padding: compacta ? '8px 6px' : '6px 10px',
            borderRadius: 14,
            background: 'var(--twin-surface)',
            border: `1px solid ${l.principal ? 'color-mix(in srgb, var(--twin-accent) 45%, transparent)' : 'var(--twin-hairline)'}`,
            overflow: 'hidden',
          }}
        >
          {l.principal && (
            <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--twin-accent)' }} />
          )}
          <span
            className="t-readout-hero"
            style={{
              fontSize: l.principal ? tamPrincipal : tamNormal,
              color: l.color ?? 'var(--twin-fg)',
              transition: 'color 600ms linear',
              lineHeight: 1,
            }}
          >
            {l.valor}
          </span>
          {/* Etiqueta, zona y delta comparten LÍNEA: apilarlos desbordaba la
              celda por abajo y la pastilla del delta se cortaba a la mitad. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', maxWidth: '100%' }}>
            <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>{l.etiqueta}</span>
            {l.zona && <span className="tw-zone" data-zone={l.zona}>{`Z${l.zona}`}</span>}
            {l.delta && !compacta && <Delta {...l.delta} />}
          </div>
        </div>
      ))}
    </div>
  );
}
