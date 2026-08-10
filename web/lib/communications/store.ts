import 'server-only';

// La capa de lectura compartida del COMUNICADO (docs/DECISIONS.md, 2026-08-09).
//
// El coach y el atleta miran la MISMA entidad desde dos lados: él la escribe y
// mira quién la ha hecho, ella la recibe y la cierra. Las columnas, el mapeo a
// DTO y la carga de la lista ordenada de items viven aquí una sola vez para que
// las dos vistas no puedan divergir — que es exactamente el fallo que tuvo el
// chat cuando el coach y el atleta tenían cada uno su módulo.

import type { Sql, TransactionClient } from '@/lib/db';
import {
  communicationState,
  type CommunicationAnchor,
  type CommunicationDisplay,
  type CommunicationItemDTO,
  type CommunicationKind,
  type CommunicationSegmentDTO,
  type CommunicationStatus,
  type LinkedCommunicationDTO,
} from '@fahybrid/shared/domain/coach-communications';
import type { PlanPathDTO } from '@fahybrid/shared/domain/plan-path';
import type { RangeTone, ZoneChartDTO, ZoneRangeDTO } from '@fahybrid/shared/domain/zone-chart';

/** Pool o transacción: todo helper de aquí sirve para los dos. */
export type DbClient = Sql | TransactionClient;

/** Error de dominio con código y status HTTP, para que la ruta no los invente. */
export class CommunicationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CommunicationError';
  }
}

export const notFound = () =>
  new CommunicationError('not_found', 'Comunicado no encontrado', 404);

/** ISO estricto con `Z` — lo que acepta el decodificador de iOS. */
export const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

export type CommunicationRow = {
  id: string;
  kind: CommunicationKind;
  title: string;
  body: string | null;
  final_note: string | null;
  anchor_kind: CommunicationAnchor;
  anchor_ref: string | null;
  due_date: string | null;
  expires_at: Date | null;
  blocks: boolean;
  is_template: boolean;
  status: CommunicationStatus;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  linked_communication_id: string | null;
  audio_url: string | null;
  audio_seconds: number | null;
};

/**
 * Las columnas del comunicado, cualificadas por `c`. Es una FÁBRICA (fragmento
 * nuevo por llamada) porque postgres.js no permite reutilizar el mismo fragmento
 * en dos consultas. `due_date` va a texto a propósito: es un día del calendario,
 * y convertirlo a `Date` lo movería de día según la zona del servidor.
 */
export const communicationColumns = (client: DbClient) => client`
  c.id::text as id, c.kind, c.title, c.body, c.final_note,
  c.anchor_kind, c.anchor_ref, c.due_date::text as due_date, c.expires_at,
  c.blocks, c.is_template, c.status, c.published_at, c.created_at, c.updated_at,
  c.linked_communication_id::text as linked_communication_id,
  c.audio_url, c.audio_seconds
`;

export type ItemRow = {
  id: string;
  communication_id: string;
  position: number;
  label: string | null;
  content: string;
  consequence: string | null;
  checkable: boolean;
  display: CommunicationDisplay;
  grafica_week_start: string | null;
  grafica_weeks: number | null;
  grafica_modality: string | null;
};

/**
 * La CONFIG de una gráfica, sin resolver: el periodo, el filtro y las marcas que
 * el coach dibujó. Sale de la fila y viaja SIEMPRE, incluso en las lecturas sin
 * atleta delante (la biblioteca), porque es contenido que él escribió — igual
 * que los trozos de un reparto — y sin ella el compositor no podría volver a
 * abrir un borrador con su gráfica dentro.
 *
 * Lo que falta ahí son las BARRAS (`weeks_data`) y el ancla con la que salieron:
 * eso depende del atleta que mira y lo rellena `resolveGraficas` al servir. Una
 * gráfica con `weeks_data` vacío es honesta y se dice con palabras («todavía no
 * hay dato de ese periodo»), nunca se pinta como un suelo de ceros.
 */
function graficaDeFila(r: ItemRow): ZoneChartDTO | null {
  if (r.display !== 'grafica' || r.grafica_week_start == null || r.grafica_weeks == null) {
    return null;
  }
  return {
    week_start: r.grafica_week_start,
    weeks: r.grafica_weeks,
    modality: r.grafica_modality,
    weeks_data: [],
    anchor: null,
    ranges: [],
  };
}

export function rowToItemDto(
  r: ItemRow,
  segments: CommunicationSegmentDTO[] = [],
  ranges: ZoneRangeDTO[] = [],
): CommunicationItemDTO {
  const grafica = graficaDeFila(r);
  return {
    id: r.id,
    position: r.position,
    label: r.label,
    content: r.content,
    consequence: r.consequence,
    checkable: r.checkable,
    display: r.display,
    segments,
    // El camino no se lee de la tabla: se resuelve con el plan del atleta al
    // servir (`attachCamino`). Aquí siempre sale null, que es lo correcto en
    // toda lectura sin un atleta delante — la biblioteca del coach, por ejemplo.
    camino: null,
    grafica: grafica ? { ...grafica, ranges } : null,
  };
}

/**
 * Los items de varios comunicados de una sola consulta, agrupados por id y ya en
 * orden. Una consulta por comunicado sería N+1 en la bandeja del atleta, que es
 * justo la lectura más caliente de toda la feature.
 */
export async function loadItemsByCommunication(
  client: DbClient,
  communicationIds: string[],
): Promise<Map<string, CommunicationItemDTO[]>> {
  const grouped = new Map<string, CommunicationItemDTO[]>();
  if (communicationIds.length === 0) return grouped;

  const rows = await client<ItemRow[]>`
    select id::text as id, communication_id::text as communication_id,
           position, label, content, consequence, checkable, display,
           to_char(grafica_week_start, 'YYYY-MM-DD') as grafica_week_start,
           grafica_weeks, grafica_modality
    from coach_communication_items
    where communication_id = any(${communicationIds}::bigint[])
    order by communication_id, position
  `;
  if (rows.length === 0) return grouped;

  const marcas = await loadSegmentsByItem(
    client,
    rows.filter((r) => r.display === 'reparto' || r.display === 'grafica').map((r) => r.id),
  );

  for (const row of rows) {
    const suyas = marcas.get(row.id);
    const dto = rowToItemDto(row, suyas?.segments ?? [], suyas?.ranges ?? []);
    const list = grouped.get(row.communication_id);
    if (list) list.push(dto);
    else grouped.set(row.communication_id, [dto]);
  }
  return grouped;
}

/**
 * Las marcas de una tanda de items, en una sola consulta y ya separadas por lo
 * que son.
 *
 * Los trozos de un reparto y los rangos de una gráfica comparten tabla (misma
 * lista ordenada colgando de una sección, migración 0169) pero NO comparten
 * significado: uno PESA y el otro marca un PERIODO. Se separan aquí, una vez,
 * leyendo la propia fila —lleva valor o lleva fechas, nunca las dos, y el CHECK
 * de la tabla lo garantiza— para que ninguna pantalla tenga que adivinarlo.
 */
async function loadSegmentsByItem(
  client: DbClient,
  itemIds: string[],
): Promise<Map<string, { segments: CommunicationSegmentDTO[]; ranges: ZoneRangeDTO[] }>> {
  const grouped = new Map<string, { segments: CommunicationSegmentDTO[]; ranges: ZoneRangeDTO[] }>();
  if (itemIds.length === 0) return grouped;

  const rows = await client<
    {
      item_id: string;
      position: number;
      value_num: string | null;
      label: string;
      week_start: string | null;
      week_end: string | null;
      tone: RangeTone | null;
    }[]
  >`
    select item_id::text as item_id, position, value_num::text as value_num, label,
           to_char(week_start, 'YYYY-MM-DD') as week_start,
           to_char(week_end,   'YYYY-MM-DD') as week_end,
           tone
    from coach_communication_item_segments
    where item_id = any(${itemIds}::bigint[])
    order by item_id, position
  `;
  for (const row of rows) {
    let entry = grouped.get(row.item_id);
    if (!entry) {
      entry = { segments: [], ranges: [] };
      grouped.set(row.item_id, entry);
    }
    if (row.week_start != null && row.week_end != null && row.tone != null) {
      entry.ranges.push({
        week_start: row.week_start,
        week_end: row.week_end,
        label: row.label,
        tone: row.tone,
      });
      continue;
    }
    // `numeric` llega como cadena de postgres.js (no cabe siempre en un double
    // y por eso el driver no lo convierte): el número se hace aquí, una vez.
    entry.segments.push({
      position: row.position,
      value_num: Number(row.value_num),
      label: row.label,
    });
  }
  return grouped;
}

/**
 * Le pone a las secciones «camino» la espina que les toca. Es una función y no
 * un campo de la consulta porque el camino no está en la tabla: depende del
 * ATLETA que está mirando, y la misma nota publicada a diez atletas dibuja diez
 * caminos distintos.
 */
export function attachCamino(items: CommunicationItemDTO[], camino: PlanPathDTO | null): CommunicationItemDTO[] {
  if (camino === null) return items;
  return items.map((i) => (i.display === 'camino' ? { ...i, camino } : i));
}

/** ¿Hay alguna sección que necesite el plan? Decide si la consulta se hace. */
export function needsCamino(items: CommunicationItemDTO[]): boolean {
  return items.some((i) => i.display === 'camino');
}

/**
 * Le pone a las secciones «grafica» las barras que les tocan, por id de sección.
 *
 * Por SECCIÓN y no una para todas (que es como se resuelve el camino) porque
 * cada gráfica lleva su propio periodo y su propio filtro: dos secciones de la
 * misma nota pueden mirar seis meses de todo y tres meses de correr. Lo que
 * viene resuelto son las barras y el ancla; el periodo, el filtro y las marcas ya
 * estaban en la fila y no se tocan.
 */
export function attachGraficas(
  items: CommunicationItemDTO[],
  resueltas: Map<string, ZoneChartDTO>,
): CommunicationItemDTO[] {
  if (resueltas.size === 0) return items;
  return items.map((i) => {
    const resuelta = resueltas.get(i.id);
    return resuelta ? { ...i, grafica: resuelta } : i;
  });
}

/** ¿Hay alguna sección que necesite los segundos por zona del atleta? */
export function needsGrafica(items: CommunicationItemDTO[]): boolean {
  return items.some((i) => i.display === 'grafica' && i.grafica != null);
}

/**
 * Los comunicados enlazados de una tanda, vistos por el COACH: son suyos, así
 * que le llegan siempre. Sin estado, porque sin un atleta delante no hay estado
 * que contar (un comunicado publicado a ocho tiene ocho).
 */
export async function loadLinkedForCoach(
  client: DbClient,
  linkedIds: string[],
): Promise<Map<string, LinkedCommunicationDTO>> {
  const found = new Map<string, LinkedCommunicationDTO>();
  const ids = [...new Set(linkedIds)];
  if (ids.length === 0) return found;

  const rows = await client<{ id: string; kind: CommunicationKind; title: string; blocks: boolean }[]>`
    select id::text as id, kind, title, blocks
    from coach_communications
    where id = any(${ids}::bigint[])
  `;
  for (const row of rows) {
    found.set(row.id, { id: row.id, kind: row.kind, title: row.title, blocks: row.blocks, state: null });
  }
  return found;
}

/**
 * Los comunicados enlazados de una tanda, vistos por UN ATLETA: sólo viajan los
 * que también son suyos, y viajan con SU estado.
 *
 * Que el filtro esté aquí y no en la pantalla es la regla entera: si el enlace
 * viajara siempre, el atleta vería que existe algo que no es suyo — y si viajara
 * sin estado, el pie de la nota le seguiría pidiendo que conteste una pregunta
 * que ya contestó.
 */
export async function loadLinkedForAthlete(
  client: DbClient,
  linkedIds: string[],
  athlete_id: number | bigint,
): Promise<Map<string, LinkedCommunicationDTO>> {
  const found = new Map<string, LinkedCommunicationDTO>();
  const ids = [...new Set(linkedIds)];
  if (ids.length === 0) return found;

  const rows = await client<
    {
      id: string;
      kind: CommunicationKind;
      title: string;
      blocks: boolean;
      seen_at: Date | null;
      done_at: Date | null;
      answered_at: Date | null;
    }[]
  >`
    select c.id::text as id, c.kind, c.title, c.blocks,
           r.seen_at, r.done_at, r.answered_at
    from coach_communications c
    join coach_communication_recipients r on r.communication_id = c.id
    where c.id = any(${ids}::bigint[])
      and r.athlete_id = ${athlete_id as number}
      and c.status = 'published'
  `;
  for (const row of rows) {
    found.set(row.id, {
      id: row.id,
      kind: row.kind,
      title: row.title,
      blocks: row.blocks,
      state: communicationState({
        seen_at: iso(row.seen_at),
        done_at: iso(row.done_at),
        answered_at: iso(row.answered_at),
      }),
    });
  }
  return found;
}

/**
 * Los pasos marcados de varios destinatarios, agrupados por destinatario. Lo
 * usan los dos lados: la bandeja del atleta (sus marcas) y la ficha del atleta
 * en el dashboard (las de ESE atleta, vistas por el coach) — una sola consulta,
 * nunca una por comunicado.
 */
export async function loadMarksByRecipient(
  client: DbClient,
  recipientIds: string[],
): Promise<Map<string, string[]>> {
  const grouped = new Map<string, string[]>();
  if (recipientIds.length === 0) return grouped;
  const rows = await client<{ recipient_id: string; item_id: string }[]>`
    select recipient_id::text as recipient_id, item_id::text as item_id
    from coach_communication_item_marks
    where recipient_id = any(${recipientIds}::bigint[])
    order by item_id
  `;
  for (const row of rows) {
    const list = grouped.get(row.recipient_id);
    if (list) list.push(row.item_id);
    else grouped.set(row.recipient_id, [row.item_id]);
  }
  return grouped;
}
