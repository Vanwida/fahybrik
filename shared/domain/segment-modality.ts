// @fahybrid/shared/domain/segment-modality — CON QUÉ SE HIZO UN TRAMO.
//
// Seis valores cerrados: correr, remo, ski, bici, fuerza y todo lo demás. Es el
// eje por el que se parte cualquier analítica de volumen, así que tiene que
// significar lo mismo en las tres puntas — lo manda iOS al sincronizar, lo
// agrega el motor de zonas y lo elige el coach como filtro de una gráfica.
//
// VIVE AQUÍ Y NO EN `web/lib/sync` porque desde que una nota del coach puede
// llevar una gráfica filtrada, el vocabulario lo necesita también el esquema de
// escritura del comunicado, que es compartido y corre en el navegador. Con la
// lista en el módulo de sincronización (que importa la base de datos) el zod del
// compositor no podía verla, y la alternativa era escribirla dos veces: el día
// que llegara la séptima modalidad, una de las dos copias se quedaría corta sin
// que nada dejara de compilar.
//
// `web/lib/sync/ingest-execution-segments` la reexporta, así que todo lo que ya
// la importaba de allí sigue igual.

/** Estrecho a propósito: los cubos «correr» y «remo» tienen que ser estables
 *  entre versiones, y lo que no encaja se normaliza a `other` en vez de abrir
 *  una categoría nueva por cada palabra que mande un cliente. */
export const SEGMENT_MODALITIES = ['run', 'row', 'ski', 'bike', 'strength', 'other'] as const;
export type SegmentModality = (typeof SEGMENT_MODALITIES)[number];
