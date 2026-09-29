'use client';

// ¿ENTRENA A LA INTENSIDAD QUE TOCA? — el tiempo en las cinco zonas de pulso
// del coach, semana a semana (Z1 abajo, Z5 arriba, el azul secuencial del
// panel), y el reparto fácil · medio · duro de la ventana contra el que pide su
// método, con la palabra si el servidor la dijo. Si las zonas salen de un umbral
// estimado, se dice y se ofrece declararlo.

import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { esDecimal, horasYMin } from '@/lib/formato';
import { agrupacionDe, sumarDias } from '../escala';
import { fechaLegible } from '../formato';
import { BarraReparto, Columnas } from '../graficos';
import { cubosZonas, leyendaZonas, vistaReparto } from '../derivados';
import { huecoIntensidad, huecoPendiente, type Legado } from '../huecos';
import { lectura, medida } from '../lecturas';
import { PIEL_PANEL as P } from '../piel';
import { HuecoLinea, Tarjeta, type ManejarAccion } from '../piezas';
import { palabraCoach } from '../voz';

export function Intensidad({
  intensidad,
  hoy,
  pendiente,
  legado,
  manejar,
  className,
  anchoInicial,
}: {
  intensidad: readonly Lectura[];
  hoy: string;
  pendiente: boolean;
  /** Dónde sigue el cálculo anterior mientras este bloque no se sirve. */
  legado?: Legado | null;
  manejar: ManejarAccion;
  className?: string;
  anchoInicial: number;
}) {
  const pregunta = '¿Entrena a la intensidad que toca? Tiempo en zonas y reparto';
  if (pendiente) return <Tarjeta id="intensidad" titulo="Intensidad" pregunta={pregunta} hueco={huecoPendiente('intensidad', legado)} className={className} />;

  const hueco = huecoIntensidad(intensidad);
  const z1 = lectura(intensidad, 'intensidad.z1');
  const agrupar = agrupacionDe(z1?.serie?.puntos.length ?? 0, anchoInicial - 60, 18);
  const cubos = hueco ? [] : cubosZonas(intensidad, P, agrupar, hoy);
  const reparto = hueco ? null : vistaReparto(intensidad, P);
  const polar = medida(intensidad, 'intensidad.polarizacion');
  const zonas = lectura(intensidad, 'intensidad.zonas');
  const estimadas = zonas?.estado === 'medida' && (zonas.procedencia.ancla === 'estimada' || zonas.procedencia.ancla === 'poblacional');

  return (
    <Tarjeta id="intensidad" titulo="Intensidad" pregunta={pregunta} hueco={hueco} manejar={manejar} className={className}>
      {cubos.length > 0 ? (
        <Columnas
          piel={P}
          alto={230}
          cubos={cubos}
          leyenda={leyendaZonas(intensidad, P)}
          formatoY={(v) => `${esDecimal(v, Number.isInteger(v) ? 0 : 1)} h`}
          anchoInicial={anchoInicial}
          tituloCubo={(t) => (agrupar > 1 ? `${agrupar} semanas desde el ${fechaLegible(t, hoy)}` : `Semana del ${fechaLegible(t, hoy)} al ${fechaLegible(sumarDias(t, 6), hoy)}`)}
        />
      ) : null}
      {reparto ? (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="t-label text-v2-faint">Reparto · {horasYMin(reparto.total_h * 3600)} con pulso</span>
            {polar?.veredicto ? (
              <span className="t-body-sm font-medium text-v2-fg">{palabraCoach(polar)}</span>
            ) : polar ? (
              <span className="t-meta text-v2-faint">sin palabra: el pulso no cubre bastante de ese trabajo</span>
            ) : null}
          </div>
          <BarraReparto piel={P} partes={reparto.partes} objetivo={reparto.objetivo_pct != null ? { pct: reparto.objetivo_pct, etiqueta: `pides ${Math.round(reparto.objetivo_pct)} % fácil` } : null} alto={16} />
        </div>
      ) : null}
      {estimadas ? (
        <div className="mt-3">
          <HuecoLinea
            hueco={
              zonas?.procedencia.ancla === 'poblacional'
                ? { tipo: 'poco', titulo: 'Zonas con umbral por edad', cuerpo: 'No sale de nada suyo y no cuenta para la carga. Con su umbral de pulso de un test, o declarado, pasan a medidas.', accion: 'umbral' }
                : { tipo: 'poco', titulo: 'Zonas con umbral estimado', cuerpo: 'Su umbral de pulso no sale de un test. Con uno de un test, o declarado, pasan a medidas.', accion: 'umbral' }
            }
            manejar={manejar}
          />
        </div>
      ) : null}
    </Tarjeta>
  );
}
