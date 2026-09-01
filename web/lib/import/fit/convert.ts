// Conversiones de UNIDAD (no de vocabulario — eso vive en mappings.ts). Cada
// una documenta el porqué, verificado contra el perfil 21.208.0 instalado en
// node_modules/@garmin/fitsdk, no de memoria.

import { createHash } from 'node:crypto';
import type { FileIdMesg, LapMesg } from '@garmin/fitsdk';
import type { SegmentModality } from '@fahybrid/shared/domain/segment-modality';

/**
 * Semicírculos FIT → grados decimales. `position_lat`/`position_long` son
 * sint32 con scale=1 y offset=0 en el perfil (verificado: `record.positionLat`
 * en profile.js, campo 0) — el SDK NO los convierte, los entrega en crudo. Una
 * vuelta completa (360°) son 2^31 semicírculos, así que grados = crudo · (180 / 2^31).
 */
const SEMICIRCLE_TO_DEGREES = 180 / 2 ** 31;

export function semicirclesToDegrees(raw: number): number {
  return raw * SEMICIRCLE_TO_DEGREES;
}

/**
 * Cadencia media de un lap, en pasos/min TOTALES (spm) — el contrato dice que
 * solo tiene sentido en modalidad run, así que fuera de 'run' siempre es null.
 *
 * FIT registra la cadencia de carrera como zancadas de UNA sola pierna por
 * minuto: el subcampo del perfil `avg_running_cadence` (activo cuando
 * `sport=running`, verificado en profile.js sobre el campo `avg_cadence` del
 * lap) comparte el MISMO valor crudo que `avg_cadence` — solo reetiqueta las
 * unidades de "rpm" a "strides/min", no reescala nada. El total de pasos/min
 * es por tanto el doble. `avg_fractional_cadence` añade la parte decimal
 * (mismo espacio de unidades) antes de doblar, para no perder precisión por
 * el redondeo a entero de `avg_cadence`.
 */
export function lapRunCadenceSpm(lap: LapMesg, modality: SegmentModality): number | null {
  if (modality !== 'run' || typeof lap.avgCadence !== 'number') return null;
  const fractional = typeof lap.avgFractionalCadence === 'number' ? lap.avgFractionalCadence : 0;
  return Math.round((lap.avgCadence + fractional) * 2);
}

/**
 * `avg_speed` (m/s, el propio fichero lo trae) → ritmo en s/km. Es una
 * conversión de UNIDAD sobre un dato que YA está en el mensaje — distinto de
 * lo que hace el materializador cuando el fichero no trae `avg_speed` y tiene
 * que DERIVAR el ritmo de distancia+duración (ver comentario del campo en
 * canonical.ts).
 */
export function avgSpeedToPaceSPerKm(avgSpeed: number | null | undefined): number | null {
  if (typeof avgSpeed !== 'number' || avgSpeed <= 0) return null;
  return 1000 / avgSpeed;
}

/**
 * `fit:<serial>:<epoch>` — el epoch es UNIX (segundos desde 1970), no el epoch
 * interno de FIT (que arranca en 1989-12-31): lo único que le importa al dedupe
 * es que sea ESTABLE para el mismo fichero, no de qué reloj sale. Sin serial
 * (agregadores tipo Strava/TrainingPeaks al exportar, o algunos simuladores)
 * cae al sha1 de los bytes — el mismo fichero subido dos veces sigue dando el
 * mismo ref aunque no identifique el reloj.
 */
export function buildSourceRef(fileId: FileIdMesg | undefined, startedAt: Date, bytes: Uint8Array): string {
  const serial = fileId?.serialNumber;
  const idPart = typeof serial === 'number' && serial > 0 ? String(serial) : sha1Hex(bytes);
  return `fit:${idPart}:${Math.floor(startedAt.getTime() / 1000)}`;
}

function sha1Hex(bytes: Uint8Array): string {
  return createHash('sha1').update(bytes).digest('hex');
}
