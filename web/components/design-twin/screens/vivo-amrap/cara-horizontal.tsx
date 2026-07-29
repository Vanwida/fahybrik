'use client';

// La cara horizontal: el móvil apoyado en el remo o en el suelo, apaisado.
//
// LA REGLA: el tramo decide la cara; el formato nunca suelta la franja.
//
// Girar el móvil no cambia el entreno, cambia lo que cabe. En apaisado sí hay
// sitio para un instrumento de verdad, así que el lienzo se parte en dos:
//
//   izquierda · LA CARA — la decide el tramo donde está el cursor:
//       monitor  → el remo lo mide una máquina conectada: calorías enormes,
//                  ritmo, vatios y pulso. Un HUD de erg, porque hay dato.
//       formato  → wall balls o burpees se cuentan a pulso: no hay
//                  instrumento que enseñar, así que mandan los movimientos.
//
//   derecha · LA FRANJA — no se suelta nunca: la ventana drenando, el
//       marcador y la zona de cerrar ronda. Es lo que impide que el HUD del
//       remo se coma el AMRAP: por muy bonito que sea el monitor, sigues
//       teniendo un reloj que te va a sacar y unas rondas que contar.
//
// Lo único que cambia en la franja entre una cara y otra es el tamaño de la
// ronda (144 cuando gobierna, 96 cuando cede). No desaparece jamás.

import { Label, Mono, SP } from '../../kit';
import { hrZone } from '../../sim';
import { UMBRAL } from '../../datos-reales';
import { ARO_MARGEN, AroVentana } from './aro';
import { CapaPausa, Destello, NucleoRonda, TopCromo } from './atoms';
import { FilaMovimiento, FranjaPulso, type EstadoMovimiento } from './filas';
import { MOVIMIENTOS, lineaMovimiento, type LecturaErg } from './data';
import type { VistaViva } from './vista';

/** El ancho de la franja. Cabe una ronda de 144 pt (dos cifras) con aire. */
const FRANJA_ANCHO = 250;

export function CaraHorizontal({ vista, destello }: { vista: VistaViva; destello: number }) {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <AroVentana fraccion={vista.fraccion} tension={vista.tension} />

      <div
        style={{
          position: 'absolute',
          inset: ARO_MARGEN,
          display: 'flex',
          flexDirection: 'row',
          gap: SP.m,
        }}
      >
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: SP.s }}>
          <TopCromo
            pausado={vista.pausado}
            ventanaTotal={vista.ventanaTotalTexto}
            onPausa={vista.onPausa}
            onSalir={vista.onSalir}
          />
          {vista.cara === 'monitor' && vista.erg ? (
            <CaraMonitor erg={vista.erg} pulsoPpm={vista.pulsoPpm} />
          ) : (
            <CaraFormato vista={vista} />
          )}
        </div>

        <Franja vista={vista} />
      </div>

      {destello > 0 && <Destello key={destello} />}
      {vista.pausado && <CapaPausa onSeguir={vista.onSeguir} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La franja — lo que el formato no suelta
// ---------------------------------------------------------------------------

function Franja({ vista }: { vista: VistaViva }) {
  const caliente = vista.tension > 0;
  return (
    <button
      type="button"
      onClick={vista.onCerrarRonda}
      aria-label={`Cerrar la ronda ${vista.rondas + 1}`}
      style={{
        flex: `0 0 ${FRANJA_ANCHO}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: SP.m,
        borderRadius: 20,
        border: '1px solid var(--twin-hairline-strong)',
        background: 'color-mix(in srgb, var(--twin-surface) 70%, transparent)',
        color: 'var(--twin-fg)',
        cursor: 'pointer',
      }}
    >
      <Label size={10} color={caliente ? 'var(--twin-accent-text)' : 'var(--twin-muted)'}>
        Quedan
      </Label>
      <Mono
        size={vista.remate ? 72 : 48}
        weight={800}
        color={caliente ? 'var(--twin-accent-text)' : 'var(--twin-fg)'}
        style={{ lineHeight: 1, transition: 'font-size 500ms ease-out, color 500ms linear' }}
      >
        {vista.ventanaTexto}
      </Mono>
      {vista.aliento && (
        <span style={{ font: '600 13px/1.2 var(--twin-font-sans)', color: 'var(--twin-accent-text)' }}>
          {vista.aliento}
        </span>
      )}

      <div
        aria-hidden
        style={{ height: 1, alignSelf: 'stretch', background: 'var(--twin-hairline)', margin: `${SP.m}px 0` }}
      />

      <NucleoRonda
        rondas={vista.rondas}
        repsMarcadas={vista.repsMarcadas}
        compara={vista.compara}
        // La ronda cede tamaño cuando manda el monitor, pero no el sitio: es
        // la diferencia entre subordinarse y desaparecer.
        tamano={vista.cara === 'monitor' ? 96 : 144}
        pista="toca aquí al cerrar la ronda"
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Cara de monitor — hay una máquina midiendo, así que se pinta lo que mide
// ---------------------------------------------------------------------------

function CaraMonitor({ erg, pulsoPpm }: { erg: LecturaErg; pulsoPpm: number | null }) {
  const hecho = erg.cal >= erg.objetivoCal;
  const zona = pulsoPpm === null ? null : hrZone(pulsoPpm, UMBRAL.ppm);
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: SP.s }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px', flex: '0 0 auto' }}>
        <Label size={10}>{lineaMovimiento(MOVIMIENTOS[1])}</Label>
        <span style={{ flex: 1 }} />
        <Mono size={11} color="var(--twin-muted)">
          lo cuenta el monitor
        </Mono>
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <Mono size={144} weight={800} color={hecho ? 'var(--twin-ok)' : 'var(--twin-fg)'} style={{ lineHeight: 1 }}>
            {erg.cal}
          </Mono>
          <Mono size={34} weight={700} color="var(--twin-muted)">
            / {erg.objetivoCal} cal
          </Mono>
        </div>
      </div>

      {/* La barra es honesta porque hay quien la mide: sale de las calorías
          del monitor, no de una estimación por tiempo. */}
      <div
        aria-hidden
        style={{ height: 4, borderRadius: 2, background: 'var(--twin-surface-sunken)', overflow: 'hidden', flex: '0 0 auto' }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.min(100, (erg.cal / erg.objetivoCal) * 100)}%`,
            background: hecho ? 'var(--twin-ok)' : 'var(--twin-accent)',
            transition: 'width 900ms linear',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
        <Baldosa valor={erg.ritmo500} etiqueta="/500m" />
        <Baldosa valor={`${erg.vatios}`} etiqueta="vatios" color="var(--twin-accent-text)" />
        {pulsoPpm !== null && zona !== null && (
          <Baldosa valor={`${pulsoPpm}`} etiqueta={`ppm · Z${zona}`} color={`var(--twin-z${zona})`} />
        )}
      </div>
    </div>
  );
}

function Baldosa({ valor, etiqueta, color = 'var(--twin-fg)' }: { valor: string; etiqueta: string; color?: string }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        padding: '9px 4px',
        borderRadius: 12,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
      }}
    >
      <Mono size={34} weight={800} color={color}>
        {valor}
      </Mono>
      <Label size={9}>{etiqueta}</Label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cara de formato — nadie mide esto, así que mandan los movimientos
// ---------------------------------------------------------------------------

function CaraFormato({ vista }: { vista: VistaViva }) {
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: SP.s }}>
      {/* Las filas se REPARTEN el alto: en apaisado sobra sitio y lo que se
          hace con él es engordar el blanco de cada línea, que es lo que las
          vuelve acertables con el dedo sudado (§6.1). */}
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {MOVIMIENTOS.map((m, i) => {
          const estado: EstadoMovimiento =
            i < vista.marcados ? 'hecho' : i === vista.marcados ? 'actual' : 'pendiente';
          return (
            <FilaMovimiento
              key={m.nombre}
              movimiento={m}
              estado={estado}
              crece
              medida={i === vista.marcados && vista.erg ? `${vista.erg.cal} / ${vista.erg.objetivoCal} cal` : null}
              onMarcar={() => vista.onMarcar(i)}
            />
          );
        })}
      </div>
      <FranjaPulso ppm={vista.pulsoPpm} />
    </div>
  );
}
