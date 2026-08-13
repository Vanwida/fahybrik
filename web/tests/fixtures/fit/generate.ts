// Genera los fixtures binarios de tests/import/fit-parse.test.ts con el
// ENCODER oficial de Garmin (@garmin/fitsdk) — bytes .FIT REALES, no un mock
// del decoder. Reproducible: mismo script, mismos bytes (todas las fechas van
// hardcodeadas, no `new Date()`).
//
// Cómo regenerar (desde web/):
//   node --no-warnings tests/fixtures/fit/generate.ts
//
// (El aviso MODULE_TYPELESS_PACKAGE_JSON es inocuo — Node detecta ESM por la
// sintaxis del propio fichero; no tocamos package.json de web/ por esto.)

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Encoder, Profile } from '@garmin/fitsdk';
import type {
  ActivityMesg,
  Encodable,
  FileIdMesg,
  LapMesg,
  RecordMesg,
  SessionMesg,
  Types,
} from '@garmin/fitsdk';

const OUT_DIR = dirname(fileURLToPath(import.meta.url));

const SEMICIRCLE_PER_DEGREE = 2 ** 31 / 180;
function toSemicircles(deg: number): number {
  return Math.round(deg * SEMICIRCLE_PER_DEGREE);
}

// ── Tipos de entrada de alto nivel (lo que un reloj real reportaría) ────────

interface RecordSpec {
  at: Date;
  hr?: number;
  lat?: number;
  lon?: number;
}

interface LapSpec {
  startedAt: Date;
  endedAt: Date;
  distanceM: number;
  intensity: Types.Intensity;
  avgHr?: number;
  avgSpeedMs?: number;
  /** Cadencia cruda tal como la manda el reloj: zancadas de UNA pierna/min. */
  avgCadenceOneLeg?: number;
  avgFractionalCadence?: number;
}

interface SessionSpec {
  sport: Types.Sport;
  subSport?: Types.SubSport;
  startedAt: Date;
  endedAt: Date;
  totalTimerTimeS: number;
  totalDistanceM: number;
  avgHr?: number;
  maxHr?: number;
  calories?: number;
  totalAscent?: number;
  totalDescent?: number;
  laps: LapSpec[];
  records: RecordSpec[];
}

// ── Ensamblado FIT ───────────────────────────────────────────────────────────

/**
 * Un fichero FIT de actividad real escribe, por cada tramo de deporte, sus
 * records y laps y CIERRA con el mensaje session — en ese orden. Un fichero
 * multideporte repite el bloque por cada sport. Termina con un mensaje
 * `activity` que resume el fichero entero (no lo lee nuestro parser, pero sin
 * él el fichero no es un Activity FIT válido de verdad).
 */
function buildFitBytes(sessions: SessionSpec[], opts: { serialNumber?: number } = {}): Uint8Array {
  const encoder = new Encoder();
  const createdAt = sessions[0]!.startedAt;

  const fileId: Encodable<FileIdMesg> = {
    mesgNum: Profile.MesgNum.FILE_ID,
    type: 'activity',
    manufacturer: 'garmin',
    product: 0,
    serialNumber: opts.serialNumber,
    timeCreated: createdAt,
  };
  encoder.writeMesg(fileId);

  for (const session of sessions) {
    for (const record of session.records) {
      const mesg: Encodable<RecordMesg> = {
        mesgNum: Profile.MesgNum.RECORD,
        timestamp: record.at,
        heartRate: record.hr,
        positionLat: record.lat !== undefined ? toSemicircles(record.lat) : undefined,
        positionLong: record.lon !== undefined ? toSemicircles(record.lon) : undefined,
      };
      encoder.writeMesg(mesg);
    }

    for (const lap of session.laps) {
      const mesg: Encodable<LapMesg> = {
        mesgNum: Profile.MesgNum.LAP,
        timestamp: lap.endedAt,
        startTime: lap.startedAt,
        totalElapsedTime: (lap.endedAt.getTime() - lap.startedAt.getTime()) / 1000,
        totalTimerTime: (lap.endedAt.getTime() - lap.startedAt.getTime()) / 1000,
        totalDistance: lap.distanceM,
        sport: session.sport,
        intensity: lap.intensity,
        avgHeartRate: lap.avgHr,
        avgSpeed: lap.avgSpeedMs,
        avgCadence: lap.avgCadenceOneLeg,
        avgFractionalCadence: lap.avgFractionalCadence,
      };
      encoder.writeMesg(mesg);
    }

    const sessionMesg: Encodable<SessionMesg> = {
      mesgNum: Profile.MesgNum.SESSION,
      timestamp: session.endedAt,
      startTime: session.startedAt,
      sport: session.sport,
      subSport: session.subSport,
      totalElapsedTime: session.totalTimerTimeS,
      totalTimerTime: session.totalTimerTimeS,
      totalDistance: session.totalDistanceM,
      avgHeartRate: session.avgHr,
      maxHeartRate: session.maxHr,
      totalCalories: session.calories,
      totalAscent: session.totalAscent,
      totalDescent: session.totalDescent,
      firstLapIndex: 0,
      numLaps: session.laps.length,
    };
    encoder.writeMesg(sessionMesg);
  }

  const last = sessions[sessions.length - 1]!;
  const activityMesg: Encodable<ActivityMesg> = {
    mesgNum: Profile.MesgNum.ACTIVITY,
    timestamp: last.endedAt,
    totalTimerTime: sessions.reduce((sum, s) => sum + s.totalTimerTimeS, 0),
    numSessions: sessions.length,
    type: 'manual',
    event: 'activity',
    eventType: 'stop',
  };
  encoder.writeMesg(activityMesg);

  return encoder.close();
}

function write(name: string, bytes: Uint8Array): void {
  writeFileSync(join(OUT_DIR, name), bytes);
  console.log(`${name} — ${bytes.length} bytes`);
}

// ── (a) Carrera continua, 3 laps automáticos por km ─────────────────────────
// Ritmo constante 5:00/km. Cadencia y fracción DISTINTAS por lap para que el
// test pueda distinguir cada lap por su spm esperado.

{
  const start = new Date('2026-06-01T06:00:00Z');
  const lapBounds = [0, 300, 600, 900]; // s desde el inicio: 3 laps de 5'/1km
  const laps: LapSpec[] = [
    { s: 0, hr: 150, cad: 85, frac: 0.4 },
    { s: 1, hr: 155, cad: 86, frac: 0.1 },
    { s: 2, hr: 160, cad: 87, frac: 0.6 },
  ].map(({ s, hr, cad, frac }) => ({
    startedAt: new Date(start.getTime() + lapBounds[s]! * 1000),
    endedAt: new Date(start.getTime() + lapBounds[s + 1]! * 1000),
    distanceM: 1000,
    intensity: 'active',
    avgHr: hr,
    avgSpeedMs: 1000 / 300, // 5:00/km
    avgCadenceOneLeg: cad,
    avgFractionalCadence: frac,
  }));

  const records: RecordSpec[] = [0, 150, 300, 450, 600, 750, 900].map((s, i) => ({
    at: new Date(start.getTime() + s * 1000),
    hr: 140 + i * 5,
    lat: 41.4 + i * 0.0005,
    lon: 2.15 + i * 0.0007,
  }));

  const bytes = buildFitBytes(
    [
      {
        sport: 'running',
        subSport: 'trail',
        startedAt: start,
        endedAt: new Date(start.getTime() + 900_000),
        totalTimerTimeS: 900,
        totalDistanceM: 3000,
        avgHr: 155,
        maxHr: 165,
        calories: 250,
        totalAscent: 20,
        totalDescent: 15,
        laps,
        records,
      },
    ],
    { serialNumber: 987654321 },
  );
  write('continuous-run.fit', bytes);
}

// ── (b) Series: calentamiento + 4×(activo/rest) + vuelta a la calma ─────────
// Sin cadencia (reloj sin sensor) y sin GPS (pista indoor) — para probar el
// null honesto de run_cadence_spm y una route vacía en modalidad run.

{
  const start = new Date('2026-06-02T07:00:00Z');
  let t = start.getTime();
  const laps: LapSpec[] = [];
  const push = (durationS: number, intensity: Types.Intensity, distanceM: number) => {
    const startedAt = new Date(t);
    t += durationS * 1000;
    laps.push({ startedAt, endedAt: new Date(t), distanceM, intensity, avgHr: 150 });
  };
  push(600, 'warmup', 1200);
  for (let i = 0; i < 4; i++) {
    push(90, 'active', 400);
    push(60, 'rest', 200);
  }
  push(600, 'cooldown', 1200);
  const end = new Date(t);

  const records: RecordSpec[] = [0, 900, 1800].map((s) => ({
    at: new Date(start.getTime() + s * 1000),
    hr: 145,
  }));

  const bytes = buildFitBytes(
    [
      {
        sport: 'running',
        subSport: 'track',
        startedAt: start,
        endedAt: end,
        totalTimerTimeS: (end.getTime() - start.getTime()) / 1000,
        totalDistanceM: laps.reduce((sum, l) => sum + l.distanceM, 0),
        avgHr: 150,
        maxHr: 170,
        laps,
        records,
      },
    ],
    { serialNumber: 555000111 },
  );
  write('series-laps.fit', bytes);
}

// ── (c) Paseo — modalidad 'other' + lap-espejo + sin serial (sha1 fallback) ──

{
  const start = new Date('2026-06-03T09:00:00Z');
  const end = new Date(start.getTime() + 2400_000); // 40'

  const records: RecordSpec[] = [0, 600, 1200, 1800, 2400].map((s, i) => ({
    at: new Date(start.getTime() + s * 1000),
    hr: 100 + i * 2,
    lat: 41.39 + i * 0.0003,
    lon: 2.16 + i * 0.0004,
  }));

  const bytes = buildFitBytes([
    {
      sport: 'walking',
      subSport: 'casualWalking',
      startedAt: start,
      endedAt: end,
      totalTimerTimeS: 2400,
      totalDistanceM: 3200,
      avgHr: 108,
      maxHr: 115,
      laps: [
        {
          // El lap-espejo: cubre EXACTAMENTE la ventana de la session entera.
          startedAt: start,
          endedAt: end,
          distanceM: 3200,
          intensity: 'active',
          avgHr: 108,
        },
      ],
      records,
    },
    // (sin serialNumber: opts se omite → sha1(bytes) en el source_ref)
  ]);
  write('walking-mirror-lap.fit', bytes);
}

// ── (d) Multideporte: correr + bici, dos sessions en el mismo fichero ───────

{
  const runStart = new Date('2026-06-04T07:00:00Z');
  const runEnd = new Date(runStart.getTime() + 1200_000); // 20'
  const bikeStart = new Date('2026-06-04T07:22:00Z'); // 2' de transición
  const bikeEnd = new Date(bikeStart.getTime() + 1800_000); // 30'

  const runRecords: RecordSpec[] = [0, 600, 1200].map((s, i) => ({
    at: new Date(runStart.getTime() + s * 1000),
    hr: 140 + i * 10,
    lat: 41.4 + i * 0.001,
    lon: 2.15 + i * 0.001,
  }));
  const bikeRecords: RecordSpec[] = [0, 900, 1800].map((s, i) => ({
    at: new Date(bikeStart.getTime() + s * 1000),
    hr: 130 + i * 5,
    lat: 41.42 + i * 0.002,
    lon: 2.17 + i * 0.002,
  }));

  const bytes = buildFitBytes(
    [
      {
        sport: 'running',
        subSport: 'street',
        startedAt: runStart,
        endedAt: runEnd,
        totalTimerTimeS: 1200,
        totalDistanceM: 4000,
        avgHr: 150,
        maxHr: 160,
        laps: [{ startedAt: runStart, endedAt: runEnd, distanceM: 4000, intensity: 'active', avgHr: 150 }],
        records: runRecords,
      },
      {
        sport: 'cycling',
        subSport: 'road',
        startedAt: bikeStart,
        endedAt: bikeEnd,
        totalTimerTimeS: 1800,
        totalDistanceM: 15000,
        avgHr: 135,
        maxHr: 145,
        laps: [
          { startedAt: bikeStart, endedAt: new Date(bikeStart.getTime() + 900_000), distanceM: 7500, intensity: 'active', avgHr: 133 },
          { startedAt: new Date(bikeStart.getTime() + 900_000), endedAt: bikeEnd, distanceM: 7500, intensity: 'active', avgHr: 137 },
        ],
        records: bikeRecords,
      },
    ],
    { serialNumber: 424242424 },
  );
  write('multisport-run-bike.fit', bytes);
}

// ── (e) Corrupto: el mismo fichero (a), cortado a media transmisión ─────────
// Trunca dentro del bloque de records, antes de que se escriba ningún mensaje
// lap/session — el decoder llega a un fin de stream inesperado (error
// capturado, no excepción) y no queda ninguna session que rescatar.

{
  const full = buildFitBytes(
    [
      {
        sport: 'running',
        startedAt: new Date('2026-06-01T06:00:00Z'),
        endedAt: new Date('2026-06-01T06:15:00Z'),
        totalTimerTimeS: 900,
        totalDistanceM: 3000,
        laps: [{ startedAt: new Date('2026-06-01T06:00:00Z'), endedAt: new Date('2026-06-01T06:15:00Z'), distanceM: 3000, intensity: 'active' }],
        records: [0, 150, 300, 450, 600, 750, 900].map((s) => ({ at: new Date(new Date('2026-06-01T06:00:00Z').getTime() + s * 1000), hr: 140 })),
      },
    ],
    { serialNumber: 1 },
  );
  const truncated = full.slice(0, Math.floor(full.length * 0.4));
  write('truncated.fit', truncated);
}
