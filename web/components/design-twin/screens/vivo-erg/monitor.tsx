'use client';

// La cara de monitor: el móvil apoyado en el ergo, en horizontal, a metro y
// medio de tu cara. Aquí no se navega ni se lee prosa. Se barre.
//
// Es la MISMA máquina de estados que la cara vertical (`useMotorErg`), así que
// girar el teléfono no cambia el entreno: cambia la lectura. Y sigue habiendo
// jerarquía aunque sea una rejilla: la celda de la medida que gobierna va con
// filo naranja y un escalón más de tamaño, para que el ojo caiga ahí primero y
// las otras tres se lean de barrido.

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
  SalidaManual,
  zonaDe,
  type Zona,
} from './atomos';
import { CierreAncho, DescansoAncho, EsperaAncha } from './anchos';
import {
  BICI_SERIE_1,
  CADENCIA_UNIDAD,
  MAQUINA_NOMBRE,
  MEDIDA_UNIDAD,
  fmtElapsed,
  lecturaViva,
  objetivoTexto,
} from './data';
import { useMotorErg, type EstadoErg, type Guion } from './motor';

/** Alto del lienzo en horizontal menos el safe de abajo (DeviceFrame). */
const FRANJA_ALTO = 46;

export function CaraMonitor({ guion, onLog }: { guion: Guion; onLog: (linea: string) => void }) {
  const e = useMotorErg(guion, onLog);
  const zona = zonaDe(e.pulso);

  const cuerpo = (() => {
    if (e.fase === 'descanso') return <DescansoAncho e={e} />;
    if (e.fase === 'armado') return <EsperaAncha e={e} guion={guion} />;
    if (e.fase === 'hecho') return <CierreAncho e={e} />;
    return <Rejilla e={e} guion={guion} />;
  })();

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Ambiente zona={zona} intensidad={16} />
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

// ---------------------------------------------------------------------------
// La franja — quién eres, cuánto queda y cómo se sale. Todo en una línea.
// ---------------------------------------------------------------------------

function Franja({ e, onSalir }: { e: EstadoErg; onSalir: () => void }) {
  const objetivo = objetivoTexto(e.pres);
  const unidad = MEDIDA_UNIDAD[e.pres.medida];
  const enTramo = e.fase === 'trabajando' || e.fase === 'cerrando';
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
        <span
          style={{
            font: 'italic 800 12px/1 var(--twin-font-sans)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--twin-accent-text)',
            whiteSpace: 'nowrap',
          }}
        >
          {e.pres.series > 1 ? `Serie ${e.serie} de ${e.pres.series}` : e.pres.titulo}
        </span>
        <Muescas series={e.pres.series} actual={e.serie} />
      </div>

      {enTramo ? (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: SP.s }}>
          <span
            className="t-readout-m"
            style={{ color: e.cruceCiego ? 'var(--twin-ok)' : e.ciego ? 'var(--twin-faint)' : 'var(--twin-fg)' }}
          >
            {e.cruceCiego ? e.medido : e.restante}
          </span>
          {/* En horizontal la franja va apretada: la unidad sola basta y el
              alto que sobra se lo queda la barra, que es lo que se lee de
              lejos. «para cerrar» ya lo dice el propio vaciado. */}
          <span className="t-readout-label" style={{ color: 'var(--twin-muted)', whiteSpace: 'nowrap' }}>
            {unidad}
          </span>
          <div style={{ flex: 1, minWidth: 120 }}>
            <BarraDrenaje
              restante={e.restante}
              total={e.pres.cantidad}
              ciego={e.ciego}
              cubierta={e.cruceCiego}
              alto={8}
            />
          </div>
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
      {/* La salida a mano solo existe mientras hay tramo que cerrar: durante el
          descanso ya no hay nada que cerrar y el botón sería ruido. */}
      {enTramo && (
        <SalidaManual
          titulo={e.pres.series > 1 ? 'Cerrar serie' : 'Cerrar tramo'}
          onClick={e.cerrarAMano}
          destacada={e.cruceCiego}
          alto={32}
          style={{ width: 'auto', padding: '0 14px', fontSize: 12, flex: '0 0 auto' }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La rejilla — cuatro lecturas, y la que gobierna manda
// ---------------------------------------------------------------------------

interface Lectura {
  clave: string;
  etiqueta: string;
  valor: string;
  color?: string;
  zona?: Zona | null;
  principal?: boolean;
  delta?: { valor: number; unidad: string; mejorEs: 'menos' | 'mas'; sufijo: string; textoNulo: string };
}

function Rejilla({ e, guion }: { e: EstadoErg; guion: Guion }) {
  const viva = lecturaViva(guion.maquina, e.t);
  const zona = zonaDe(e.pulso);
  const objetivo = e.pres.objetivo;
  const esBici = e.pres.medida === 'calorias';

  const lecturas: Lectura[] = [];

  if (esBici) {
    // Con el cruce perdido, «0 para cerrar» leería como serie hecha y no lo
    // está: lo que se sostiene es lo acumulado.
    lecturas.push({
      clave: 'cal',
      etiqueta: e.cruceCiego ? 'cal hechas' : 'cal para cerrar',
      valor: `${e.cruceCiego ? e.medido : e.restante}`,
      color: e.cruceCiego ? 'var(--twin-ok)' : undefined,
      principal: true,
    });
    if (!e.ciego) {
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
    if (!e.ciego && viva.ritmo != null) {
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
    if (!e.ciego) {
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

  if (e.ciego) {
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

  return <Cuadricula lecturas={lecturas} />;
}

function Cuadricula({ lecturas, compacta = false }: { lecturas: Lectura[]; compacta?: boolean }) {
  // Los tamaños salen del ancho de celda: el lienzo horizontal deja 756 pt
  // útiles, así que a dos columnas cada celda tiene ~370 y un readout de cinco
  // cifras cabe hasta 128 px (mono avanza 0,6 em por carácter).
  const columnas = lecturas.length >= 4 ? 2 : lecturas.length;
  const tamPrincipal = compacta ? 44 : columnas === 2 ? 128 : 104;
  const tamNormal = compacta ? 34 : columnas === 2 ? 92 : 84;
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
            gap: 4,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>{l.etiqueta}</span>
            {l.zona && <span className="tw-zone" data-zone={l.zona}>{`Z${l.zona}`}</span>}
          </div>
          {l.delta && !compacta && (
            <Delta
              valor={l.delta.valor}
              unidad={l.delta.unidad}
              mejorEs={l.delta.mejorEs}
              sufijo={l.delta.sufijo}
              textoNulo={l.delta.textoNulo}
            />
          )}
        </div>
      ))}
    </div>
  );
}
