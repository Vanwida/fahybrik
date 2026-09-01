'use client';

// La única puerta del cliente contra `/api/coach/communications`.
//
// Existe para que el mensaje de error sea UNO: la API contesta siempre con el
// sobre `{ error: { code, message } }`, y si cada vista lo desenvolviera a su
// manera acabaríamos con tres redacciones del mismo fallo — que es justo el
// patrón que ya nos costó caro con los formateadores.

import type {
  CoachAthleteCommunicationDTO,
  CoachCommunicationDTO,
  CoachCommunicationDetailDTO,
  CreateCommunicationInput,
} from '@fahybrid/shared/domain/coach-communications';
import type { PlanPathDTO } from '@fahybrid/shared/domain/plan-path';
import type { ZoneChartDTO } from '@fahybrid/shared/domain/zone-chart';
import type { ComparePresetDTO, ZoneComparisonDTO } from '@fahybrid/shared/domain/zone-compare';

export type Resultado<T> = { ok: true; data: T } | { ok: false; mensaje: string };

const CAIDA = 'No se pudo conectar. Inténtalo de nuevo.';

async function pedir<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json', ...init?.headers } : init?.headers,
    });
    const body = (await res.json().catch(() => null)) as
      | (T & { error?: { message?: string } })
      | null;
    if (!res.ok || !body) {
      return { ok: false, mensaje: body?.error?.message ?? CAIDA };
    }
    return { ok: true, data: body };
  } catch {
    return { ok: false, mensaje: CAIDA };
  }
}

/** La biblioteca de plantillas o lo que el coach tiene a medias. */
export async function listarVista(
  view: 'templates' | 'drafts',
): Promise<Resultado<CoachCommunicationDTO[]>> {
  const r = await pedir<{ communications: CoachCommunicationDTO[] }>(
    `/api/coach/communications?view=${view}`,
  );
  return r.ok ? { ok: true, data: r.data.communications } : r;
}

/** Lo publicado a UN atleta, con su estado. Es la lectura de la ficha, y también
 *  de dónde salen los candidatos a enlazar cuando se escribe para él. */
export async function listarDeAtleta(
  athlete_id: string,
): Promise<Resultado<CoachAthleteCommunicationDTO[]>> {
  const r = await pedir<{ communications: CoachAthleteCommunicationDTO[] }>(
    `/api/coach/communications?athlete_id=${athlete_id}`,
  );
  return r.ok ? { ok: true, data: r.data.communications } : r;
}

/** Lo que el coach ya tiene publicado. Los candidatos a enlazar cuando se
 *  escribe sin un solo destinatario delante (biblioteca, varios atletas). */
export async function listarPublicados(): Promise<Resultado<CoachCommunicationDTO[]>> {
  const r = await pedir<{ communications: CoachCommunicationDTO[] }>(
    '/api/coach/communications?view=published',
  );
  return r.ok ? { ok: true, data: r.data.communications } : r;
}

/** La espina del plan de un atleta. La usa la PREVIA para enseñar su camino de
 *  verdad mientras el coach escribe, en vez de un dibujo de ejemplo. */
export async function pedirCamino(athlete_id: string): Promise<Resultado<PlanPathDTO | null>> {
  const r = await pedir<{ camino: PlanPathDTO | null }>(
    `/api/coach/athletes/${athlete_id}/camino`,
  );
  return r.ok ? { ok: true, data: r.data.camino } : r;
}

/**
 * El tiempo en zonas de un atleta en un periodo CONGELADO. Lo usa la PREVIA para
 * enseñar la gráfica que el atleta va a recibir de verdad, con sus datos, en vez
 * de un dibujo de ejemplo.
 */
export async function pedirZonas(
  athlete_id: string,
  ventana: { week_start: string; weeks: number; modality: string | null },
): Promise<Resultado<ZoneChartDTO>> {
  const qs = new URLSearchParams({
    week_start: ventana.week_start,
    weeks: String(ventana.weeks),
  });
  if (ventana.modality) qs.set('modality', ventana.modality);
  const r = await pedir<{ chart: ZoneChartDTO }>(
    `/api/coach/athletes/${athlete_id}/zones/window?${qs}`,
  );
  return r.ok ? { ok: true, data: r.data.chart } : r;
}

/**
 * Dos periodos de un atleta, sumados y enfrentados, más los ATAJOS que salen de
 * sus fechas reales (cuándo entró, cuándo arrancó su plan).
 *
 * Sin `periodos` contesta con el atajo de entrada: es como se abre el mando de la
 * ficha, con una comparación de verdad delante en vez de dos calendarios en
 * blanco. Los atajos viajan siempre, también cuando se piden fechas a mano, para
 * que las pastillas no se vacíen al tocar nada.
 */
export async function pedirComparativa(
  athlete_id: string,
  periodos?: { a_start: string; b_start: string; weeks: number },
): Promise<Resultado<{ presets: ComparePresetDTO[]; comparativa: ZoneComparisonDTO | null }>> {
  const qs = periodos
    ? `?${new URLSearchParams({
        a: periodos.a_start,
        b: periodos.b_start,
        weeks: String(periodos.weeks),
      })}`
    : '';
  return pedir<{ presets: ComparePresetDTO[]; comparativa: ZoneComparisonDTO | null }>(
    `/api/coach/athletes/${athlete_id}/zones/compare${qs}`,
  );
}

/**
 * Prepara la subida de una nota de voz y devuelve dónde ponerla. La carpeta es
 * la del COACH, así que no se le pasa ningún atleta: el mismo audio lo van a oír
 * todos los destinatarios del comunicado.
 */
export async function pedirSubidaDeAudio(fichero: File): Promise<
  Resultado<{ upload_url: string; audio_url: string; content_type: string }>
> {
  return pedir<{ upload_url: string; audio_url: string; content_type: string }>(
    '/api/coach/communications/audio-url',
    {
      method: 'POST',
      body: JSON.stringify({
        filename: fichero.name,
        mime_type: fichero.type || undefined,
        size_bytes: fichero.size,
      }),
    },
  );
}

/** Nace como borrador (o como molde, si `is_template`). Publicar es otro acto. */
export function crear(input: CreateCommunicationInput) {
  return pedir<CoachCommunicationDetailDTO>('/api/coach/communications', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Sólo borradores y plantillas, y siempre el comunicado entero. */
export function actualizar(id: string, input: CreateCommunicationInput) {
  return pedir<CoachCommunicationDetailDTO>(`/api/coach/communications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** El acto que lo pone en la bandeja del atleta y le manda el aviso. */
export function publicar(id: string, athlete_ids: number[]) {
  return pedir<{ id: string; published_at: string; recipients: number }>(
    `/api/coach/communications/${id}/publish`,
    { method: 'POST', body: JSON.stringify({ athlete_ids }) },
  );
}

/** Borra el borrador; ARCHIVA lo publicado (el historial del atleta no se toca). */
export function borrarOArchivar(id: string) {
  return pedir<{ id: string; outcome: 'deleted' | 'archived' }>(
    `/api/coach/communications/${id}`,
    { method: 'DELETE' },
  );
}
