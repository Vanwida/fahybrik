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
// Lo único que cambia en la franja entre una cara y otra es el peldaño del
// numeral de la ronda (`sujeto` cuando gobierna, `segundo` cuando cede ante el
// monitor). No desaparece jamás.
//
// Y aquí también manda el §10.1: el lienzo lo tiñe la zona de pulso, detrás del
// aro y de los dos campos. El aro sigue contando la ventana —es un aviso que
// drena, no un estado sostenido— y el naranja de marca sigue reservado al
// remate, que no es un color de zona.

import { SP } from '../../kit';
import { hrZone } from '../../sim';
import { UMBRAL } from '../../datos-reales';
import type { TwinAppearance } from '../../types';
import { Ambiente, Apoyo, EtiquetaSujeto, FilaApoyos, Numeral, colorZona, zonaDe } from '../../kit-vivo';
import { ARO_MARGEN, AroVentana } from './aro';
import { CapaPausa, Destello, MarcadorTocable, NucleoRonda, TopCromo } from './atoms';
import { FilaMovimiento, FranjaPulso, type EstadoMovimiento } from './filas';
import { MOVIMIENTOS, lineaMovimiento, type LecturaErg } from './data';
import type { VistaViva } from './vista';

/** El ancho de la franja. Cabe el marcador con aire y sigue tocándose sudando. */
const FRANJA_ANCHO = 250;

export function CaraHorizontal({
  vista,
  appearance,
  destello,
}: {
  vista: VistaViva;
  appearance: TwinAppearance;
  destello: number;
}) {
  return (
    // El contenedor de consulta del que cuelga la escala del numeral (§10.2).
    // En retrato lo abre `MarcoVivo`; aquí, que no lo usamos, lo abre la cara.
    <div style={{ position: 'relative', height: '100%', containerType: 'size' }}>
      <Ambiente zona={zonaDe(vista.pulsoPpm)} appearance={appearance} />
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

/**
 * La ventana arriba (contexto) y el marcador debajo (sujeto), en la superficie
 * dominante de este lado. Es el mismo trato del §10.4 que en retrato: la caja
 * se gana porque manda sobre todo lo que tiene al lado y porque es lo que se
 * toca.
 */
function Franja({ vista }: { vista: VistaViva }) {
  const caliente = vista.tension > 0;
  const tinte = caliente ? 'var(--twin-accent-text)' : 'var(--twin-fg)';
  return (
    <div style={{ flex: `0 0 ${FRANJA_ANCHO}px`, minWidth: 0, display: 'grid' }}>
      <MarcadorTocable onClick={vista.onCerrarRonda} etiqueta={`Cerrar la ronda ${vista.rondas + 1}`}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span className="t-readout-s" style={{ color: tinte, transition: 'color 500ms linear' }}>
            {vista.ventanaTexto}
          </span>
          <EtiquetaSujeto tono={caliente ? 'var(--twin-accent-text)' : 'var(--twin-muted)'}>quedan</EtiquetaSujeto>
        </div>
        {vista.aliento && (
          <span style={{ font: '600 13px/1.2 var(--twin-font-sans)', color: 'var(--twin-accent-text)' }}>
            {vista.aliento}
          </span>
        )}

        <div
          aria-hidden
          style={{ height: 1, alignSelf: 'stretch', background: 'var(--twin-hairline)', margin: `${SP.s}px 0` }}
        />

        <NucleoRonda
          horizontal
          rondas={vista.rondas}
          repsMarcadas={vista.repsMarcadas}
          compara={vista.compara}
          // La ronda cede el peldaño cuando manda el monitor, pero no el sitio:
          // es la diferencia entre subordinarse y desaparecer.
          cede={vista.cara === 'monitor'}
        />
      </MarcadorTocable>
    </div>
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
        <EtiquetaSujeto>{lineaMovimiento(MOVIMIENTOS[1])}</EtiquetaSujeto>
        <span style={{ flex: 1 }} />
        <span className="t-readout-label" style={{ color: 'var(--twin-muted)', letterSpacing: '0.08em' }}>
          lo cuenta el monitor
        </span>
      </div>

      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center' }}>
        <Numeral
          horizontal
          tono={hecho ? 'var(--twin-ok)' : 'var(--twin-fg)'}
          unidad={`/ ${erg.objetivoCal} cal`}
        >
          {erg.cal}
        </Numeral>
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

      <FilaApoyos>
        <Apoyo etiqueta="Ritmo" valor={erg.ritmo500} pie="/500m" />
        <Apoyo etiqueta="Vatios" valor={`${erg.vatios}`} />
        {pulsoPpm !== null && zona !== null && (
          <Apoyo etiqueta="Pulso" valor={`${pulsoPpm}`} tono={colorZona(zona)} pie={`ppm · Z${zona}`} />
        )}
      </FilaApoyos>
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
