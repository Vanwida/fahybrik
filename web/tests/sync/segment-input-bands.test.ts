/**
 * UNA LECTURA RARA DE UN SENSOR NO PUEDE TIRAR EL ENTRENO ENTERO (card 117).
 *
 * Zod no rechaza un campo: rechaza la PETICIÓN. Con las bandas puestas en el
 * esquema de entrada, un pico de 300 ppm al despegarse la cinta del pecho —o una
 * pendiente negativa, que es lo que manda el estándar FTMS cuesta abajo— devolvía
 * 400 y los 47 minutos del atleta no se guardaban en ningún sitio.
 *
 * La política, que ya existía escrita para la cadencia y la pendiente y ahora vale
 * para todo lo que mide un aparato: la entrada NO rechaza; el valor se encaja en la
 * banda que la base sabe guardar y, si no cabe, se guarda un hueco. Un dato
 * imposible cuesta su propio campo, nunca la sesión.
 *
 * Puro: sin base de datos. Corre siempre, también en CI sin rama de Neon.
 */
import { expect, test } from 'vitest';
import {
  sanitizeConfidence,
  sanitizeHrBpm,
  sanitizeInclinePct,
  sanitizeRunCadenceSpm,
  segmentInputSchema,
} from '@/lib/sync/ingest-execution-segments';

/** Un tramo de correr mínimo y válido, al que cada test le enchufa su rareza. */
function runSegment(extra: Record<string, unknown> = {}) {
  return {
    position: 0,
    modality: 'run',
    duration_seconds: 362,
    distance_meters: 1000,
    source: 'treadmill',
    ...extra,
  };
}

test('un pico de pulso imposible ya no rechaza el envío; se guarda como hueco', () => {
  // ANTES: `avg_hr: z.number().int().min(30).max(260)` → 400 y sesión perdida.
  expect(segmentInputSchema.safeParse(runSegment({ avg_hr: 300 })).success).toBe(true);
  expect(sanitizeHrBpm(300)).toBeNull();
  // Y un cero tampoco es un pulso: es la ausencia de medida.
  expect(segmentInputSchema.safeParse(runSegment({ avg_hr: 0 })).success).toBe(true);
  expect(sanitizeHrBpm(0)).toBeNull();
});

test('un pulso real sigue guardándose tal cual', () => {
  expect(sanitizeHrBpm(119)).toBe(119);
  expect(sanitizeHrBpm(30)).toBe(30);
  expect(sanitizeHrBpm(260)).toBe(260);
  // La columna es entera: un decimal se redondea, no se rechaza.
  expect(sanitizeHrBpm(148.6)).toBe(149);
});

test('una cinta cuesta abajo manda pendiente negativa y ya no tumba el envío', () => {
  // El grado FTMS viaja como entero CON SIGNO, así que una bajada llega negativa.
  expect(segmentInputSchema.safeParse(runSegment({ incline_pct: -2.5 })).success).toBe(true);
  expect(sanitizeInclinePct(-2.5)).toBeNull();
  expect(sanitizeInclinePct(6.5)).toBe(6.5);
});

test('una cadencia de paseo se queda en hueco, no en 400', () => {
  expect(segmentInputSchema.safeParse(runSegment({ run_cadence_spm: 12 })).success).toBe(true);
  expect(sanitizeRunCadenceSpm(12)).toBeNull();
  expect(sanitizeRunCadenceSpm(178)).toBe(178);
});

test('una confianza fuera de 0…1 cuesta su campo, no la sesión', () => {
  expect(
    segmentInputSchema.safeParse(runSegment({ sensor_timing_confidence: 1.0000001 })).success,
  ).toBe(true);
  expect(sanitizeConfidence(1.0000001)).toBeNull();
  expect(sanitizeConfidence(-0.1)).toBeNull();
  expect(sanitizeConfidence(0.62)).toBe(0.62);
});

test('lo que NO es medida de aparato sigue siendo estricto', () => {
  // La posición y la modalidad las pone nuestro propio cliente: un valor imposible
  // ahí es un fallo nuestro y tiene que chillar, no convertirse en un hueco.
  expect(segmentInputSchema.safeParse(runSegment({ position: -1 })).success).toBe(false);
  expect(segmentInputSchema.safeParse(runSegment({ modality: '' })).success).toBe(false);
});

test('el caso completo: un tramo con TRES lecturas imposibles a la vez entra igual', () => {
  const parsed = segmentInputSchema.safeParse(
    runSegment({ avg_hr: 0, max_hr: 999, incline_pct: -4, run_cadence_spm: 8 }),
  );
  expect(parsed.success).toBe(true);
  // Y cada una se guarda como lo que es: nada, en vez de un número inventado.
  expect(sanitizeHrBpm(0)).toBeNull();
  expect(sanitizeHrBpm(999)).toBeNull();
  expect(sanitizeInclinePct(-4)).toBeNull();
  expect(sanitizeRunCadenceSpm(8)).toBeNull();
});
