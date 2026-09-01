import 'server-only';

// LA GRÁFICA DE UNA NOTA, RESUELTA EN EL MOMENTO DE SERVIRLA.
//
// Lo consume la sección `grafica` de una nota del coach (migración 0169), pero
// no es del comunicado: es de las ZONAS. Por eso el dibujo lo calcula el motor
// (`lib/zones/weekly`) y el contrato vive en `@fahybrid/shared/domain/zone-chart`
// — el mismo que van a leer iOS y las analíticas del atleta.
//
// POR QUÉ SE RESUELVE Y NO SE GUARDA
// ----------------------------------
// Es la lección del camino, aplicada al dato en vez de a la estructura. Si al
// escribir la nota se guardaran las barras, la nota seguiría contando lo que se
// sabía ese día: ni el entreno que llegó tarde por la ingesta, ni el histórico
// recomputado el día que el atleta se midió el umbral de verdad. Y una nota se
// relee justamente meses después, que es cuando más mentiría.
//
// LO QUE SÍ SE GUARDA ES EL PERIODO
// ---------------------------------
// La ventana es absoluta (un lunes y un número de semanas) y no «los últimos
// seis meses». El dato de dentro se actualiza; el trozo de calendario del que
// habla el coach, no. Sin eso, las marcas que dibujó encima —que son fechas— se
// quedarían fuera de su propia gráfica en cuanto pasara una semana.

import type { Sql, TransactionClient } from '@/lib/db';
import type { CommunicationItemDTO } from '@fahybrid/shared/domain/coach-communications';
import type { ZoneChartDTO } from '@fahybrid/shared/domain/zone-chart';
import { loadZoneWindow } from '@/lib/zones/weekly';
import { SEGMENT_MODALITIES, type SegmentModality } from '@fahybrid/shared/domain/segment-modality';

type DbClient = Sql | TransactionClient;

/** Dos secciones que miran el MISMO periodo con el MISMO filtro son una sola
 *  consulta. Es lo que hace que una bandeja con cuatro notas del mismo feedback
 *  no dispare cuatro agregaciones idénticas. */
function claveDeVentana(g: ZoneChartDTO): string {
  return `${g.week_start}|${g.weeks}|${g.modality ?? '*'}`;
}

/** La modalidad guardada, sólo si sigue estando en el vocabulario. Una que ya no
 *  existe se sirve como «todo» en vez de como una lista vacía: es lo que menos
 *  miente sobre un filtro que dejó de significar algo. */
function modalidadVigente(raw: string | null): SegmentModality | null {
  return raw != null && (SEGMENT_MODALITIES as readonly string[]).includes(raw)
    ? (raw as SegmentModality)
    : null;
}

/**
 * Las barras de cada sección con gráfica de UNA tanda de comunicados, para EL
 * atleta que está mirando.
 *
 * Devuelve un mapa por id de sección, no por comunicado: la misma nota puede
 * llevar dos gráficas con periodos distintos, y la misma nota publicada a diez
 * atletas dibuja diez gráficas distintas.
 *
 * Sin `athlete_id` no se llama: en la biblioteca del coach no hay a quién
 * resolvérsela, y ahí la sección viaja con su config y sin barras — que es lo
 * que necesita el compositor para volver a abrirla.
 */
export async function resolveGraficas(args: {
  grupos: Iterable<CommunicationItemDTO[]>;
  athlete_id: number | bigint;
  sql: DbClient;
}): Promise<Map<string, ZoneChartDTO>> {
  const resueltas = new Map<string, ZoneChartDTO>();

  // Una pasada para juntar qué ventanas distintas hay y qué secciones cuelgan de
  // cada una.
  const porVentana = new Map<string, { config: ZoneChartDTO; secciones: ZoneChartDTO[] }>();
  const ventanaDe = new Map<string, ZoneChartDTO>();
  for (const items of args.grupos) {
    for (const item of items) {
      if (item.display !== 'grafica' || item.grafica == null) continue;
      ventanaDe.set(item.id, item.grafica);
      const clave = claveDeVentana(item.grafica);
      const entrada = porVentana.get(clave);
      if (entrada) entrada.secciones.push(item.grafica);
      else porVentana.set(clave, { config: item.grafica, secciones: [item.grafica] });
    }
  }
  if (porVentana.size === 0) return resueltas;

  const ventanas = [...porVentana.values()];
  const datos = await Promise.all(
    ventanas.map((v) =>
      loadZoneWindow({
        athlete_id: Number(args.athlete_id),
        week_start: v.config.week_start,
        weeks: v.config.weeks,
        modality: modalidadVigente(v.config.modality),
        // `loadZoneWindow` sólo LEE, así que sirve tanto el pool como una
        // transacción en curso.
        client: args.sql as Sql,
      }),
    ),
  );

  const barrasDeLaVentana = new Map(
    ventanas.map((v, i) => [claveDeVentana(v.config), datos[i]!] as const),
  );

  // Las MARCAS son de cada sección aunque dos compartan periodo: lo que se
  // reutiliza es la consulta, no lo que el coach escribió encima.
  for (const [itemId, config] of ventanaDe) {
    const barras = barrasDeLaVentana.get(claveDeVentana(config));
    if (!barras) continue;
    resueltas.set(itemId, { ...config, weeks_data: barras.weeks_data, anchor: barras.anchor });
  }

  return resueltas;
}
