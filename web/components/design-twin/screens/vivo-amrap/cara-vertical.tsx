'use client';

// La cara vertical: el móvil en el suelo, de pie encima.
//
// LO QUE CAMBIÓ EL 29-JUL, Y POR QUÉ ES ESTA PANTALLA LA QUE OBLIGÓ A CORREGIR
// EL §10.4. El «5» de las rondas vivía en una caja con borde de 1 px y
// superficie opaca, apilada encima de tres tarjetas de movimiento idénticas:
// cinco cajas iguales, y el sujeto era una más de la lista. La regla vieja
// («el sujeto nunca dentro de una tarjeta») era demasiado absoluta —el erg mete
// su ritmo en una superficie y funciona—, así que la regla real quedó así: el
// sujeto es la superficie DOMINANTE de la pantalla, o no lleva superficie
// ninguna.
//
// Aquí se elige dominante, y no «fuera la caja», por una razón funcional: en un
// AMRAP el sujeto ES el botón. La ronda se cierra tocando el marcador con el
// móvil en el suelo y la mano sudada, así que la zona de toque tiene que verse.
// `BandaSujeto dominante` le da la banda entera y la corona con la regla de
// acento; las filas de movimiento bajan a peso de apoyo (ver `filas.tsx`). El
// sujeto deja de ser un ítem de una lista sin dejar de ser tocable.
//
// El tiempo sigue siendo AMBIENTE (el aro que drena) y ahora comparte lienzo
// con el otro ambiente, el de verdad: el tinte de la zona de pulso (§10.1).

import type { TwinAppearance } from '../../types';
import { Ambiente, FranjaAccion, MarcoVivo, zonaDe } from '../../kit-vivo';
import { AroVentana } from './aro';
import { CapaPausa, Destello, MarcadorTocable, NucleoRonda, TopCromo, VentanaReadout } from './atoms';
import { FilaMovimiento, FranjaPulso, type EstadoMovimiento } from './filas';
import { MOVIMIENTOS } from './data';
import type { VistaViva } from './vista';

export function CaraVertical({
  vista,
  appearance,
  destello,
}: {
  vista: VistaViva;
  appearance: TwinAppearance;
  destello: number;
}) {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Ambiente zona={zonaDe(vista.pulsoPpm)} appearance={appearance} />
      <AroVentana fraccion={vista.fraccion} tension={vista.tension} />

      <MarcoVivo
        cromo={
          <TopCromo
            pausado={vista.pausado}
            ventanaTotal={vista.ventanaTotalTexto}
            onPausa={vista.onPausa}
            onSalir={vista.onSalir}
          />
        }
        contexto={
          <VentanaReadout texto={vista.ventanaTexto} caliente={vista.tension > 0} aliento={vista.aliento} />
        }
        sujeto={
          <MarcadorTocable onClick={vista.onCerrarRonda} etiqueta={`Cerrar la ronda ${vista.rondas + 1}`}>
            <NucleoRonda rondas={vista.rondas} repsMarcadas={vista.repsMarcadas} compara={vista.compara} />
          </MarcadorTocable>
        }
        apoyos={
          <>
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
            <FranjaPulso ppm={vista.pulsoPpm} />
          </>
        }
        // La fila de acción se reserva igual (mantiene la banda quieta) y aquí
        // lleva la misma acción que el marcador: el sujeto se toca con el móvil
        // en el suelo, y esta franja es la vía a una mano. Va de CONTORNO a
        // propósito — el relleno naranja aquí sería la mayor mancha de color de
        // la pantalla y le quitaría el mando al sujeto (§10.5).
        accion={<FranjaAccion titulo="RONDA HECHA" nota="o toca el marcador" onClick={vista.onCerrarRonda} />}
      />

      {/* El latido va el ÚLTIMO: pintado antes se quedaba debajo de las
          tarjetas y el golpe de luz no se veía justo cuando más falta hace. */}
      {destello > 0 && <Destello key={destello} />}

      {vista.pausado && <CapaPausa onSeguir={vista.onSeguir} />}
    </div>
  );
}
