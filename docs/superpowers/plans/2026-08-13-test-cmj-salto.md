# Test de salto (CMJ) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Copia versionada: este fichero.

> **Enmienda (Alex, al aprobar):** el test SOLO existe a request del coach, desde el plan o el panel. El atleta lo ve en su app con briefing de verdad (trípode, carga, secuencia) ANTES de grabar. La Task 10 (marca a demanda) queda fuera de v1.


**Goal:** El atleta mide un CMJ (y el CMJ con carga) con la cámara lenta del iPhone; el resultado entra en la misma tubería de tests que el 2K, no calibra zonas, y el coach lo lee en la ficha.

**Architecture:** Es un test, no un entreno y no un dispositivo. El número canónico es altura en cm, derivada de tiempo de vuelo (`h = g·t²/8`). La captura es una pantalla llena propia (no `WorkoutContainer`). El puente de resultados gana un event kind `jump`; si cae al `else` de hoy, 47 cm se guarda como 47 segundos. Los baremos y la carga por defecto son método del coach; la física es mecanismo.

**Tech Stack:** TypeScript shared domain, Zod, Neon (migración aditiva), Next.js coach/athlete APIs, SwiftUI + AVFoundation 240 fps + Vision (marcar despegue/aterrizaje).

## Global Constraints

- Multi-coach: cero nombres propios en código. WCSE/Pablo son el *defecto* editable, nunca un `const` de producto.
- No calibra. `derives: 'none'`. No entra en el 0/4 de semana 1 (`week_offset: null`).
- No reutilizar `measure: 'time'` / `unit: 'seconds'` para el vuelo: hoy eso es un contrarreloj (mm:ss, menor es mejor).
- No lanzar el salto por `WorkoutContainer` (reloj, HRR, segmentos, GPS).
- Una puerta de entrada: hub de tests. Cero botones en Dispositivos / Perfil / Salud.
- Precisión honesta: se guarda el cm con decimales; se muestra **47 cm ± 1**, no 47,33 como verdad.
- Fuente real contra la que se rompe el modelo: informe WCSE ago-2026 (CMJ 47,33 / +15 kg 39,38 / 76 kg / LRI 0,85) + audio del coach (máxima intención concéntrica).
- iOS no sale por Vercel: hay que instalar en el dispositivo. El doble (`test-salto`) se actualiza en el mismo lote que Swift.
- Commits pequeños, rutas explícitas, nunca `git add -A`. Actualizar `FOCUS.md` y `docs/DECISIONS.md` en el commit de cierre.

---

## Modelo (lo que hay que construir, no el caso de delante)

Un test de salto es una **medición**. No es una prescripción de trabajo.

```
sesión
  × kinds[]          cmj | cmj_free_arms | sj | dj | loaded_cmj   (v1 ejecuta cmj + loaded_cmj)
  × load             none | { kg } | { pct_bw }
  × arms             hips | free
  × attempts         n (defecto 3)
  × keep             best | mean_best_2
  × rest_s           entre intentos
  × body_mass_kg     snapshot al medir (athletes.weight_kg; si falta, se pide)
  × por intento      takeoff_frame, landing_frame, fps, quality
  → por intento      flight_time_s, height_cm, takeoff_velocity_ms
  → por sesión       altura agregada por kind + (si hay par cargado) derivados del método
```

**Mecanismo (código, no se edita):**

```
t = (landing − takeoff) / fps
h = g · t² / 8                 // g = 9.81; asume misma altura de cadera al salir y al entrar
v = g · t / 2
despegue = último frame con CUALQUIER pie en suelo
aterrizaje = primer frame con CUALQUIER pie en suelo
```

**Método (dato del coach, defecto = el informe WCSE):**

- carga por defecto del CMJ cargado (15 kg o % peso)
- intentos, regla de agregación, manos en cadera
- bandas de altura y de LRI
- el índice LRI = (caída relativa) / (carga relativa). Otro coach puede no usarlo; el par crudo (h0, hL, load, bw) se guarda siempre.

**Qué no es este test:** no produce fuerza, RFD, RSI, asimetría. Sin platillo no se inventa.

**Capture mode (data-driven):** si algún `store_results[].measure === 'height'` → la app abre cámara, no el vivo. El coach no elige un flag.

### Contra qué casos reales se rompe (todos entran, cero texto libre)

| # | Caso | Cómo entra |
|---|---|---|
| 1 | Informe WCSE: 47,33 / 39,38 / +15 kg / 76 kg / LRI 0,85 | Un test, dos `store_results` de altura; LRI se deriva |
| 2 | Audio del coach: máxima intención concéntrica | Copia de captura, no un campo |
| 3 | Solo CMJ, no hay barra | Segunda serie se omite; LRI queda `null` |
| 4 | Sin peso en ficha | Se pide el peso antes de la serie cargada; el CMJ libre se puede hacer |
| 5 | Vídeo a 120 fps | Se mide; incertidumbre ~1,2 cm; quality `low_fps` |
| 6 | Un pie aterriza antes | Primer contacto; quality `staggered` |
| 7 | Aterrizan más flexionados | La fórmula infla; no se detecta sin LiDAR; el atleta confirma frames |
| 8 | Hop antes del salto | Revisión de frames; se descarta el intento |
| 9 | Coach programa el test | `apply` igual que el 2K; no va a semana 1 |
| 10 | Atleta se prueba solo | Marca `cmj` (solo sin carga), `source: athlete_test`, no calibra |
| 11 | Repite a los 3 meses | Misma slug, histórico, delta hacia arriba |
| 12 | Otro coach, otros cortes | `coach_jump_method`; el defecto es WCSE, no un `const` |

### Dónde puede fallar

- El `else` de `recordBatteryResults` escribe `kind: 'timetrial'` / `seconds`. **47 cm → "0:47" y menor es mejor.** Es el bug que este plan existe para no crear.
- Meterlo en el 0/4 de calibración.
- Usar `time`/`seconds` para el vuelo.
- Dos CTAs (Continuar / Detener / Abrir Salud). Una pantalla, una línea de tiempo.
- Hardcodear bandas WCSE.
- Enseñar 47,33 como si hubiera platillo.
- Lanzar `WorkoutContainer` (le cuelga HRR, reloj, segmentos).

---

## File map

**Crear**

| Path | Responsabilidad |
|---|---|
| `shared/domain/jump/physics.ts` | `flightTime`, `heightFromFlightTime`, `takeoffVelocity`, `uncertaintyCm` |
| `shared/domain/jump/session.ts` | kinds, load, aggregate, quality, snapshot de sesión |
| `shared/domain/jump/method.ts` | LRI + bandas. Defecto WCSE. Puro. |
| `shared/domain/jump/protocol.ts` | Protocolo v1 (`cmj_profile`) y captura `jump_video` |
| `web/tests/jump/physics.test.ts` | Física + caso WCSE |
| `web/tests/jump/method.test.ts` | LRI, bandas, sin peso, sin carga |
| `web/tests/jump/bridge.test.ts` | El puente no guarda cm como segundos |
| `infra/migrations/0192_jump_test.sql` | CHECKs + `jump_attempts` + `coach_jump_method` |
| `ios/FAHYBRIK/Jump/JumpPhysics.swift` | Misma física (números bit-idénticos a 2 decimales) |
| `ios/FAHYBRIK/Jump/JumpRecorder.swift` | AVFoundation 240 fps |
| `ios/FAHYBRIK/Jump/JumpFrameMarker.swift` | Vision → candidatos de frame |
| `ios/FAHYBRIK/Jump/JumpCaptureView.swift` | Setup → grabar → scrub → siguiente kind → listo |
| `ios/FAHYBRIKTests/Jump/JumpPhysicsTests.swift` | Paridad con TS |
| `web/components/design-twin/screens/test-salto/` | Propuesta del doble |

**Modificar (puntos de carga)**

| Path | Qué |
|---|---|
| `shared/schema/test-battery.ts` | `height` + `cm` |
| `shared/domain/coach/benchmark-slugs.ts` | `cmj`, `cmj_loaded` + unit `cm` + metric `height` |
| `shared/domain/athlete/record-test-result.ts` | `kind: 'jump'` |
| `web/lib/coach/test-battery-bridge.ts` | rama `measure === 'height'` **antes** del else |
| `shared/domain/coach/test-battery.ts` | protocolo `cmj_profile`, `week_offset: null`, `BASELINE_MEASURE_UNITS` |
| `shared/domain/coach/test-catalog.ts` | familia `saltos` |
| `shared/domain/athlete/marks.ts` | marca `cmj`, `measured_by: 'jump'` |
| `ios/FAHYBRIK/Tests/TestsHubView.swift` | si `capture == jump_video` → `JumpCaptureView` |
| `ios/FAHYBRIK/Tests/TestResultCaptureSheet.swift` | `TestMeasure.height` → cm |
| `ios/FAHYBRIK/Tests/BenchmarkDelta.swift` | unit `cm`, higher is better |
| `ios` Info.plist (fuente, no generated a mano si hay otra) | cámara: sumar tests de salto |
| `docs/DECISIONS.md`, `FOCUS.md` | decisión + estado |

**Fuera de v1 (el modelo los reserva, no se construyen)**

- SJ, DJ, RSI, brazos libres como tests propios
- LiDAR / ARKit como segundo canal
- Subida del vídeo al servidor
- App / App Clip aparte
- Informe-póster estilo WCSE (el resultado usa el chrome de `TestResultDoneView` + LRI)

---

### Task 1: Física y sesión — módulo puro

**Files:**
- Create: `shared/domain/jump/physics.ts`
- Create: `shared/domain/jump/session.ts`
- Create: `web/tests/jump/physics.test.ts`

**Interfaces:**

```ts
export const JUMP_G = 9.81; // m/s² — mecanismo, no método

export function flightTimeSeconds(takeoffFrame: number, landingFrame: number, fps: number): number;
export function heightMeters(flightTimeS: number, g?: number): number;
export function heightCm(flightTimeS: number, g?: number): number;
export function takeoffVelocityMs(flightTimeS: number, g?: number): number;
export function uncertaintyCm(fps: number, g?: number): number; // 1 frame de error

export type JumpKind = 'cmj' | 'cmj_free_arms' | 'sj' | 'dj' | 'loaded_cmj';
export type JumpLoad = { kind: 'none' } | { kind: 'kg'; kg: number } | { kind: 'pct_bw'; pct: number };
export type JumpKeep = 'best' | 'mean_best_2';
export type JumpQuality = 'ok' | 'staggered' | 'low_fps' | 'discarded';

export interface JumpAttempt {
  kind: JumpKind;
  takeoff_frame: number;
  landing_frame: number;
  fps: number;
  load: JumpLoad;
  quality: JumpQuality;
}

export function resolveAttempt(a: JumpAttempt): {
  flight_time_s: number;
  height_cm: number;
  takeoff_velocity_ms: number;
} | null; // null si discarded o frames ilegales

export function aggregateHeights(heightsCm: number[], keep: JumpKeep): number | null;
```

- [ ] **Step 1: Test que falla** — `web/tests/jump/physics.test.ts`

```ts
import { describe, expect, test } from 'vitest';
import { flightTimeSeconds, heightCm, takeoffVelocityMs, uncertaintyCm, JUMP_G } from '../../shared/domain/jump/physics';
import { aggregateHeights, resolveAttempt } from '../../shared/domain/jump/session';

test('vuelo 149 frames a 240 fps → ~47.3 cm', () => {
  const t = flightTimeSeconds(100, 249, 240);
  expect(t).toBeCloseTo(149 / 240, 6);
  expect(heightCm(t)).toBeCloseTo(((JUMP_G * t * t) / 8) * 100, 6);
});

test('un frame a 240 fps vale ~0.6 cm alrededor de 47', () => {
  expect(uncertaintyCm(240)).toBeGreaterThan(0.5);
  expect(uncertaintyCm(240)).toBeLessThan(0.8);
});

test('120 fps duplica la incertidumbre', () => {
  expect(uncertaintyCm(120)).toBeCloseTo(uncertaintyCm(240) * 2, 2);
});

test('frames invertidos o fps 0 no producen altura', () => {
  expect(resolveAttempt({
    kind: 'cmj', takeoff_frame: 10, landing_frame: 10, fps: 240,
    load: { kind: 'none' }, quality: 'ok',
  })).toBeNull();
});

test('keep best y mean_best_2', () => {
  expect(aggregateHeights([40, 47.33, 46], 'best')).toBeCloseTo(47.33, 2);
  expect(aggregateHeights([40, 47.33, 46], 'mean_best_2')).toBeCloseTo((47.33 + 46) / 2, 2);
});
```

- [ ] **Step 2:** `cd web && pnpm exec vitest run tests/jump/physics.test.ts` — FAIL (módulo no existe)
- [ ] **Step 3:** implementar `physics.ts` + `session.ts`. `heightMeters = g * t² / 8`. Rechazar `landing <= takeoff`, `fps <= 0`, `quality === 'discarded'`.
- [ ] **Step 4:** vitest PASS
- [ ] **Step 5:** Commit `feat(jump): física de tiempo de vuelo y agregación de intentos`

---

### Task 2: Método del coach (LRI + bandas) — puro

**Files:**
- Create: `shared/domain/jump/method.ts`
- Create: `web/tests/jump/method.test.ts`

**Interfaces:**

```ts
export interface JumpMethod {
  default_load: JumpLoad;          // defecto { kind: 'kg', kg: 15 }
  attempts: number;                // 3
  keep: JumpKeep;                  // 'best'
  rest_s: number;                  // 45
  arms: 'hips' | 'free';           // 'hips'
  height_bands_cm: { max: number | null; level: 1|2|3|4|5 }[];
  lri_bands: { max: number | null; level: 1|2|3|4|5; label: string }[];
}

export const DEFAULT_JUMP_METHOD: JumpMethod; // cortes del informe WCSE

export interface LoadResponse {
  drop_abs_cm: number;
  drop_rel: number;       // 0.168
  load_rel: number;       // 0.1974
  lri: number;            // 0.85
}

export function loadResponse(
  unloadedCm: number,
  loadedCm: number,
  loadKg: number,
  bodyMassKg: number,
): LoadResponse | null; // null si bw<=0, load<=0, unloaded<=0

export function heightLevel(cm: number, method: JumpMethod): 1|2|3|4|5;
export function lriLevel(lri: number, method: JumpMethod): 1|2|3|4|5;
```

Defectos (método, no `const` de producto — viven en `DEFAULT_JUMP_METHOD` para que un coach que no toca nada vea lo mismo que el informe):

```
altura:  <30 →1 · 30–35 →2 · 35–40 →3 · 40–45 →4 · >45 →5
LRI:     ≤0.45 →5 · 0.45–0.70 →4 · 0.70–0.90 →3 · 0.90–1.20 →2 · >1.20 →1
```

- [ ] **Step 1: Test del caso WCSE**

```ts
test('informe ago-2026', () => {
  const r = loadResponse(47.33, 39.38, 15, 76);
  expect(r).not.toBeNull();
  expect(r!.drop_abs_cm).toBeCloseTo(7.95, 2);
  expect(r!.drop_rel).toBeCloseTo(0.168, 3);
  expect(r!.load_rel).toBeCloseTo(0.1974, 3);
  expect(r!.lri).toBeCloseTo(0.85, 2);
  expect(heightLevel(47.33, DEFAULT_JUMP_METHOD)).toBe(5);
  expect(lriLevel(r!.lri, DEFAULT_JUMP_METHOD)).toBe(3);
});

test('sin peso o sin carga no hay LRI', () => {
  expect(loadResponse(47, 39, 15, 0)).toBeNull();
  expect(loadResponse(47, 39, 0, 76)).toBeNull();
});
```

- [ ] **Step 2:** vitest FAIL
- [ ] **Step 3:** implementar. LRI = `(drop_rel) / (load_rel)` con `drop_rel = (h0-hL)/h0`, `load_rel = loadKg/bodyMassKg`.
- [ ] **Step 4:** PASS
- [ ] **Step 5:** Commit `feat(jump): LRI y baremos como método, defecto editable`

---

### Task 3: Contrato `height` / `cm` + slugs

**Files:**
- Modify: `shared/schema/test-battery.ts` — añadir `'height'` a `STORE_RESULT_MEASURES`, `'cm'` a `STORE_RESULT_UNITS`. `height` **no** entra en `CALIBRATING_MEASURES`. El refine existente ya impide `derives !== 'none'`.
- Modify: `shared/domain/coach/benchmark-slugs.ts`

```ts
export const BENCH_CMJ = 'cmj';
export const BENCH_CMJ_LOADED = 'cmj_loaded';
export const BENCHMARK_UNIT_CM = 'cm';
```

`benchmarkMetric('cm')` → `'height'`. `benchmarkLowerIsBetter('cm')` sigue `false` (solo `seconds` es menor-mejor). Labels: `'CMJ'`, `'CMJ con carga'`.

- Modify: `shared/domain/coach/test-derive.ts` — `MEASURE_LABEL.height = 'la altura'`.
- Modify: `shared/domain/coach/test-battery.ts` — `BASELINE_MEASURE_UNITS` gana `{ measure: 'height', unit: 'cm', label: 'Altura de salto' }`.
- Modify: iOS `TestMeasure` + `BenchmarkDelta` en la misma tarea (si no, el teléfono pinta `.other` sin "cm").
- Modify: `web/components/v2/tests/draft.ts` `unitForMeasure` — case `height: return 'cm'`.

- [ ] **Step 1:** test de schema

```ts
test('height/cm es baseline y no puede calibrar', () => {
  const ok = storeResultSpecSchema.parse({
    slug: 'cmj', unit: 'cm', measure: 'height', derives: 'none', label: 'CMJ',
  });
  expect(ok.measure).toBe('height');
  expect(() => storeResultSpecSchema.parse({
    slug: 'cmj', unit: 'cm', measure: 'height', derives: 'run_zones', label: 'CMJ',
  })).toThrow();
});
```

- [ ] **Step 2–4:** implementar + PASS
- [ ] **Step 5:** Commit `feat(jump): measure height / unit cm en el contrato de tests`

---

### Task 4: Event `jump` + puente (el que evita el 0:47)

**Files:**
- Modify: `shared/domain/athlete/record-test-result.ts`
- Modify: `web/lib/coach/test-battery-bridge.ts` (la cadena `if load / else if hrr / else if hr / else`)
- Create: `web/tests/jump/bridge.test.ts`

**Interfaces:**

```ts
export interface JumpTestEvent {
  kind: 'jump';
  athlete_id: number;
  exercise_slug: string; // cmj | cmj_loaded
  height_cm: number;
  source: TestSource;
}
// TestEvent |= JumpTestEvent
// benchmarkForTestEvent(jump) → { exercise_slug, value: height_cm, unit: BENCHMARK_UNIT_CM }
```

En el puente, **antes del else**:

```ts
} else if (spec.measure === 'height') {
  await recordTestBenchmark(sql, {
    kind: 'jump',
    athlete_id,
    exercise_slug: spec.slug,
    height_cm: e.value,
    source,
  });
} else {
  // time-trial…
}
```

- [ ] **Step 1:**

```ts
test('jump event writes cm, not seconds', () => {
  const row = benchmarkForTestEvent({
    kind: 'jump', athlete_id: 64, exercise_slug: 'cmj', height_cm: 47.33, source: 'athlete_test',
  });
  expect(row).toEqual({ exercise_slug: 'cmj', value: 47.33, unit: 'cm' });
});
```

Más un test de regresión: un `run_5k` sigue yendo a `timetrial`/`seconds`. Si hay test de integración del puente, POST `{slug:'cmj', value:47.33}` con spec height/cm y afirmar `athlete_benchmarks.unit === 'cm'`.

- [ ] **Step 2–4:** implementar + PASS
- [ ] **Step 5:** Commit `fix(tests): altura de salto no se guarda como segundos`

---

### Task 5: Migración — CHECKs, intentos, método

**Files:**
- Create: `infra/migrations/0192_jump_test.sql`

El runner corta por `;`. Cero `;` en comentarios.

```sql
-- 0192 — Test de salto: el contrato gana height/cm, y el intento crudo
-- (frames, fps, carga, peso) vive aparte del benchmark agregado.

alter table coach_test_results drop constraint if exists coach_test_results_measure_check;
alter table coach_test_results add constraint coach_test_results_measure_check
  check (measure in ('time','distance','reps','calories','load','hrr','hr','height'));

alter table coach_test_results drop constraint if exists coach_test_results_unit_check;
alter table coach_test_results add constraint coach_test_results_unit_check
  check (unit in ('seconds','meters','reps','calories','kg','bpm','cm'));

create table if not exists jump_attempts (
  id                bigint generated always as identity primary key,
  athlete_id        bigint not null references athletes(id) on delete cascade,
  assignment_id     bigint references workout_assignments(id) on delete set null,
  kind              text not null check (kind in ('cmj','cmj_free_arms','sj','dj','loaded_cmj')),
  load_kg           numeric(6,2),
  body_mass_kg      numeric(5,2),
  takeoff_frame     integer not null,
  landing_frame     integer not null,
  fps               numeric(6,2) not null,
  flight_time_s     numeric(8,5) not null,
  height_cm         numeric(6,2) not null,
  quality           text not null check (quality in ('ok','staggered','low_fps','discarded')),
  kept              boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists jump_attempts_athlete_created_idx
  on jump_attempts (athlete_id, created_at desc);

create table if not exists coach_jump_method (
  id                 bigint generated always as identity primary key,
  coach_id           bigint not null unique references coaches(id) on delete cascade,
  default_load_kg    numeric(5,2) not null,
  attempts           smallint not null,
  keep               text not null check (keep in ('best','mean_best_2')),
  rest_s             smallint not null,
  arms               text not null check (arms in ('hips','free')),
  height_bands_json  jsonb not null,
  lri_bands_json     jsonb not null,
  updated_at         timestamptz not null default now()
);
```

Columnas explícitas. `height_bands_json` / `lri_bands_json` son el único JSON: son vectores de cortes. El default NO se pone en el SQL; se escribe desde `DEFAULT_JUMP_METHOD` al crear la fila (como `coach_analytics_method`).

- [ ] **Step 1:** aplicar en Neon de desarrollo / branch, no en prod a ciegas.
- [ ] **Step 2:** verificar CHECKs: insertar `measure='height'` ok; `measure='vert'` falla.
- [ ] **Step 3:** Commit `feat(db): height/cm + jump_attempts + coach_jump_method`

---

### Task 6: Protocolo de catálogo + familia Saltos

**Files:**
- Create: `shared/domain/jump/protocol.ts`
- Modify: `shared/domain/coach/test-battery.ts` — añadir a `DEFAULT_CALIBRATION_BATTERY` **al final**, `week_offset: null`, `day_of_week: null`. Restore-defaults lo crea; no lo agenda en semana 1.
- Modify: `shared/domain/coach/test-catalog.ts`

```ts
export type TestFamily = 'fuerza' | 'ergo' | 'correr' | 'estaciones' | 'simulacion' | 'saltos';

export const TEST_FAMILY_LABEL: Record<TestFamily, string> = {
  // …existentes
  saltos: 'Saltos',
};

export const TEST_FAMILY_ORDER = [
  'simulacion', 'estaciones', 'correr', 'ergo', 'fuerza', 'saltos',
] as const;
```

Protocolo (una batería, dos resultados, como el 1RM):

```ts
{
  slug: 'cmj_profile',
  label: 'Perfil de salto (CMJ)',
  format: 'test',
  primary_modality: 'strength', // el campo es cerrado; no añadir 'jump' al enum de calibración
  protocol:
    'CMJ con manos en cadera, 3 intentos, quédate el mejor. ' +
    'Luego el mismo salto con la carga que indique tu coach (defecto 15 kg). ' +
    'Máxima intención en la fase concéntrica en los dos.',
  week_offset: null,
  day_of_week: null,
  store_results: [
    { slug: BENCH_CMJ,        unit: 'cm', measure: 'height', derives: 'none', label: 'CMJ' },
    { slug: BENCH_CMJ_LOADED, unit: 'cm', measure: 'height', derives: 'none', label: 'CMJ con carga', optional: true },
  ],
}
```

`cmj_loaded` es **optional**: sin barra el test se cierra igual. LRI solo se pinta si los dos existen.

`isJumpVideoCapture(specs: StoreResultSpec[]): boolean` = `specs.some(s => s.measure === 'height')`. Vive en `shared/domain/jump/protocol.ts`. El status de la batería lo expone como `capture: 'jump_video' | 'session'` para que iOS no adivine.

Preset del editor: un atajo «Perfil de salto (CMJ)» que monta ese protocolo. La prescripción del template puede ser un bloque placeholder (el atleta no lo ejecuta en el vivo). El materializer no debe inventar tramos de carrera.

- [ ] Tests: `week_offset === null`; `calibrationCoherenceError` de ambos specs es `null`; `isJumpVideoCapture` true; un 5K sigue `session`.
- [ ] Commit `feat(jump): protocolo cmj_profile y familia Saltos en el catálogo`

---

### Task 7: Persistencia de intentos + POST de resultados

**Files:**
- Create: `shared/schema/jump.ts` — zod del body de intentos
- Create: `web/lib/athlete/record-jump-attempts.ts`
- Modify: `web/app/api/athlete/assignments/[id]/test-results/route.ts` (o endpoint hermano) para aceptar intentos + results en **una** transacción.

Body:

```ts
{
  results: [{ slug: 'cmj', value: 47.33 }, { slug: 'cmj_loaded', value: 39.38 }],
  body_mass_kg: 76,
  load_kg: 15, // null si no hubo serie cargada
  attempts: [{
    kind: 'cmj' | 'loaded_cmj',
    takeoff_frame, landing_frame, fps,
    quality: 'ok' | 'staggered' | 'low_fps' | 'discarded',
    kept: boolean,
  }]
}
```

Servidor **recalcula** `flight_time_s` y `height_cm` con `shared/domain/jump/physics`. No confía en la altura que mande el teléfono para el benchmark: el `results[].value` tiene que casar con `aggregateHeights` de los `kept` (±0.05 cm). Si no casa → 422.

LRI no se escribe en `athlete_benchmarks`. Se deriva al leer.

- [ ] Test: POST del caso WCSE → 2 filas `athlete_benchmarks` (cmj, cmj_loaded) unit `cm` + N `jump_attempts`. Un value que no casa con los frames → 422.
- [ ] Commit `feat(jump): persistir intentos y firmar la altura en servidor`

---

### Task 8: iOS — grabador + física en paridad

**Files:**
- Create: `ios/FAHYBRIK/Jump/JumpPhysics.swift` (mismos números; test de paridad 47.33)
- Create: `ios/FAHYBRIK/Jump/JumpRecorder.swift` — `AVCaptureSession`, slow-mo 240 si el device lo da, si no el máximo (120) y `quality = low_fps`
- Create: `ios/FAHYBRIKTests/Jump/JumpPhysicsTests.swift`

Convención de frames: enteros, 0-based sobre el clip. El recorder expone `fps` real del fichero, no el pedido.

Cámara: ampliar `NSCameraUsageDescription` (la fuente que genera el plist) con «y para medir la altura de tus saltos».

- [ ] Test Swift: 149 frames / 240 fps = el mismo `heightCm` que el test TS, a 2 decimales.
- [ ] Commit `feat(ios): física de salto y grabador 240 fps`

---

### Task 9: iOS — marcar frames y confirmar

**Files:**
- Create: `ios/FAHYBRIK/Jump/JumpFrameMarker.swift` — Vision `VNDetectHumanBodyPoseRequest`. Despegue = último frame con al menos un tobillo a altura de suelo; aterrizaje = primero después del vuelo. Si la confianza es baja, no inventa: deja al atleta en el scrubber.
- Create: `ios/FAHYBRIK/Jump/JumpReviewScrubber.swift` — **un** control: la línea de tiempo. El atleta confirma o corre un frame. No hay segundo botón de Salud, no hay Continuar/Detener de importación.
- Create: `ios/FAHYBRIK/Jump/JumpCaptureView.swift`

Flujo de la pantalla (una):

1. Setup: peso (prefill `weight_kg`), carga si toca, consigna *«máxima intención en la subida»*, coloca el móvil (cuerpo entero, trípode o apoyo, plano frontal o de lado).
2. 3 intentos CMJ. Entre intentos, descanso del método.
3. Revisión de frames por intento. Descartar está permitido.
4. Si hay peso y el resultado cargado no es optional-skip: 3 intentos con carga.
5. Resumen: 47 cm ± 1, (si hay par) caída y LRI. Guardar → POST task 7.

`TestsHubView.startTest`:

```swift
if test.capture == "jump_video" {
    jumpLaunch = JumpLaunch(assignmentId: start.assignmentId, specs: start.storeResults)
} else {
    workoutLaunch = WorkoutLaunch(assignmentId: start.assignmentId, title: test.label)
}
```

Añadir `capture` al DTO de status (derivado en servidor). No hardcodear slugs en Swift.

`TestResultCaptureSheet` gana `case height` (cm, step 0.5, decimales). Solo se usa si alguien abre «Añadir resultado» sin vídeo; el camino feliz no pisa números a mano.

- [ ] Test de gating: no se guarda si no hay ningún intento `kept` de `cmj`.
- [ ] Commit `feat(ios): captura CMJ en el hub de tests`

---

### Task 10: Marcas — CMJ sin carga, a demanda

**Files:**
- Modify: `shared/domain/athlete/marks.ts`

```ts
export type MarkMeasuredBy = 'run' | 'erg' | 'registered' | 'jump';
export type MarkGroup = 'run' | 'ergo' | 'race' | 'jump';

{
  slug: BENCH_CMJ,
  label: 'CMJ',
  group: 'jump',
  measured_by: 'jump',
  unit: BENCHMARK_UNIT_CM,
  lower_is_better: false,
  min_value: 8,
  max_value: 120,
  approx_label: '3 intentos',
}
```

`MarkDetailView`: si `measuredBy == jump` → `JumpCaptureView` **sin** assignment de batería (materializa el test por start, `source: athlete_test`). No recalibra. Solo serie sin carga.

Actualizar `docs/DECISIONS.md` (catálogo de marcas cerrado 6+3 → 6+3+1, medible por la app).

- [ ] Tests de dominio de marcas: el catálogo incluye `cmj`; `measured_by jump` no pasa por `BenchmarkLaunch` (ese sigue devolviendo nil).
- [ ] Commit `feat(jump): CMJ como marca auto-medible`

---

### Task 11: Coach y ficha

**Files:**
- Modify: `web/components/v2/tests/TestEditorPanel.tsx` — la familia Saltos aparece sola si el panel itera `TEST_FAMILY_ORDER`.
- Modify: formatters de Perfil / Histórico / `TestCard` para unit `cm` → `"47 cm"` (sin dos decimales en UI).
- Modify: `buildTestProgression` para no tratar `cm` como segundos.
- Create: lectura de LRI en ficha cuando existan las dos marcas del mismo día / misma assignment. Si falta una, no se pinta el índice.
- Método: GET/PUT `/api/coach/jump-method` leyendo/escribiendo `coach_jump_method`, default `DEFAULT_JUMP_METHOD`. Un coach que no toca nada = mismos cortes que el informe.

No clonar el póster WCSE. Cifra, delta, LRI, nivel. El cromo de tests existente.

- [ ] Test: format 47.33 → `"47 cm"`; LRI del fixture = 0,85 nivel 3; un 5K no pasa por este formatter.
- [ ] Commit `feat(jump): ficha y método del coach para el perfil de salto`

---

### Task 12: Doble, decisiones, cierre

**Files:**
- Create: `web/components/design-twin/screens/test-salto/` (`meta.estado = 'propuesta'`, `actualizado` = día del commit). Escenarios: setup, revisión de frames, resultado con LRI, resultado solo CMJ, sin peso.
- Modify: `docs/DECISIONS.md` — entrada 2026-08-13: es un test; measure `height`; no calibra; captura cámara; método vs mecanismo; no hay app aparte.
- Modify: `FOCUS.md` — qué se cerró, qué queda (LiDAR, SJ/DJ).
- Modify: iOS Info.plist usage string (fuente).
- Copiar este plan a `docs/superpowers/plans/2026-08-13-test-cmj-salto.md`.
- Verificar: `cd web && pnpm run twin:desfase` no delata este espejo.

- [ ] Commit `docs(jump): decisión, doble y cierre del perfil de salto`

---

## Orden y dependencias

```
1 physics ─┐
2 method ──┼─ 3 contract ─ 4 bridge ─ 5 migration ─ 7 persist
           └─ 6 catalog ──────────────────────────┘
8 recorder ─ 9 capture ─ 10 marks
7 + 9 ─ 11 ficha
9 + 11 ─ 12 docs/twin
```

1–7 se pueden paralelizar en dos frentes (dominio/API vs iOS recorder) a partir de que 1 y 3 existan. 4 no se mergea sin el test del 0:47.

## Verificación de cierre (cuando se ejecute, no ahora)

- Caso del informe: LRI 0,85 ± 0,01
- `athlete_benchmarks.unit` de esas filas es `cm`
- Un 5K posterior sigue en `seconds`
- El 0/4 de calibración no cambia al programar el CMJ
- Perfil → Dispositivos sigue teniendo **un** control de Salud
- El hub muestra la tarjeta; «Probarme» abre cámara, no el vivo
- Sin peso: CMJ sí, cargado no, sin LRI
- Typecheck + vitest jump/* + test de puente
