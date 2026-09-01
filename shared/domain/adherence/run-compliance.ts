// Per-SEGMENT running compliance (#66) — did the athlete hit the prescribed
// intensity of EACH run tramo? This is the running-specific, DIRECTIONAL sibling
// of `bands.ts`: where bands.ts grades a prescribed-vs-real delta by MAGNITUDE
// (green/amber/red by how far off), a coach reviewing a run session wants the
// DIRECTION — did the athlete run this rep TOO HARD (faster/higher HR than the
// band) or TOO EASY (slower/lower)? A structured interval already carries an
// explicit acceptance BAND (the coach authored "4:25–4:35"); the band IS the
// tolerance, so we judge in-band vs out-fast vs out-slow rather than % off.
//
// THE 4 VERDICTS (objective, per the #66 spec)
//   · dentro        — the executed value falls inside the prescribed band.
//   · fuera_rapido  — MORE intense than prescribed (faster pace / higher HR /
//                     higher RPE than the band's intense edge).
//   · fuera_lento   — LESS intense than prescribed (slower / lower).
//   · sin_dato      — nothing comparable: no target, or the executed signal the
//                     target needs wasn't captured, or the tramo wasn't executed.
// "rápido/lento" reads for the common case (run zones resolve to a PACE band);
// for an HR- or RPE-targeted tramo the same axis means "más/menos intenso".
//
// SCOPE: this module is PURE — types + comparison + aggregation, zero I/O and no
// dependency on the DB or web layer. The web wire (per-athlete zone resolution,
// structure enumeration, matching executed laps) adapts real data onto these
// primitives. Verdict → colour lives in the UI theme via RUN_COMPLIANCE_TIER.

import { bandRuleFor, DEFAULT_ABSOLUTE_RULE } from './bands';

// ── Verdict ──────────────────────────────────────────────────────────────────
export const RUN_COMPLIANCE_VERDICTS = ['dentro', 'fuera_rapido', 'fuera_lento', 'sin_dato'] as const;
export type RunComplianceVerdict = (typeof RUN_COMPLIANCE_VERDICTS)[number];

/** Verdict → the shared semantic tier (colour + icon resolve from the tier in the
 *  UI). 'dentro' is green, both out-of-band directions are amber (a coaching
 *  signal, not a failure — hence no 'error'/red), 'sin_dato' is muted. */
export const RUN_COMPLIANCE_TIER: Record<RunComplianceVerdict, 'success' | 'warning' | 'neutral'> = {
  dentro: 'success',
  fuera_rapido: 'warning',
  fuera_lento: 'warning',
  sin_dato: 'neutral',
};

/** Short coach-facing label per verdict (Spanish). Pace-centric wording for the
 *  common run case; the direction (más/menos intenso) still reads for HR/RPE. */
export const RUN_COMPLIANCE_LABEL: Record<RunComplianceVerdict, string> = {
  dentro: 'En banda',
  fuera_rapido: 'Más rápido',
  fuera_lento: 'Más lento',
  sin_dato: 'Sin dato',
};

// ── Tolerances (named, documented — no magic numbers) ─────────────────────────
/**
 * Half-width of the acceptance window for a SINGLE-VALUE pace target ("@4:30/km"),
 * in seconds per km. ±5 s/km is the convention dedicated running platforms use for
 * "on pace" on a structured interval: tight enough to be meaningful (≈1.5–2.5% at
 * this population's 3:30–5:30/km paces) yet not punish natural per-km variance. It
 * is DELIBERATELY finer than bands.ts's generic relative 10% default, which is
 * nonsensical for pace (10% of 4:00/km = 24 s/km — a different effort entirely).
 * Most coach pace targets are authored as explicit BANDS; this is the fallback for
 * a point target.
 */
export const PACE_POINT_TOLERANCE_S = 5;

/** Half-width for a single-value RPE target, in RPE points. Reuses the adherence
 *  absolute default (±1 point) so the small-integer scale is judged consistently. */
export const RPE_POINT_TOLERANCE = DEFAULT_ABSOLUTE_RULE.on_target_max;

// ── Band + sample ─────────────────────────────────────────────────────────────
// A normalized, per-athlete-RESOLVED comparison band for ONE prescribed tramo.
// `axis` selects which executed signal to judge and fixes the direction semantics
// (pace is inverted: fewer seconds = faster = more intense).
export type ComplianceBand =
  | { axis: 'pace'; fast_s: number | null; slow_s: number | null } // s/km; fast_s = the faster (smaller) edge
  | { axis: 'hr'; min_bpm: number | null; max_bpm: number | null } // bpm
  | { axis: 'rpe'; min: number | null; max: number | null }; // 1..10

/** The executed tramo — only the fields relevant to intensity. Any may be absent. */
export interface ComplianceSample {
  pace_s?: number | null; // executed avg pace, s/km
  hr_bpm?: number | null; // executed avg HR
  rpe?: number | null; // executed tramo RPE (none per-segment today → null)
}

// ── Core comparison ───────────────────────────────────────────────────────────
/**
 * Judge one executed sample against one prescribed band. A `null` band (tramo with
 * no objetivo) or a missing/degenerate signal yields 'sin_dato' — never a fabricated
 * verdict. Band edges are INCLUSIVE (a value exactly on an edge is 'dentro').
 */
export function evaluateRunSegment(band: ComplianceBand | null, sample: ComplianceSample): RunComplianceVerdict {
  if (!band) return 'sin_dato';
  switch (band.axis) {
    case 'pace': {
      const v = sample.pace_s;
      if (v == null || !Number.isFinite(v)) return 'sin_dato';
      if (band.fast_s == null && band.slow_s == null) return 'sin_dato';
      // s/km: smaller = faster = MORE intense.
      if (band.fast_s != null && v < band.fast_s) return 'fuera_rapido';
      if (band.slow_s != null && v > band.slow_s) return 'fuera_lento';
      return 'dentro';
    }
    case 'hr': {
      const v = sample.hr_bpm;
      if (v == null || !Number.isFinite(v)) return 'sin_dato';
      if (band.min_bpm == null && band.max_bpm == null) return 'sin_dato';
      // higher HR = MORE intense → above the max is "too hard".
      if (band.max_bpm != null && v > band.max_bpm) return 'fuera_rapido';
      if (band.min_bpm != null && v < band.min_bpm) return 'fuera_lento';
      return 'dentro';
    }
    case 'rpe': {
      const v = sample.rpe;
      if (v == null || !Number.isFinite(v)) return 'sin_dato';
      if (band.min == null && band.max == null) return 'sin_dato';
      if (band.max != null && v > band.max) return 'fuera_rapido';
      if (band.min != null && v < band.min) return 'fuera_lento';
      return 'dentro';
    }
  }
}

// ── Band builders ─────────────────────────────────────────────────────────────
/** Pace band from an explicit pace target: a min_s/max_s band as-is, else a
 *  single value_s widened by ±PACE_POINT_TOLERANCE_S. */
export function paceBandFromTarget(t: { value_s?: number; min_s?: number; max_s?: number }): ComplianceBand {
  if (t.min_s != null || t.max_s != null) {
    return { axis: 'pace', fast_s: t.min_s ?? null, slow_s: t.max_s ?? null };
  }
  if (t.value_s != null) {
    return { axis: 'pace', fast_s: t.value_s - PACE_POINT_TOLERANCE_S, slow_s: t.value_s + PACE_POINT_TOLERANCE_S };
  }
  return { axis: 'pace', fast_s: null, slow_s: null };
}

/** Pace band from an already-resolved zone band (fast_s = faster/smaller edge,
 *  slow_s = slower/larger edge; slow_s null for an open easy zone). */
export function paceBandFromResolvedZone(fast_s: number | null, slow_s: number | null): ComplianceBand {
  return { axis: 'pace', fast_s, slow_s };
}

/** HR band from a resolved HR target (hr_bpm min/max band, or a bare value). */
export function hrBandFromTarget(t: { value?: number; min?: number; max?: number }): ComplianceBand {
  if (t.min != null || t.max != null) return { axis: 'hr', min_bpm: t.min ?? null, max_bpm: t.max ?? null };
  if (t.value != null) return { axis: 'hr', min_bpm: t.value, max_bpm: t.value };
  return { axis: 'hr', min_bpm: null, max_bpm: null };
}

/** RPE band from an rpe target: a min/max band as-is, else a value widened by
 *  ±RPE_POINT_TOLERANCE. */
export function rpeBandFromTarget(t: { value?: number; min?: number; max?: number }): ComplianceBand {
  if (t.min != null || t.max != null) return { axis: 'rpe', min: t.min ?? null, max: t.max ?? null };
  if (t.value != null) return { axis: 'rpe', min: t.value - RPE_POINT_TOLERANCE, max: t.value + RPE_POINT_TOLERANCE };
  return { axis: 'rpe', min: null, max: null };
}

// ── Session aggregate ─────────────────────────────────────────────────────────
export interface RunComplianceSummary {
  /** Every tramo considered (evaluable + sin_dato). */
  total: number;
  /** Tramos with a real verdict (dentro + fuera_*). The denominator of pct_dentro. */
  evaluable: number;
  dentro: number;
  fuera_rapido: number;
  fuera_lento: number;
  sin_dato: number;
  /** % of EVALUABLE tramos that landed 'dentro'. Null when nothing was evaluable
   *  (all sin_dato) — never 0% or NaN, so the UI can say "sin datos" honestly. */
  pct_dentro: number | null;
}

/** Aggregate a session's per-tramo verdicts into the coach headline number. */
export function summarizeRunCompliance(verdicts: readonly RunComplianceVerdict[]): RunComplianceSummary {
  let dentro = 0;
  let fuera_rapido = 0;
  let fuera_lento = 0;
  let sin_dato = 0;
  for (const v of verdicts) {
    if (v === 'dentro') dentro++;
    else if (v === 'fuera_rapido') fuera_rapido++;
    else if (v === 'fuera_lento') fuera_lento++;
    else sin_dato++;
  }
  const evaluable = dentro + fuera_rapido + fuera_lento;
  return {
    total: verdicts.length,
    evaluable,
    dentro,
    fuera_rapido,
    fuera_lento,
    sin_dato,
    pct_dentro: evaluable > 0 ? Math.round((dentro / evaluable) * 100) : null,
  };
}

// ── Recuperación: la MISMA banda, un veredicto DISTINTO (Alex, 12-ago) ────────
//
// En carrera el "parado" rara vez se hace: lo habitual es un cambio de ritmo o
// de zona, no una parada — la gramática ya lo permite (`rec(dur(60), 'trote',
// rpe(3))`, el arquetipo fartlek) y `segment_executions` ya lo MIDE (mig 0146,
// docs/DECISIONS.md 9-ago: "una recuperación de correr no es un descanso...
// se MIDE, no se asume parado"). Lo que faltaba era juzgarlo.
//
// LA DIRECCIÓN QUE IMPORTA SE INVIERTE. Para el trabajo, salirse por CUALQUIER
// lado es una señal digna de mirar. Para la recuperación, NO: irse rápido —
// recuperar a más intensidad de la pedida— es el fallo real, porque es la
// fatiga acumulada la que explica que la repetición 5 se caiga. Irse lento
// —recuperar más suave de lo pedido, o pararse del todo cuando se pidió
// trotar— es casi siempre irrelevante: nadie ha fallado por descansar de más.
// Por eso este módulo NO reutiliza `RunComplianceVerdict` para recuperación:
// mezclar "demasiado rápido" y "demasiado lento" bajo el mismo `fuera_*` haría
// que el color/tier de la UI (RUN_COMPLIANCE_TIER) marcara como aviso algo
// que no lo es. `evaluateRecoverySegment` SÍ reutiliza la comparación de banda
// de `evaluateRunSegment` — la aritmética de "¿está dentro/rápido/lento?" es
// la misma para las dos, cambia lo que se hace con la respuesta.

export const RECOVERY_COMPLIANCE_VERDICTS = ['controlada', 'demasiado_rapida', 'sin_dato'] as const;
export type RecoveryComplianceVerdict = (typeof RECOVERY_COMPLIANCE_VERDICTS)[number];

export const RECOVERY_COMPLIANCE_TIER: Record<RecoveryComplianceVerdict, 'success' | 'warning' | 'neutral'> = {
  controlada: 'success',
  demasiado_rapida: 'warning',
  sin_dato: 'neutral',
};

export const RECOVERY_COMPLIANCE_LABEL: Record<RecoveryComplianceVerdict, string> = {
  controlada: 'Recuperación controlada',
  demasiado_rapida: 'Recuperación demasiado rápida',
  sin_dato: 'Sin dato',
};

/**
 * Juzga una recuperación CON objetivo (nunca se llama con `band: null` desde
 * el wire — una recuperación sin objetivo no se juzga, se omite antes de
 * llegar aquí). `fuera_rapido` de `evaluateRunSegment` — más intenso de lo
 * pedido, en cualquier eje (ritmo, FC o RPE) — es el único caso que cuenta
 * como fallo; `dentro` y `fuera_lento` son igual de "controlada": las dos
 * dicen que el atleta se guardó lo que tenía que guardarse.
 */
export function evaluateRecoverySegment(
  band: ComplianceBand | null,
  sample: ComplianceSample,
): RecoveryComplianceVerdict {
  const verdict = evaluateRunSegment(band, sample);
  if (verdict === 'fuera_rapido') return 'demasiado_rapida';
  if (verdict === 'sin_dato') return 'sin_dato';
  return 'controlada'; // 'dentro' o 'fuera_lento'
}

export interface RecoveryComplianceSummary {
  /** Toda recuperación CON objetivo considerada (evaluable + sin_dato). Una
   *  recuperación sin objetivo no cuenta aquí — no hay nada que agregar de
   *  algo que nunca se juzgó. */
  total: number;
  /** Recuperaciones con muestra real (controlada + demasiado_rapida). */
  evaluable: number;
  controlada: number;
  demasiado_rapida: number;
  sin_dato: number;
  /** % de recuperaciones evaluables que se mantuvieron controladas — la cifra
   *  que le importa al coach. Null cuando nada era evaluable, nunca 0%. */
  pct_controlada: number | null;
}

/** Aggregate una sesión de veredictos de recuperación. Espejo de
 *  `summarizeRunCompliance`, con el eje bueno/malo invertido a propósito. */
export function summarizeRecoveryCompliance(
  verdicts: readonly RecoveryComplianceVerdict[],
): RecoveryComplianceSummary {
  let controlada = 0;
  let demasiado_rapida = 0;
  let sin_dato = 0;
  for (const v of verdicts) {
    if (v === 'controlada') controlada++;
    else if (v === 'demasiado_rapida') demasiado_rapida++;
    else sin_dato++;
  }
  const evaluable = controlada + demasiado_rapida;
  return {
    total: verdicts.length,
    evaluable,
    controlada,
    demasiado_rapida,
    sin_dato,
    pct_controlada: evaluable > 0 ? Math.round((controlada / evaluable) * 100) : null,
  };
}

// ── Duración: la SEGUNDA pregunta de un tramo, independiente de la intensidad ──
//
// El coach lo encontró al verificar el colapso de recuperación (12-ago): el
// motor solo mira INTENSIDAD (ritmo/FC/RPE). Un «6×1000 con 60 s de trote»
// corrido al ritmo pedido pero con 3 min de trote entre series lee hoy «6 de
// 6 dentro · recuperación controlada» — y esa NO es la sesión prescrita: en
// series a umbral la recuperación INCOMPLETA ES el estímulo, y doblar el
// descanso cambia la sesión entera, no un número suelto.
//
// NO ES UN CUARTO AXIS de `ComplianceBand`. Los tres actuales comparan CUÁN
// INTENSO fue el tramo; esto compara CUÁNTO DURÓ contra lo prescrito
// (`Segment.measure`) — pregunta distinta, con SU PROPIO veredicto que
// convive con el de intensidad en la misma fila, nunca colapsado en él. Solo
// se juzga cuando `measure.type === 'duration'`: si se prescribió por
// distancia, o no hay medida, no hay nada contra qué comparar.
//
// LA DIRECCIÓN SE INVIERTE OTRA VEZ, y al revés que en recuperación-intensidad:
//   · Recuperación: el fallo es PASARSE — más descanso del pedido cambia el
//     estímulo. Quedarse corto es, si acaso, un mérito.
//   · Trabajo: el fallo es QUEDARSE CORTO — menos dosis de la pedida.
//     Pasarse de tiempo no reduce el estímulo, así que no es un fallo: es la
//     imagen especular exacta del caso de recuperación.
// Por eso hay DOS vocabularios de veredicto, no uno con un parámetro de rol:
// que cada uno sea autoexplicativo evita leer 'corta'/'larga' sueltos sin
// saber si tocaba trabajo o recuperación — la comparación en sí (`compareDuration`)
// es simétrica y privada; cada rol decide DESPUÉS qué dirección es el fallo.
//
// LA TOLERANCIA REUTILIZA `bands.ts`, no inventa una segunda. Su
// `MEASURE_BAND_OVERRIDES` ya declaraba `duration` en la superficie de
// overrides (comentario propio: «declared empty so future edits land here»)
// con el 10% relativo del `DEFAULT_BAND_RULE` — esto es su primer consumidor
// real, no una tolerancia nueva y muda. Sigue siendo MÉTODO del coach (cuánto
// margen se le da a un descanso no es un hecho físico): vive en el default de
// `bands.ts`, no hardcodeada aquí, y hoy no hay UI que la edite — deuda
// declarada, igual que el default de recuperación de los arquetipos.

function relativeDurationToleranceS(prescribed_s: number): number {
  return prescribed_s * bandRuleFor({ measure_kind: 'duration' }).on_target_max;
}

/** Comparación objetiva y simétrica: ¿la duración real cayó corta, larga, o
 *  dentro de la ventana de tolerancia alrededor de la prescrita? Privada:
 *  cada rol decide DESPUÉS qué dirección es el fallo (ver las dos funciones
 *  exportadas de abajo). */
function compareDuration(
  prescribed_s: number,
  actual_s: number | null,
): 'corta' | 'larga' | 'en_ventana' | 'sin_dato' {
  if (actual_s == null || !Number.isFinite(actual_s) || actual_s < 0) return 'sin_dato';
  const tolerance_s = relativeDurationToleranceS(prescribed_s);
  if (actual_s < prescribed_s - tolerance_s) return 'corta';
  if (actual_s > prescribed_s + tolerance_s) return 'larga';
  return 'en_ventana';
}

export const RECOVERY_DURATION_VERDICTS = ['duracion_controlada', 'duracion_excedida', 'sin_dato'] as const;
export type RecoveryDurationVerdict = (typeof RECOVERY_DURATION_VERDICTS)[number];

export const RECOVERY_DURATION_TIER: Record<RecoveryDurationVerdict, 'success' | 'warning' | 'neutral'> = {
  duracion_controlada: 'success',
  duracion_excedida: 'warning',
  sin_dato: 'neutral',
};

export const RECOVERY_DURATION_LABEL: Record<RecoveryDurationVerdict, string> = {
  duracion_controlada: 'Duración controlada',
  duracion_excedida: 'Se pasó de tiempo',
  sin_dato: 'Sin dato',
};

/**
 * ¿Cuánto duró la recuperación frente a lo prescrito? El único fallo es
 * PASARSE de tiempo — quedarse corto (o pararse cuando tocaba trotar) es
 * `duracion_controlada`: nadie falla por descansar de menos.
 */
export function evaluateRecoveryDuration(prescribed_s: number, actual_s: number | null): RecoveryDurationVerdict {
  const raw = compareDuration(prescribed_s, actual_s);
  if (raw === 'larga') return 'duracion_excedida';
  if (raw === 'sin_dato') return 'sin_dato';
  return 'duracion_controlada'; // 'corta' o 'en_ventana'
}

export const WORK_DURATION_VERDICTS = ['duracion_completa', 'duracion_incompleta', 'sin_dato'] as const;
export type WorkDurationVerdict = (typeof WORK_DURATION_VERDICTS)[number];

export const WORK_DURATION_TIER: Record<WorkDurationVerdict, 'success' | 'warning' | 'neutral'> = {
  duracion_completa: 'success',
  duracion_incompleta: 'warning',
  sin_dato: 'neutral',
};

export const WORK_DURATION_LABEL: Record<WorkDurationVerdict, string> = {
  duracion_completa: 'Duración cumplida',
  duracion_incompleta: 'Se quedó corto',
  sin_dato: 'Sin dato',
};

/**
 * ¿Cuánto duró el tramo de trabajo frente a lo prescrito? El único fallo es
 * QUEDARSE CORTO — menos dosis de la pedida. Pasarse de tiempo no reduce el
 * estímulo, así que es `duracion_completa` igual que acertar el tiempo exacto.
 */
export function evaluateWorkDuration(prescribed_s: number, actual_s: number | null): WorkDurationVerdict {
  const raw = compareDuration(prescribed_s, actual_s);
  if (raw === 'corta') return 'duracion_incompleta';
  if (raw === 'sin_dato') return 'sin_dato';
  return 'duracion_completa'; // 'larga' o 'en_ventana'
}

export interface WorkDurationSummary {
  /** Tramos de TRABAJO con duración prescrita (measure.type === 'duration').
   *  Un tramo medido por distancia no cuenta aquí — no hay nada que agregar
   *  de algo que nunca se comparó. */
  total: number;
  evaluable: number;
  completa: number;
  incompleta: number;
  sin_dato: number;
  /** % de tramos evaluables que cumplieron su dosis de tiempo (completa +
   *  "se pasó", que aquí no es un fallo). Null cuando nada era evaluable. */
  pct_completa: number | null;
}

/** Aggregate de duración del TRABAJO. Espejo de `summarizeRecoveryDuration`
 *  con el eje bueno/malo invertido (ver el porqué en la cabecera del módulo). */
export function summarizeWorkDuration(verdicts: readonly WorkDurationVerdict[]): WorkDurationSummary {
  let completa = 0;
  let incompleta = 0;
  let sin_dato = 0;
  for (const v of verdicts) {
    if (v === 'duracion_completa') completa++;
    else if (v === 'duracion_incompleta') incompleta++;
    else sin_dato++;
  }
  const evaluable = completa + incompleta;
  return {
    total: verdicts.length,
    evaluable,
    completa,
    incompleta,
    sin_dato,
    pct_completa: evaluable > 0 ? Math.round((completa / evaluable) * 100) : null,
  };
}

export interface RecoveryDurationSummary {
  /** Tramos de RECUPERACIÓN con duración prescrita. Uno medido por distancia
   *  (o sin duración prescrita) no cuenta aquí. */
  total: number;
  evaluable: number;
  controlada: number;
  excedida: number;
  sin_dato: number;
  /** % de tramos evaluables que NO se pasaron de tiempo. Null cuando nada
   *  era evaluable, nunca 0%. */
  pct_controlada: number | null;
}

/** Aggregate de duración de la RECUPERACIÓN. */
export function summarizeRecoveryDuration(verdicts: readonly RecoveryDurationVerdict[]): RecoveryDurationSummary {
  let controlada = 0;
  let excedida = 0;
  let sin_dato = 0;
  for (const v of verdicts) {
    if (v === 'duracion_controlada') controlada++;
    else if (v === 'duracion_excedida') excedida++;
    else sin_dato++;
  }
  const evaluable = controlada + excedida;
  return {
    total: verdicts.length,
    evaluable,
    controlada,
    excedida,
    sin_dato,
    pct_controlada: evaluable > 0 ? Math.round((controlada / evaluable) * 100) : null,
  };
}
