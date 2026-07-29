'use client';

// La cara vertical: el móvil en el suelo, de pie encima.
//
// Aquí la ventana es SOLO ambiente (el aro) y el sujeto es la ronda, con la
// zona de toque comiéndose la mitad del lienzo. El tramo no cambia la
// composición: en retrato no hay sitio para un instrumento y para el formato a
// la vez, así que lo que mide el monitor se enseña donde toca (la cifra viva
// dentro de la fila del remo) y no desplaza a nadie.

import { SP } from '../../kit';
import { ARO_MARGEN, AroVentana } from './aro';
import { CapaPausa, Destello, NucleoRonda, TopCromo, VentanaReadout } from './atoms';
import { FilaMovimiento, FranjaPulso, type EstadoMovimiento } from './filas';
import { MOVIMIENTOS } from './data';
import type { VistaViva } from './vista';

export function CaraVertical({ vista, destello }: { vista: VistaViva; destello: number }) {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <AroVentana fraccion={vista.fraccion} tension={vista.tension} />

      <div
        style={{
          position: 'absolute',
          inset: ARO_MARGEN,
          display: 'flex',
          flexDirection: 'column',
          gap: SP.m,
        }}
      >
        <TopCromo
          pausado={vista.pausado}
          ventanaTotal={vista.ventanaTotalTexto}
          onPausa={vista.onPausa}
          onSalir={vista.onSalir}
        />

        <VentanaReadout
          texto={vista.ventanaTexto}
          tamano={vista.remate ? 72 : vista.tension > 0 ? 48 : 34}
          caliente={vista.tension > 0}
          aliento={vista.aliento}
        />

        <button
          type="button"
          onClick={vista.onCerrarRonda}
          aria-label={`Cerrar la ronda ${vista.rondas + 1}`}
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            width: '100%',
            padding: SP.m,
            borderRadius: 20,
            border: '1px solid var(--twin-hairline-strong)',
            background: 'color-mix(in srgb, var(--twin-surface) 70%, transparent)',
            color: 'var(--twin-fg)',
            cursor: 'pointer',
          }}
        >
          <NucleoRonda
            rondas={vista.rondas}
            repsMarcadas={vista.repsMarcadas}
            compara={vista.compara}
            tamano={144}
            pista="toca aquí al cerrar la ronda"
          />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '0 0 auto' }}>
          {MOVIMIENTOS.map((m, i) => {
            const estado: EstadoMovimiento =
              i < vista.marcados ? 'hecho' : i === vista.marcados ? 'actual' : 'pendiente';
            return (
              <FilaMovimiento
                key={m.nombre}
                movimiento={m}
                estado={estado}
                medida={i === vista.marcados && vista.erg ? `${vista.erg.cal} / ${vista.erg.objetivoCal} cal` : null}
                onMarcar={() => vista.onMarcar(i)}
              />
            );
          })}
        </div>

        <FranjaPulso ppm={vista.pulsoPpm} />
      </div>

      {/* El latido va el ÚLTIMO: pintado antes se quedaba debajo de las
          tarjetas y el golpe de luz no se veía justo cuando más falta hace. */}
      {destello > 0 && <Destello key={destello} />}

      {vista.pausado && <CapaPausa onSeguir={vista.onSeguir} />}
    </div>
  );
}
