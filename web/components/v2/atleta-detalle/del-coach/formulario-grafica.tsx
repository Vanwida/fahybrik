'use client';

// LA CONFIG DE UNA SECCIÓN CON FORMA DE GRÁFICA.
//
// Lo que se edita aquí NO es la gráfica: es de qué PERIODO habla, por qué se
// filtra y qué marcó el coach encima. Las barras no están en el formulario
// porque no son suyas — son del atleta, y se dibujan al servirle la nota.
//
// LAS MARCAS NO SE DIBUJAN AQUÍ, se dibujan sobre la gráfica de la ficha. Aquí
// se repasan: cambiarles la etiqueta, cambiarles el tono o quitarlas. Marcar
// mirando un formulario en vez de mirando el dato es exactamente cómo se acaba
// señalando la semana de al lado.
//
// LA VENTANA SE PUEDE CAMBIAR, Y ESO PUEDE DEJAR UNA MARCA FUERA. Cuando pasa no
// se borra ni se recorta —las dos cosas cambiarían en silencio lo que el coach
// señaló— sino que se dice, y él decide si la quita o vuelve a abrir la ventana.
//
// La cabecera de la sección la pone el formulario de la nota, que es donde vive
// para las otras cuatro formas.

import { finDeVentana, rangoDentroDeVentana } from '@fahybrid/shared/domain/zone-chart';
import type { SegmentModality } from '@fahybrid/shared/domain/segment-modality';
import {
  addWeeks,
  formatWeekLong,
  ZONE_MODALITY_LABEL,
  ZONE_MODALITY_ORDER,
  ZONE_WINDOWS,
} from '@/lib/zones/chart';
import type { GraficaBorrador, RangoBorrador } from '@/lib/dashboard/v2/del-coach-borrador';
import { ZonasMarcas } from '../rendimiento/ZonasMarcas';
import { AvisoFila, ChipsUnicos, LineaDeEmbed, RotuloFila } from './campos';

type FiltroModalidad = SegmentModality | 'all';

const OPCIONES_VENTANA = ZONE_WINDOWS.map((w) => ({ value: String(w.weeks), label: w.label }));

const OPCIONES_MODALIDAD: ReadonlyArray<{ value: FiltroModalidad; label: string }> = [
  { value: 'all', label: 'Todos' },
  ...ZONE_MODALITY_ORDER.map((m) => ({ value: m as FiltroModalidad, label: ZONE_MODALITY_LABEL[m] })),
];

/**
 * Cambiar el tamaño de la ventana mueve el PRINCIPIO, no el final.
 *
 * El coach está hablando de lo que ha pasado hasta ahora, así que pedir «un año»
 * en vez de «seis meses» es pedir más pasado. Moviendo el final, la misma nota
 * pasaría a hablar de un tramo que él no ha mirado.
 */
function conOtroTamano(g: GraficaBorrador, weeks: number): GraficaBorrador {
  const fin = finDeVentana(g.week_start, g.weeks);
  return { ...g, weeks, week_start: addWeeks(fin, -(weeks - 1)) };
}

export function SeccionGrafica({
  grafica,
  indice,
  anclaSirve,
  onCambiar,
}: {
  grafica: GraficaBorrador;
  indice: number;
  /** El ancla elegida deja dibujarla. Se avisa aquí y no sólo al publicar. */
  anclaSirve: boolean;
  onCambiar: (patch: Partial<GraficaBorrador>) => void;
}) {
  const fin = finDeVentana(grafica.week_start, grafica.weeks);
  const fuera = grafica.ranges.filter((r) => !rangoDentroDeVentana(grafica, r));

  const cambiarRango = (key: string, patch: Partial<RangoBorrador>) =>
    onCambiar({ ranges: grafica.ranges.map((r) => (r.key === key ? { ...r, ...patch } : r)) });

  return (
    <div className="flex flex-col gap-2.5">
      <LineaDeEmbed>
        Se dibuja sola con SUS minutos por zona del periodo que elijas. Si mañana llega el entreno
        que faltaba, esta gráfica lo tendrá: lo que se guarda es el periodo, no el dibujo.
      </LineaDeEmbed>

      <div className="flex flex-col gap-1.5">
        <RotuloFila>De cuánto tiempo habla</RotuloFila>
        <ChipsUnicos
          compacto
          opciones={OPCIONES_VENTANA}
          valor={String(grafica.weeks)}
          onChange={(weeks) => onCambiar(conOtroTamano(grafica, Number(weeks)))}
          ariaLabel={`Periodo de la gráfica de la sección ${indice + 1}`}
        />
        <span className="text-label text-[color:var(--v2-faint)]">
          De la semana del {formatWeekLong(grafica.week_start)} a la del {formatWeekLong(fin)}. El
          periodo se congela: dentro de tres meses seguirá contando esta misma historia.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <RotuloFila>Qué entrenos cuentan</RotuloFila>
        <ChipsUnicos
          compacto
          opciones={OPCIONES_MODALIDAD}
          valor={(grafica.modality ?? 'all') as FiltroModalidad}
          onChange={(m) => onCambiar({ modality: m === 'all' ? null : (m as SegmentModality) })}
          ariaLabel={`Tipo de entreno de la gráfica de la sección ${indice + 1}`}
        />
      </div>

      {grafica.ranges.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <RotuloFila>Lo que marcaste</RotuloFila>
          <ZonasMarcas
            rangos={grafica.ranges}
            onCambiar={cambiarRango}
            onQuitar={(key) => onCambiar({ ranges: grafica.ranges.filter((r) => r.key !== key) })}
          />
        </div>
      ) : (
        <span className="text-label text-[color:var(--v2-faint)]">
          Sin marcas encima. Se publica igual: verá su gráfica y lo que le escribas debajo. Para
          señalarle un tramo, márcalo sobre la gráfica de Rendimiento y vuelve a «Dar feedback».
        </span>
      )}

      {fuera.length > 0 ? (
        <AvisoFila>
          {fuera.length === 1
            ? 'Una marca se sale del periodo que has elegido'
            : `${fuera.length} marcas se salen del periodo que has elegido`}
          , así que todavía no se puede publicar. Vuelve a abrir la ventana o quítala
          {fuera.length === 1 ? '' : 's'}.
        </AvisoFila>
      ) : null}

      {anclaSirve ? null : (
        <AvisoFila>
          La gráfica cuelga de <b className="font-semibold">su plan</b>, de{' '}
          <b className="font-semibold">esta semana</b> o de nada. Cámbialo abajo, en «Dónde le
          aparece»: colgada de una sesión hablaría de un día, y esto son meses.
        </AvisoFila>
      )}
    </div>
  );
}
