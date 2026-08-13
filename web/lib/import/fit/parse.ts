// FIT (bytes) → ParsedFile. Puro: sin base de datos, sin red — ver
// canonical.ts para el porqué de este seam. Decodifica con el SDK oficial de
// Garmin (@garmin/fitsdk) y traduce session/lap/record al contrato; el resto
// de mensajes del fichero (device_info, hrv, monitoring…) no se leen porque el
// contrato no los pide.

import { Decoder, Stream } from '@garmin/fitsdk';
import type { FileIdMesg, LapMesg, RecordMesg, SessionMesg } from '@garmin/fitsdk';
import type { SegmentModality } from '@fahybrid/shared/domain/segment-modality';
import type {
  CanonicalActivity,
  CanonicalHrSample,
  CanonicalLap,
  CanonicalRoutePoint,
  ParsedFile,
} from './canonical';
import { avgSpeedToPaceSPerKm, buildSourceRef, lapRunCadenceSpm, semicirclesToDegrees } from './convert';
import { intensityToRole, sportToModality } from './mappings';
import {
  bucketByWindow,
  isMirrorLap,
  resolveLapWindow,
  resolveSessionWindow,
  type SessionWindow,
} from './session-window';

export function parseFitFile(bytes: Uint8Array): ParsedFile {
  const warnings: string[] = [];
  try {
    return decodeFile(bytes, warnings);
  } catch (error) {
    // Red de seguridad: el decoder de Garmin ya atrapa sus propias excepciones
    // (README: "Any exceptions... will be caught by the Read method"), pero un
    // fichero adversarial no debe tirar el job de importación por lotes.
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Error inesperado al parsear el fichero FIT: ${message}`);
    return { activities: [], warnings };
  }
}

function decodeFile(bytes: Uint8Array, warnings: string[]): ParsedFile {
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  if (!decoder.isFIT()) {
    warnings.push('El fichero no tiene la cabecera .FIT — no se reconoce como FIT.');
    return { activities: [], warnings };
  }

  const { messages, errors } = decoder.read();
  for (const err of errors) {
    warnings.push(`Error al decodificar el FIT: ${err.message}`);
  }

  const sessions = messages.sessionMesgs ?? [];
  if (sessions.length === 0) {
    // Cubre tanto un fichero corrupto (nada decodificable) como uno legítimo
    // sin actividad — settings, monitoring, o un workout (que no trae
    // session). El contrato pide el mismo resultado para los tres casos.
    warnings.push('El fichero FIT no trae ninguna actividad (session) — puede ser un export de settings/monitoring.');
    return { activities: [], warnings };
  }

  const fileId = messages.fileIdMesgs?.[0];
  const { windows, valid } = resolveSessions(sessions, warnings);
  const resolvedLaps = resolveLaps(messages.lapMesgs ?? [], warnings);
  const records = messages.recordMesgs ?? [];

  const lapBuckets = bucketByWindow(resolvedLaps, (x) => x.window.started_at, windows);
  const recordBuckets = bucketByWindow(records, (r) => (r.timestamp instanceof Date ? r.timestamp : null), windows);

  const activities: CanonicalActivity[] = valid.map((session, i) =>
    buildActivity(session, windows[i]!, lapBuckets[i] ?? [], recordBuckets[i] ?? [], fileId, bytes),
  );

  return { activities, warnings };
}

/** Filtra a las sessions que sí definen ventana temporal + deporte (lo único
 *  no-opcional del contrato); las demás se avisan y se descartan. */
function resolveSessions(
  sessions: SessionMesg[],
  warnings: string[],
): { windows: SessionWindow[]; valid: SessionMesg[] } {
  const windows: SessionWindow[] = [];
  const valid: SessionMesg[] = [];
  for (const session of sessions) {
    const window = resolveSessionWindow(session);
    if (!window || typeof session.sport !== 'string') {
      warnings.push('Una session del FIT no trae ventana temporal o deporte válidos — se descarta.');
      continue;
    }
    windows.push(window);
    valid.push(session);
  }
  return { windows, valid };
}

interface ResolvedLap {
  mesg: LapMesg;
  window: SessionWindow;
}

function resolveLaps(laps: LapMesg[], warnings: string[]): ResolvedLap[] {
  const resolved: ResolvedLap[] = [];
  for (const lap of laps) {
    const window = resolveLapWindow(lap);
    if (window) resolved.push({ mesg: lap, window });
  }
  const dropped = laps.length - resolved.length;
  if (dropped > 0) {
    warnings.push(`${dropped} lap(s) del FIT sin ventana temporal válida — se ignoran.`);
  }
  return resolved;
}

function buildActivity(
  session: SessionMesg,
  window: SessionWindow,
  sessionLaps: ResolvedLap[],
  sessionRecords: RecordMesg[],
  fileId: FileIdMesg | undefined,
  bytes: Uint8Array,
): CanonicalActivity {
  const modality = sportToModality(session.sport);
  return {
    source_ref: buildSourceRef(fileId, window.started_at, bytes),
    source: 'fit_import',
    modality,
    started_at: window.started_at,
    ended_at: window.ended_at,
    duration_s: numberOrNull(session.totalTimerTime),
    distance_m: numberOrNull(session.totalDistance),
    avg_hr: numberOrNull(session.avgHeartRate),
    max_hr: numberOrNull(session.maxHeartRate),
    calories_kcal: numberOrNull(session.totalCalories),
    elevation_gain_m: numberOrNull(session.totalAscent),
    elevation_loss_m: numberOrNull(session.totalDescent),
    laps: buildLaps(sessionLaps, window, modality),
    hr_samples: buildHrSamples(sessionRecords),
    route: buildRoute(sessionRecords),
  };
}

function buildLaps(resolvedLaps: ResolvedLap[], sessionWindow: SessionWindow, modality: SegmentModality): CanonicalLap[] {
  if (resolvedLaps.length === 1 && isMirrorLap(resolvedLaps[0]!.window, sessionWindow)) {
    return [];
  }
  return resolvedLaps.map(({ mesg: lap, window }) => ({
    started_at: window.started_at,
    ended_at: window.ended_at,
    distance_m: numberOrNull(lap.totalDistance),
    duration_s: numberOrNull(lap.totalTimerTime),
    avg_hr: numberOrNull(lap.avgHeartRate),
    max_hr: numberOrNull(lap.maxHeartRate),
    avg_pace_s_per_km: avgSpeedToPaceSPerKm(lap.avgSpeed),
    run_cadence_spm: lapRunCadenceSpm(lap, modality),
    elevation_gain_m: numberOrNull(lap.totalAscent),
    role: intensityToRole(lap.intensity),
  }));
}

/** Las muestras de pulso vienen de `record.heartRate`, ya con las HR mesgs de
 *  bandas externas fusionadas dentro (opción `mergeHeartRates`, activa por
 *  defecto en el decoder) — no hace falta leer los mensajes `hr` aparte. Los
 *  records llegan del decoder en el mismo orden del stream, que es
 *  cronológico, así que la salida queda ordenada sin más. */
function buildHrSamples(records: RecordMesg[]): CanonicalHrSample[] {
  const samples: CanonicalHrSample[] = [];
  for (const r of records) {
    if (r.timestamp instanceof Date && typeof r.heartRate === 'number') {
      samples.push({ at: r.timestamp, bpm: r.heartRate });
    }
  }
  return samples;
}

function buildRoute(records: RecordMesg[]): CanonicalRoutePoint[] {
  const points: CanonicalRoutePoint[] = [];
  for (const r of records) {
    if (r.timestamp instanceof Date && typeof r.positionLat === 'number' && typeof r.positionLong === 'number') {
      points.push({
        at: r.timestamp,
        lat: semicirclesToDegrees(r.positionLat),
        lon: semicirclesToDegrees(r.positionLong),
      });
    }
  }
  return points;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
