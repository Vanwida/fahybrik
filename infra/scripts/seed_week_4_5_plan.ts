/**
 * Seed weeks 4 (DELOAD/descarga) and 5 (cierre de base) of the HYROX 12-week
 * plan, in all 3 athlete profiles each, using the UNIFIED prescription model
 * (@fahybrid/shared/domain/prescription).
 *
 * Source of truth: docs/Plantilla_HYROX_12sem (1) 2.xlsx
 *   - Semana 4 / Semana 5            → balanced
 *   - Res S4 / Res S5                → endurance_focus
 *   - Fue S4 / Fue S5                → strength_focus
 *
 * Mirrors week 1's build EXACTLY (program_week_templates 51/52/53, templates
 * 76-93, template_segments + slots_json):
 *   - 6 session templates per variant (Lun-Sáb; Dom = rest, no template)
 *   - coach_id=4, day_position, target_block='ACC', methodology_group_id,
 *     warmup/cooldown, coach_notes = CAPA1 line + [+]/[=] marker
 *   - template_segments carrying the full prescription_json (validated against
 *     the real Zod schema before insert — auto-QA)
 *   - one program_week_templates per variant (slots_json in the EXACT shape of
 *     pwt 51: days[].sessions[].blocks[].items[] with legacy params_json + notes)
 *
 * INTENSITY POLICY (improves on week 1, no fabrication):
 *   Every intensity the source states EXPLICITLY is structured into `target`:
 *   Z1/Z2/Z4/Z5 → hr_zone; "RPE n" / "RPE a-b" → rpe; %RM → percent_rm; kg → kg;
 *   "Ncal" → measure calories. A pace that is only RELATIVE to a stored test
 *   ("a ritmo objetivo", "a ritmo del test 9'") has NO absolute number, so it is
 *   NOT fabricated — it stays in the per-set / block note, exactly as week 1 did.
 *
 * DELOAD (week 4): intensity held (same %RM / zones / RPE), volume cut (fewer
 *   sets, rounds, km) — reflected in the focus, coach_notes and the prescription.
 *
 * No new exercises or blocks are created: every line maps to an existing
 * exercise (catalog of 71) and references Pablo's block library (102) in prose,
 * just as week 1 did. Nothing therefore needs `needs_review`.
 *
 * Idempotent: deletes any prior week-4/5 program_week_templates + their session
 * templates (by deterministic name) inside a transaction, then re-inserts.
 *
 * Run: pnpm --filter @fahybrid/infra exec tsx scripts/seed_week_4_5_plan.ts
 */
import {
  prescriptionSchema,
  type Prescription,
} from '@fahybrid/shared/domain/prescription';
import { getSql } from './_db.js';

const COACH_ID = 4;
const LEVEL = 'pro';
const ATR = 'ACC';
const TARGET_BLOCK = 'ACC';

// Methodology group ids (methodology_groups): 1 fuerza-base · 2 explosiva ·
// 3 ergometros · 4 running · 5 zona2 · 6 wods · 7 simulaciones · 8 core ·
// 9 circuitos · 10 tapering.
const MG = {
  fuerza: 1,
  explosiva: 2,
  ergo: 3,
  running: 4,
  zona2: 5,
  wods: 6,
  simulaciones: 7,
  core: 8,
  circuitos: 9,
} as const;

// Exercise ids (exercises catalog).
const EX = {
  run: 3479,
  row: 3481,
  ski: 3480,
  bike: 3482,
  bikeAssault: 3483,
  walk: 3571,
  drills: 3572,
  hipMobility: 2807,
  foamRoll: 2809,
  backSquat: 3484,
  frontSquat: 3485,
  benchPress: 3490,
  overheadPress: 3488,
  hipThrust: 3493,
  rdl: 3487,
  powerClean: 3494,
  boxJump: 3512,
  thruster: 3497,
  walkingLunge: 3498,
  reverseLunge: 3499,
  pullup: 3492,
  weightedPullup: 2802,
  dip: 3573,
  tgu: 3505,
  sitUp: 3519,
  burpee: 3508,
  burpeeBroadJump: 4,
  sledPush: 2,
  sledPull: 3,
  sledDrag: 2804,
  wallBall: 8,
  farmerCarry: 6,
  sandbagClean: 2806,
} as const;

const DAY_POSITIONS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

// ── Types describing one variant declaratively ──────────────────────────────
type Item = {
  exercise_id: number;
  notes: string; // CAPA-2 detail line, preserved verbatim from the Excel
  params_json: Record<string, number>; // legacy mirror (matches week 1 slots)
  prescription: Prescription; // canonical, validated
};
type Block = { title: string; format: string; items: Item[] };
type Session = {
  day_of_week: number; // 1..6 (Mon..Sat)
  day_position: (typeof DAY_POSITIONS)[number];
  name: string;
  format: string; // template.format
  methodology_group_id: number;
  focus: string; // session focus (slots_json sessions[].focus)
  warmup: string;
  cooldown: string;
  capa1: string; // CAPA-1 logic line (→ coach_notes, prefixed "CAPA1 — ")
  blocks: Block[];
};
type Variant = {
  athlete_profile: 'balanced' | 'endurance_focus' | 'strength_focus';
  week_number: number;
  name: string;
  focus: string; // program_week_templates.focus
  sessions: Session[]; // Mon..Sat; Sunday is rest (no session)
};

// ── Prescription builders (canonical model) ─────────────────────────────────
const steady = (s: number): Prescription => ({ scheme: 'steady', total_s: s });
const steadyZone = (s: number, z: number): Prescription => ({
  scheme: 'steady',
  total_s: s,
  target: { kind: 'hr_zone', value: z },
});
const steadyRpe = (s: number, min: number, max?: number): Prescription => ({
  scheme: 'steady',
  total_s: s,
  target: max === undefined ? { kind: 'rpe', value: min } : { kind: 'rpe', min, max },
});
// Intervals (run/erg series): rounds × work_s, common rest. Optional block target.
const intervals = (
  rounds: number,
  work_s: number,
  rest_s: number,
  target?: Prescription['target'],
): Prescription => ({
  scheme: 'interval',
  rounds,
  work_s,
  rest_s,
  ...(target ? { target } : {}),
});
// Distance intervals (Nm series): one distance bout per round + rest, target opt.
const distIntervals = (
  rounds: number,
  meters: number,
  rest_s: number,
  note?: string,
): Prescription => ({
  scheme: 'interval',
  rounds,
  rest_s,
  sets: Array.from({ length: rounds }, () => ({
    measure: { kind: 'distance' as const, meters },
    ...(note ? { note } : {}),
  })),
});
// Strides: N × short bout (no rest tracked), bodyweight running.
const strides = (n: number, work_s: number): Prescription => ({
  scheme: 'interval',
  rounds: n,
  work_s,
});
// Strength sets from an explicit reps[] + per-set or uniform %RM (point or range).
const strengthSets = (
  reps: number[],
  load: { pcts?: number[]; pct?: number; pctRange?: [number, number]; kg?: number },
  rest_s?: number,
): Prescription => ({
  scheme: 'sets',
  sets: reps.map((r, i) => {
    const target = load.pcts
      ? { kind: 'percent_rm' as const, value: load.pcts[i]! }
      : load.pct !== undefined
        ? { kind: 'percent_rm' as const, value: load.pct }
        : load.pctRange
          ? { kind: 'percent_rm' as const, min: load.pctRange[0], max: load.pctRange[1] }
          : load.kg !== undefined
            ? { kind: 'kg' as const, value: load.kg }
            : undefined;
    return {
      measure: { kind: 'reps' as const, value: r },
      ...(target ? { target } : {}),
      ...(rest_s !== undefined ? { rest_s } : {}),
    };
  }),
});
// Bodyweight / no-load strength sets (reps only).
const bodyweightSets = (reps: number[], rest_s?: number): Prescription => ({
  scheme: 'sets',
  sets: reps.map((r) => ({
    measure: { kind: 'reps' as const, value: r },
    ...(rest_s !== undefined ? { rest_s } : {}),
  })),
});
// A WOD round component (one exercise inside an N-round circuit/AFAP/chipper).
// Carries the per-round measure + optional kg/cal target. Scheme 'rounds'.
const wodReps = (rounds: number, reps: number, kg?: number): Prescription => ({
  scheme: 'rounds',
  rounds,
  sets: [
    {
      measure: { kind: 'reps', value: reps },
      ...(kg !== undefined ? { target: { kind: 'kg', value: kg } } : {}),
    },
  ],
});
const wodDist = (rounds: number, meters: number, kg?: number): Prescription => ({
  scheme: 'rounds',
  rounds,
  sets: [
    {
      measure: { kind: 'distance', meters },
      ...(kg !== undefined ? { target: { kind: 'kg', value: kg } } : {}),
    },
  ],
});
const wodCal = (rounds: number, cal: number): Prescription => ({
  scheme: 'rounds',
  rounds,
  sets: [{ measure: { kind: 'calories', value: cal } }],
});
// A chipper line: descending rep ladder, single load.
const chipper = (ladder: number[], kg?: number): Prescription => ({
  scheme: 'sets',
  sets: ladder.map((r) => ({
    measure: { kind: 'reps' as const, value: r },
    ...(kg !== undefined ? { target: { kind: 'kg' as const, value: kg } } : {}),
  })),
});

// Mirror a Prescription onto the legacy params_json shape week-1 slots used.
function legacyParams(p: Prescription): Record<string, number> {
  const out: Record<string, number> = {};
  if (p.scheme === 'steady' && p.total_s !== undefined) out.time_seconds = p.total_s;
  if ((p.scheme === 'interval' || p.scheme === 'rounds') && p.rounds !== undefined) {
    // distance-bout intervals → sets+distance; time intervals → sets+time
    if (p.sets && p.sets[0]?.measure?.kind === 'distance') {
      out.sets = p.rounds;
      out.distance_m = p.sets[0].measure.meters;
    } else {
      out.sets = p.rounds;
      if (p.work_s !== undefined) out.time_seconds = p.work_s;
    }
    if (p.rest_s !== undefined) out.rest_seconds = p.rest_s;
  }
  if (p.scheme === 'sets' && p.sets) {
    out.sets = p.sets.length;
    const rest = p.sets[0]?.rest_s;
    if (rest !== undefined) out.rest_seconds = rest;
  }
  if (p.scheme === 'rounds' && p.sets) {
    out.sets = p.rounds ?? p.sets.length;
    const m = p.sets[0]?.measure;
    if (m?.kind === 'reps') out.reps = m.value;
    if (m?.kind === 'distance') out.distance_m = m.meters;
    if (m?.kind === 'calories') out.calories = m.value;
  }
  return out;
}

const item = (exercise_id: number, notes: string, prescription: Prescription): Item => ({
  exercise_id,
  notes,
  prescription,
  params_json: legacyParams(prescription),
});

// ════════════════════════════════════════════════════════════════════════════
// WEEK 4 — BALANCED (Semana 4 · DELOAD)
// ════════════════════════════════════════════════════════════════════════════
const w4_balanced: Variant = {
  athlete_profile: 'balanced',
  week_number: 4,
  name: 'Semana 4 — Acumulación · Descarga',
  focus:
    'Microciclo de DESCARGA (macrociclo ATR ACUMULACIÓN). Se MANTIENE la intensidad (ritmos de test, %RM, zonas) y se RECORTA el volumen (menos series, km y rondas) para asimilar la carga de las semanas 1-3. Lunes carrera Z2 corta + strides; martes threshold reducido (una serie menos); miércoles fuerza empuje ligera + ergómetro corto de umbral; jueves series cortas sub-umbral; viernes descanso; sábado largo Z2 recortado; domingo descanso.',
  sessions: [
    {
      day_of_week: 1,
      day_position: 'monday',
      name: 'Carrera Z2 corta + strides',
      format: 'tempo',
      methodology_group_id: MG.zona2,
      focus: 'Carrera Z2 corta + strides',
      warmup: 'Movilidad cadera + técnica carrera',
      cooldown: 'Soltar trotando suave',
      capa1: 'Carrera Z2 corta + strides (mantener velocidad, poco volumen).',
      blocks: [
        {
          title: 'Carrera Z2',
          format: 'tempo',
          items: [item(EX.run, "50' Z2 RPE 3-4. Mantener técnica, sin fatigar.", steadyZone(3000, 2))],
        },
        {
          title: 'Strides',
          format: 'intervals',
          items: [item(EX.run, '6×30" strides progresivos (25→90% velocidad)', strides(6, 30))],
        },
      ],
    },
    {
      day_of_week: 2,
      day_position: 'tuesday',
      name: 'Threshold reducido (cinta)',
      format: 'intervals',
      methodology_group_id: MG.running,
      focus: 'Threshold reducido en cinta',
      warmup: "5' warm up",
      cooldown: "5' cool down",
      capa1: 'Threshold en cinta REDUCIDO (menos series, misma intensidad).',
      blocks: [
        {
          title: 'Threshold',
          format: 'intervals',
          items: [
            item(
              EX.run,
              '4×6\' a ritmo test 9\' / 1\'15" walking rest. [DELOAD] misma intensidad, una serie menos vs carga.',
              intervals(4, 360, 75),
            ),
          ],
        },
      ],
    },
    {
      day_of_week: 3,
      day_position: 'wednesday',
      name: 'Fuerza empuje ligera + Ergo umbral',
      format: 'strength_block',
      methodology_group_id: MG.fuerza,
      focus: 'Fuerza empuje (volumen reducido) + ergómetro corto de umbral',
      warmup: 'Movilidad hombro + activación escapular',
      cooldown: '10\' trote suave',
      capa1: 'Fuerza empuje (menos volumen) + ergómetro corto de umbral.',
      blocks: [
        {
          title: 'A · Bench Press',
          format: 'strength_block',
          items: [
            item(
              EX.benchPress,
              '4 rounds Bench Press 10/8/8/6. [DELOAD] volumen reducido, misma intensidad.',
              strengthSets([10, 8, 8, 6], {}),
            ),
          ],
        },
        {
          title: 'B · Threshold ski-row',
          format: 'intervals',
          items: [
            item(EX.row, '1k row × 4 rounds / 90" rest', distIntervals(4, 1000, 90)),
            item(EX.ski, '1k ski × 4 rounds / 90" rest', distIntervals(4, 1000, 90)),
          ],
        },
      ],
    },
    {
      day_of_week: 4,
      day_position: 'thursday',
      name: 'Series cortas sub-umbral',
      format: 'intervals',
      methodology_group_id: MG.running,
      focus: 'Series cortas sub-umbral (calidad, bajo volumen)',
      warmup: '2-3km warm up',
      cooldown: '1km cool down',
      capa1: 'Series cortas sub-umbral (calidad, bajo volumen).',
      blocks: [
        {
          title: 'Series 400m',
          format: 'intervals',
          items: [
            item(
              EX.run,
              "8×400m / 1' rest (sub-umbral). [DELOAD] menos repeticiones que en carga, mismo ritmo.",
              distIntervals(8, 400, 60),
            ),
          ],
        },
      ],
    },
    {
      day_of_week: 6,
      day_position: 'saturday',
      name: 'Día largo Z2 recortado',
      format: 'tempo',
      methodology_group_id: MG.zona2,
      focus: 'Día largo Z2 recortado (carrera + bike)',
      warmup: 'Calentar trotando',
      cooldown: 'Enfriar trotando',
      capa1: 'Día largo Z2 RECORTADO.',
      blocks: [
        {
          title: 'Aeróbico Z2 mixto (recortado)',
          format: 'tempo',
          items: [
            item(EX.run, "30' carrera Z2 RPE 3. Recuperación activa.", steadyZone(1800, 2)),
            item(EX.bike, "20' bike Z2 RPE 3. [DELOAD] largo recortado a 50' totales.", steadyZone(1200, 2)),
          ],
        },
      ],
    },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// WEEK 4 — ENDURANCE_FOCUS (Res S4 · DELOAD)
// ════════════════════════════════════════════════════════════════════════════
const w4_endurance: Variant = {
  athlete_profile: 'endurance_focus',
  week_number: 4,
  name: 'Semana 4 — Acumulación · Descarga · Resistencia',
  focus:
    'Microciclo de DESCARGA (ATR ACUMULACIÓN) — variante RESISTENCIA (Perfil 2: fuerte, poca base aeróbica). Se MANTIENE intensidad y se RECORTA volumen. Diferencias de perfil: martes fuerza inferior EN MANTENIMIENTO [=] a volumen mínimo; se priorizan los estímulos aeróbicos [+] aunque recortados — lunes carrera Z2 + strides, miércoles series cortas sub-umbral, jueves ergómetros de umbral reducidos, sábado día largo Z2 recortado. Viernes y domingo descanso.',
  sessions: [
    {
      day_of_week: 1,
      day_position: 'monday',
      name: 'Carrera Z2 corta + strides',
      format: 'tempo',
      methodology_group_id: MG.zona2,
      focus: 'Carrera Z2 corta + strides',
      warmup: 'Movilidad + técnica carrera',
      cooldown: 'Soltar trotando',
      capa1: '[+] Carrera Z2 corta + strides (mantener velocidad, poco volumen).',
      blocks: [
        {
          title: 'Carrera Z2',
          format: 'tempo',
          items: [item(EX.run, "45' Z2 RPE 3-4. Mantener técnica, sin fatigar.", steadyZone(2700, 2))],
        },
        {
          title: 'Strides',
          format: 'intervals',
          items: [item(EX.run, '6×30" strides progresivos', strides(6, 30))],
        },
      ],
    },
    {
      day_of_week: 2,
      day_position: 'tuesday',
      name: 'Fuerza inferior ligera (mantenimiento)',
      format: 'strength_block',
      methodology_group_id: MG.fuerza,
      focus: 'Fuerza inferior ligera (mantenimiento, volumen mínimo)',
      warmup: 'Movilidad + activación cadera/tobillo',
      cooldown: '10\' trote suave',
      capa1: '[=] Fuerza inferior ligera (mantenimiento, volumen mínimo).',
      blocks: [
        {
          title: 'A · Back Squat',
          format: 'strength_block',
          items: [
            item(EX.backSquat, '2 rounds Back Squat 8/6 @70%. Volumen mínimo de mantenimiento.', strengthSets([8, 6], { pct: 70 })),
          ],
        },
        {
          title: 'B · Hip Thrust',
          format: 'strength_block',
          items: [item(EX.hipThrust, '2 rounds Hip Thrust 10/8', strengthSets([10, 8], {}))],
        },
      ],
    },
    {
      day_of_week: 3,
      day_position: 'wednesday',
      name: 'Series cortas sub-umbral',
      format: 'intervals',
      methodology_group_id: MG.running,
      focus: 'Series cortas sub-umbral (calidad, bajo volumen)',
      warmup: '2km warm up',
      cooldown: '1km cool down',
      capa1: '[+] Series CORTAS sub-umbral (calidad, bajo volumen).',
      blocks: [
        {
          title: 'Series 400m',
          format: 'intervals',
          items: [
            item(EX.run, "8×400m / 1' rest (sub-umbral). Menos repeticiones, mismo ritmo.", distIntervals(8, 400, 60)),
          ],
        },
      ],
    },
    {
      day_of_week: 4,
      day_position: 'thursday',
      name: 'Ergómetros de umbral reducidos',
      format: 'intervals',
      methodology_group_id: MG.ergo,
      focus: 'Ergómetros de umbral reducidos (misma intensidad, menos series)',
      warmup: 'Row 5\' técnica',
      cooldown: 'Soltar suave',
      capa1: '[+] Ergómetros de umbral REDUCIDOS (misma intensidad, menos series).',
      blocks: [
        {
          title: 'Row umbral',
          format: 'intervals',
          items: [item(EX.row, "Row 4×3' RPE 8 / 1' rest", intervals(4, 180, 60, { kind: 'rpe', value: 8 }))],
        },
        {
          title: 'Ski umbral',
          format: 'intervals',
          items: [item(EX.ski, "Ski 3×3' RPE 8 / 1' rest. [DELOAD] misma intensidad, menos volumen.", intervals(3, 180, 60, { kind: 'rpe', value: 8 }))],
        },
      ],
    },
    {
      day_of_week: 6,
      day_position: 'saturday',
      name: 'Día largo Z2 recortado',
      format: 'tempo',
      methodology_group_id: MG.zona2,
      focus: 'Día largo Z2 recortado (carrera + bike)',
      warmup: 'Calentar trotando',
      cooldown: 'Enfriar trotando',
      capa1: '[+] Día largo Z2 RECORTADO (carrera + bike suave).',
      blocks: [
        {
          title: 'Aeróbico Z2 mixto (recortado)',
          format: 'tempo',
          items: [
            item(EX.run, "30' carrera Z2 RPE 3. Recuperación activa.", steadyZone(1800, 2)),
            item(EX.bike, "20' bike Z2 RPE 3. Largo recortado a 50' totales.", steadyZone(1200, 2)),
          ],
        },
      ],
    },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// WEEK 4 — STRENGTH_FOCUS (Fue S4 · DELOAD)
// ════════════════════════════════════════════════════════════════════════════
const w4_strength: Variant = {
  athlete_profile: 'strength_focus',
  week_number: 4,
  name: 'Semana 4 — Acumulación · Descarga · Fuerza',
  focus:
    'Microciclo de DESCARGA (ATR ACUMULACIÓN) — variante FUERZA (Perfil 3: runner, poca fuerza). Se MANTIENE intensidad (cargas altas %RM) y se RECORTA volumen. Diferencias de perfil: lunes fuerza inferior INTENSA pero volumen bajo [+], miércoles fuerza-potencia reducida [+], viernes fuerza superior intensa volumen bajo [+], sábado WOD corto de fuerza específica [+]; martes carrera Z2 corta + strides en mantenimiento [=]. Jueves y domingo descanso.',
  sessions: [
    {
      day_of_week: 1,
      day_position: 'monday',
      name: 'Fuerza inferior intensa (poco volumen)',
      format: 'strength_block',
      methodology_group_id: MG.fuerza,
      focus: 'Fuerza inferior intensa, volumen bajo (mantener fuerza)',
      warmup: 'Movilidad + activación cadera/tobillo',
      cooldown: '10\' trote suave',
      capa1: '[+] Fuerza inferior INTENSA pero volumen bajo (mantener fuerza).',
      blocks: [
        {
          title: 'A · Back Squat pesado',
          format: 'strength_block',
          items: [
            item(
              EX.backSquat,
              "3 rounds Back Squat 4/3/2 @80-85% / 3' rest. [DELOAD] mantener fuerza con volumen mínimo.",
              strengthSets([4, 3, 2], { pctRange: [80, 85] }, 180),
            ),
          ],
        },
      ],
    },
    {
      day_of_week: 2,
      day_position: 'tuesday',
      name: 'Carrera Z2 corta + strides',
      format: 'tempo',
      methodology_group_id: MG.zona2,
      focus: 'Carrera Z2 corta + strides (recuperación activa)',
      warmup: 'Movilidad + técnica carrera',
      cooldown: 'Soltar trotando',
      capa1: '[=] Carrera Z2 corta + strides.',
      blocks: [
        {
          title: 'Carrera Z2',
          format: 'tempo',
          items: [item(EX.run, "40' Z2 RPE 3-4. Recuperación activa.", steadyZone(2400, 2))],
        },
        {
          title: 'Strides',
          format: 'intervals',
          items: [item(EX.run, '6×20" strides', strides(6, 20))],
        },
      ],
    },
    {
      day_of_week: 3,
      day_position: 'wednesday',
      name: 'Fuerza-potencia reducida',
      format: 'circuit',
      methodology_group_id: MG.explosiva,
      focus: 'Fuerza-potencia reducida (misma intensidad, menos series)',
      warmup: 'Activación + movilidad torácica/cadera',
      cooldown: 'Movilidad + soltar',
      capa1: '[+] Fuerza-potencia REDUCIDA (misma intensidad, menos series).',
      blocks: [
        {
          title: "A · Fuerza-potencia (4r c/2')",
          format: 'circuit',
          items: [
            item(EX.powerClean, '4 rounds c/2\': 2 Power Clean 78%. [DELOAD] misma intensidad, menos series.', {
              scheme: 'interval',
              rounds: 4,
              work_s: 120,
              sets: [{ measure: { kind: 'reps', value: 2 }, target: { kind: 'percent_rm', value: 78 } }],
            }),
            item(EX.boxJump, '4 rounds c/2\': 4 high box jump', {
              scheme: 'interval',
              rounds: 4,
              work_s: 120,
              sets: [{ measure: { kind: 'reps', value: 4 }, note: 'high box jump' }],
            }),
          ],
        },
      ],
    },
    {
      day_of_week: 5,
      day_position: 'friday',
      name: 'Fuerza superior intensa (poco volumen)',
      format: 'strength_block',
      methodology_group_id: MG.fuerza,
      focus: 'Fuerza superior intensa, volumen bajo + core ligero',
      warmup: 'Movilidad hombro + activación escapular',
      cooldown: '10\' trote suave',
      capa1: '[+] Fuerza superior intensa, volumen bajo.',
      blocks: [
        {
          title: 'A · Shoulder Press pesado',
          format: 'strength_block',
          items: [
            item(EX.overheadPress, '3 rounds Shoulder Press 4/3/2 @80-85%', strengthSets([4, 3, 2], { pctRange: [80, 85] })),
          ],
        },
        {
          title: 'B · Weighted Pull-ups',
          format: 'strength_block',
          items: [item(EX.weightedPullup, '3 rounds Weighted Pull-ups 4/3/3', bodyweightSets([4, 3, 3]))],
        },
        {
          title: 'C · Core ligero',
          format: 'circuit',
          items: [item(EX.tgu, 'Core ligero: Turkish get-up 3×3/lado', bodyweightSets([3, 3, 3]))],
        },
      ],
    },
    {
      day_of_week: 6,
      day_position: 'saturday',
      name: 'WOD corto de fuerza específica',
      format: 'circuit',
      methodology_group_id: MG.wods,
      focus: 'WOD corto de fuerza específica (sled ligero)',
      warmup: 'Activación + movilidad',
      cooldown: 'Movilidad + soltar',
      capa1: '[+] WOD corto de fuerza específica (sled ligero).',
      blocks: [
        {
          title: 'WOD 3 rounds AFAP',
          format: 'circuit',
          items: [
            item(EX.sledPush, 'WOD 3 rounds AFAP: 20m sled push 120kg. Estímulo específico breve.', wodDist(3, 20, 120)),
            item(EX.wallBall, 'WOD 3 rounds AFAP: 10 wall ball', wodReps(3, 10, 9)),
            item(EX.run, 'WOD 3 rounds AFAP: 200m run', wodDist(3, 200)),
          ],
        },
      ],
    },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// WEEK 5 — BALANCED (Semana 5 · cierre de base)
// ════════════════════════════════════════════════════════════════════════════
const w5_balanced: Variant = {
  athlete_profile: 'balanced',
  week_number: 5,
  name: 'Semana 5 — Acumulación · Cierre',
  focus:
    'Microciclo de CARGA — cierre de base (macrociclo ATR ACUMULACIÓN). Último gran estímulo aeróbico-estructural antes de converger hacia Transformación. Lunes fartlek de intensidad creciente (puente a Transformación); martes fuerza empuje + ergómetro de umbral; miércoles WOD chipper de fuerza-resistencia con cargas moderadas; jueves carrera Z2 larga (último gran volumen aeróbico); viernes fuerza piernas + ergómetro de potencia; sábado WOD específico HYROX largo; domingo bike Z1 regenerativo.',
  sessions: [
    {
      day_of_week: 1,
      day_position: 'monday',
      name: 'Fartlek de intensidad creciente',
      format: 'intervals',
      methodology_group_id: MG.running,
      focus: 'Fartlek de intensidad creciente (puente hacia Transformación)',
      warmup: "10' warm up easy + 2' caminando inclinación",
      cooldown: "5' cool down",
      capa1: 'Fartlek de intensidad creciente (puente hacia Transformación).',
      blocks: [
        {
          title: 'Fartlek',
          format: 'intervals',
          items: [
            item(
              EX.run,
              "5×(5' Z4 / 1' Z5). Intensidad creciente, puente hacia Transformación.",
              { scheme: 'interval', rounds: 5, work_s: 300, rest_s: 60, target: { kind: 'hr_zone', min: 4, max: 5 } },
            ),
          ],
        },
      ],
    },
    {
      day_of_week: 2,
      day_position: 'tuesday',
      name: 'Fuerza empuje + Ergo umbral',
      format: 'strength_block',
      methodology_group_id: MG.fuerza,
      focus: 'Fuerza empuje + ergómetro de umbral + core superior',
      warmup: 'Movilidad hombro + activación escapular',
      cooldown: '10\' trote suave',
      capa1: 'Fuerza empuje + ergómetro de umbral.',
      blocks: [
        {
          title: 'A · Bench Press',
          format: 'strength_block',
          items: [
            item(EX.benchPress, "5 rounds Bench Press 10/10/8/6/6 / 2' rest", strengthSets([10, 10, 8, 6, 6], {}, 120)),
          ],
        },
        {
          title: 'B · Row umbral',
          format: 'intervals',
          items: [item(EX.row, "Row 6×3' RPE 8 / 1' rest", intervals(6, 180, 60, { kind: 'rpe', value: 8 }))],
        },
        {
          title: 'C · Core superior accesorio',
          format: 'circuit',
          items: [item(EX.tgu, 'Core tren superior accesorio: Turkish get-up 3×5/lado', bodyweightSets([5, 5, 5]))],
        },
      ],
    },
    {
      day_of_week: 3,
      day_position: 'wednesday',
      name: 'WOD chipper (TC 30\')',
      format: 'for_time',
      methodology_group_id: MG.wods,
      focus: 'WOD chipper de fuerza-resistencia (cargas moderadas)',
      warmup: 'Activación + movilidad',
      cooldown: 'Movilidad + soltar',
      capa1: 'WOD de fuerza-resistencia (chipper) con cargas moderadas.',
      blocks: [
        {
          title: 'Chipper (Time Cap 30\')',
          format: 'for_time',
          items: [
            item(EX.powerClean, '30-25-20-15 Power Clean 40kg', chipper([30, 25, 20, 15], 40)),
            item(EX.thruster, '20-15-10-5 DB Thrusters 22.5kg', chipper([20, 15, 10, 5], 22.5)),
            item(EX.boxJump, '20-15-10-5 high box jump', chipper([20, 15, 10, 5])),
          ],
        },
        {
          title: 'Finisher',
          format: 'for_time',
          items: [
            item(EX.sitUp, 'Finisher: 100 sit-up', { scheme: 'amrap', sets: [{ measure: { kind: 'reps', value: 100 } }] }),
            item(EX.wallBall, 'Finisher: wall ball 9kg', { scheme: 'amrap', sets: [{ measure: { kind: 'reps', value: 100 }, target: { kind: 'kg', value: 9 } }] }),
          ],
        },
      ],
    },
    {
      day_of_week: 4,
      day_position: 'thursday',
      name: 'Carrera Z2 larga',
      format: 'tempo',
      methodology_group_id: MG.zona2,
      focus: 'Carrera Z2 larga (último gran volumen aeróbico)',
      warmup: 'Calentar trotando',
      cooldown: 'Enfriar trotando',
      capa1: 'Carrera Z2 larga (último gran volumen aeróbico).',
      blocks: [
        {
          title: 'Carrera larga Z2',
          format: 'tempo',
          items: [
            item(EX.run, "1h25' Z2 RPE 3-4. Combinar terreno; calentar/enfriar trotando.", steadyZone(5100, 2)),
          ],
        },
      ],
    },
    {
      day_of_week: 5,
      day_position: 'friday',
      name: 'Fuerza piernas + Ergo potencia',
      format: 'strength_block',
      methodology_group_id: MG.fuerza,
      focus: 'Fuerza piernas (front + back squat) + ergómetro de potencia',
      warmup: 'Movilidad + activación cadera/tobillo',
      cooldown: '10\' trote suave',
      capa1: 'Fuerza piernas + ergómetro de potencia.',
      blocks: [
        {
          title: 'A · Front Squat',
          format: 'strength_block',
          items: [item(EX.frontSquat, '3 rounds Front Squat 10/10/8/6', strengthSets([10, 10, 8, 6], {}))],
        },
        {
          title: 'B · Back Squat',
          format: 'strength_block',
          items: [item(EX.backSquat, '3 rounds Back Squat 10/10/8/6', strengthSets([10, 10, 8, 6], {}))],
        },
        {
          title: 'C · Ski potencia',
          format: 'intervals',
          items: [item(EX.ski, "Skierg 6×3' RPE 8 / 1' rest", intervals(6, 180, 60, { kind: 'rpe', value: 8 }))],
        },
      ],
    },
    {
      day_of_week: 6,
      day_position: 'saturday',
      name: 'WOD HYROX largo (AFAP)',
      format: 'hyrox_sim',
      methodology_group_id: MG.simulaciones,
      focus: 'WOD específico HYROX largo (sled + run + estaciones)',
      warmup: 'Activación + movilidad específica',
      cooldown: 'Movilidad + soltar',
      capa1: 'WOD específico HYROX largo (sled+run+estaciones).',
      blocks: [
        {
          title: 'WOD HYROX largo (AFAP)',
          format: 'hyrox_sim',
          items: [
            item(EX.reverseLunge, 'AFAP: 10 reverse lunge 30kg', wodReps(1, 10, 30)),
            item(EX.run, 'AFAP: 300m run (×4 transiciones)', wodDist(4, 300)),
            item(EX.sledPush, 'AFAP: 10m sled push 150kg', wodDist(1, 10, 150)),
            item(EX.sledDrag, 'AFAP: sled drag', wodDist(1, 10)),
            item(EX.bikeAssault, 'AFAP: 20cal AB', wodCal(1, 20)),
            item(EX.boxJump, 'AFAP: box jump', wodReps(1, 10)),
          ],
        },
      ],
    },
    {
      day_of_week: 7,
      day_position: 'saturday', // placeholder; Sunday session has its own slot, no template
      name: 'Bike Z1 regenerativo', // sentinel: Sunday is a real session here (bike Z1 regen)
      format: 'tempo',
      methodology_group_id: MG.zona2,
      focus: 'Bike Z1 regenerativo',
      warmup: '',
      cooldown: 'Movilidad + foam roll',
      capa1: 'Bike Z1 regenerativo.',
      blocks: [
        {
          title: 'Bike Z1 regenerativo',
          format: 'tempo',
          items: [
            item(EX.bike, "1h Z1 RPE 1-2 regenerativo.", steadyZone(3600, 1)),
            item(EX.foamRoll, 'Movilidad + foam roll', steady(600)),
          ],
        },
      ],
    },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// WEEK 5 — ENDURANCE_FOCUS (Res S5 · cierre)
// ════════════════════════════════════════════════════════════════════════════
const w5_endurance: Variant = {
  athlete_profile: 'endurance_focus',
  week_number: 5,
  name: 'Semana 5 — Acumulación · Cierre · Resistencia',
  focus:
    'Microciclo de CARGA — cierre de base (ATR ACUMULACIÓN) — variante RESISTENCIA (Perfil 2: fuerte, poca base aeróbica). Último gran estímulo aeróbico antes de converger. Diferencias de perfil: martes fuerza inferior EN MANTENIMIENTO [=]; se priorizan estímulos aeróbicos [+] — lunes fartlek, miércoles series largas a ritmo objetivo, jueves carrera larga Z2 (último gran volumen), viernes threshold + ergómetros; sábado WOD mixto largo de transición [+]; domingo bike Z1 regenerativo.',
  sessions: [
    {
      day_of_week: 1,
      day_position: 'monday',
      name: 'Fartlek de intensidad',
      format: 'intervals',
      methodology_group_id: MG.running,
      focus: 'Fartlek de intensidad (puente hacia Transformación)',
      warmup: "10' warm up + 2' caminando",
      cooldown: "5' cool down",
      capa1: '[+] Fartlek de intensidad (puente hacia Transformación).',
      blocks: [
        {
          title: 'Fartlek',
          format: 'intervals',
          items: [
            item(EX.run, "5×(5' Z4 / 1' Z5)", { scheme: 'interval', rounds: 5, work_s: 300, rest_s: 60, target: { kind: 'hr_zone', min: 4, max: 5 } }),
          ],
        },
      ],
    },
    {
      day_of_week: 2,
      day_position: 'tuesday',
      name: 'Fuerza inferior mantenimiento + Ergo',
      format: 'strength_block',
      methodology_group_id: MG.fuerza,
      focus: 'Fuerza inferior en mantenimiento + ergómetro de umbral',
      warmup: 'Movilidad + activación cadera/tobillo',
      cooldown: '10\' trote suave',
      capa1: '[=] Fuerza inferior EN MANTENIMIENTO + ergómetro.',
      blocks: [
        {
          title: 'A · Back Squat (mantenimiento)',
          format: 'strength_block',
          items: [item(EX.backSquat, '3 rounds Back Squat 8/6/6 @72-77%', strengthSets([8, 6, 6], { pctRange: [72, 77] }))],
        },
        {
          title: 'B · Row umbral',
          format: 'intervals',
          items: [item(EX.row, "Row 6×3' RPE 8 / 1' rest", intervals(6, 180, 60, { kind: 'rpe', value: 8 }))],
        },
      ],
    },
    {
      day_of_week: 3,
      day_position: 'wednesday',
      name: 'Series largas a ritmo objetivo',
      format: 'intervals',
      methodology_group_id: MG.running,
      focus: 'Series largas de carrera a ritmo objetivo',
      warmup: '2km warm up',
      cooldown: '1km cool down',
      capa1: '[+] SERIES LARGAS de carrera a ritmo objetivo.',
      blocks: [
        {
          title: 'Series 1000m',
          format: 'intervals',
          items: [
            item(EX.run, "5×1000 a ritmo objetivo / 1'30\" rest. Ritmo objetivo = referencia del test de umbral.", distIntervals(5, 1000, 90, 'a ritmo objetivo (test umbral)')),
          ],
        },
      ],
    },
    {
      day_of_week: 4,
      day_position: 'thursday',
      name: 'Carrera larga Z2',
      format: 'tempo',
      methodology_group_id: MG.zona2,
      focus: 'Carrera larga Z2 (último gran volumen aeróbico)',
      warmup: 'Calentar trotando',
      cooldown: 'Enfriar trotando',
      capa1: '[+] CARRERA LARGA Z2 (último gran volumen aeróbico).',
      blocks: [
        {
          title: 'Carrera larga Z2',
          format: 'tempo',
          items: [item(EX.run, "1h30' Z2 RPE 3-4. Último gran bloque aeróbico del macrociclo.", steadyZone(5400, 2))],
        },
      ],
    },
    {
      day_of_week: 5,
      day_position: 'friday',
      name: 'Threshold + Ergómetros',
      format: 'intervals',
      methodology_group_id: MG.ergo,
      focus: 'Threshold (cinta) + ergómetros de umbral',
      warmup: "10' warm up",
      cooldown: "5' cool down",
      capa1: '[+] Threshold + ergómetros de umbral.',
      blocks: [
        {
          title: 'A · Threshold cinta',
          format: 'intervals',
          items: [item(EX.run, "5×6' cinta RPE 8 / 2' rest", intervals(5, 360, 120, { kind: 'rpe', value: 8 }))],
        },
        {
          title: 'B · Ski umbral',
          format: 'intervals',
          items: [item(EX.ski, "Ski 5×3' RPE 8 / 1' rest", intervals(5, 180, 60, { kind: 'rpe', value: 8 }))],
        },
      ],
    },
    {
      day_of_week: 6,
      day_position: 'saturday',
      name: 'WOD mixto largo (TC 50\')',
      format: 'for_time',
      methodology_group_id: MG.wods,
      focus: 'WOD mixto largo (transición a trabajo específico)',
      warmup: 'Activación + movilidad',
      cooldown: 'Movilidad + soltar',
      capa1: '[+] WOD mixto largo (transición a trabajo específico de Transformación).',
      blocks: [
        {
          title: 'WOD A — 3 rounds (TC 50\')',
          format: 'for_time',
          items: [
            item(EX.row, 'WOD A 3 rounds: 500m row', wodDist(3, 500)),
            item(EX.run, 'WOD A 3 rounds: 400m run', wodDist(3, 400)),
            item(EX.wallBall, 'WOD A 3 rounds: 15 wall ball', wodReps(3, 15, 9)),
          ],
        },
        {
          title: 'WOD B — 3 rounds',
          format: 'for_time',
          items: [
            item(EX.ski, 'WOD B 3 rounds: 500m ski', wodDist(3, 500)),
            item(EX.run, 'WOD B 3 rounds: 400m run', wodDist(3, 400)),
            item(EX.burpee, 'WOD B 3 rounds: 10 burpee. Puente al trabajo específico.', wodReps(3, 10)),
          ],
        },
      ],
    },
    {
      day_of_week: 7,
      day_position: 'saturday',
      name: 'Bike Z1 regenerativo',
      format: 'tempo',
      methodology_group_id: MG.zona2,
      focus: 'Bike Z1 regenerativo',
      warmup: '',
      cooldown: 'Movilidad',
      capa1: 'Bike Z1 regenerativo.',
      blocks: [
        {
          title: 'Bike Z1 regenerativo',
          format: 'tempo',
          items: [
            item(EX.bike, "1h Z1 regenerativo.", steadyZone(3600, 1)),
            item(EX.foamRoll, 'Movilidad', steady(600)),
          ],
        },
      ],
    },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// WEEK 5 — STRENGTH_FOCUS (Fue S5 · cierre)
// ════════════════════════════════════════════════════════════════════════════
const w5_strength: Variant = {
  athlete_profile: 'strength_focus',
  week_number: 5,
  name: 'Semana 5 — Acumulación · Cierre · Fuerza',
  focus:
    'Microciclo de CARGA — cierre de fuerza (ATR ACUMULACIÓN) — variante FUERZA (Perfil 3: runner, poca fuerza). Último estímulo de fuerza antes de converger. Diferencias de perfil: lunes fuerza inferior pesada (consolidar) [+], martes fuerza-potencia + WOD HYROX [+], jueves sled pesado + estaciones [+], viernes fuerza superior + core [+], sábado WOD mixto largo de transición [+]; miércoles carrera EN MANTENIMIENTO con estímulo de calidad [=]; domingo bike Z1 regenerativo.',
  sessions: [
    {
      day_of_week: 1,
      day_position: 'monday',
      name: 'Fuerza inferior pesada (consolidar)',
      format: 'strength_block',
      methodology_group_id: MG.fuerza,
      focus: 'Fuerza inferior pesada (consolidar ganancias)',
      warmup: 'Movilidad + activación cadera/tobillo',
      cooldown: '10\' trote suave',
      capa1: '[+] FUERZA INFERIOR pesada (consolidar ganancias).',
      blocks: [
        {
          title: 'A · Back Squat pesado',
          format: 'strength_block',
          items: [
            item(EX.backSquat, "5 rounds Back Squat 6/5/4/4/3 @78-85% / 2'30\"", strengthSets([6, 5, 4, 4, 3], { pctRange: [78, 85] }, 150)),
          ],
        },
        {
          title: 'B · Hip Thrust',
          format: 'strength_block',
          items: [item(EX.hipThrust, '4 rounds Hip Thrust 8/8/6/6', strengthSets([8, 8, 6, 6], {}))],
        },
        {
          title: 'C · RDL',
          format: 'strength_block',
          items: [item(EX.rdl, '3 rounds RDL 8/lado', strengthSets([8, 8, 8], {}))],
        },
      ],
    },
    {
      day_of_week: 2,
      day_position: 'tuesday',
      name: 'Fuerza-potencia + WOD HYROX',
      format: 'circuit',
      methodology_group_id: MG.explosiva,
      focus: 'Fuerza-potencia + WOD específico HYROX',
      warmup: 'Activación + movilidad torácica/cadera',
      cooldown: 'Movilidad + soltar',
      capa1: '[+] FUERZA-POTENCIA + WOD específico HYROX.',
      blocks: [
        {
          title: "A · Fuerza-potencia (5r c/2')",
          format: 'circuit',
          items: [
            item(EX.powerClean, '5 rounds c/2\': 3 Power Clean 75-80%', {
              scheme: 'interval',
              rounds: 5,
              work_s: 120,
              sets: [{ measure: { kind: 'reps', value: 3 }, target: { kind: 'percent_rm', min: 75, max: 80 } }],
            }),
            item(EX.boxJump, '5 rounds c/2\': 5 box jump', {
              scheme: 'interval',
              rounds: 5,
              work_s: 120,
              sets: [{ measure: { kind: 'reps', value: 5 } }],
            }),
          ],
        },
        {
          title: 'B · WOD HYROX (4 rounds)',
          format: 'circuit',
          items: [
            item(EX.sledPush, 'WOD 4 rounds: 25m sled push 170kg', wodDist(4, 25, 170)),
            item(EX.walkingLunge, 'WOD 4 rounds: 10 lunge 30kg', wodReps(4, 10, 30)),
            item(EX.wallBall, 'WOD 4 rounds: 12 wall ball', wodReps(4, 12, 9)),
          ],
        },
      ],
    },
    {
      day_of_week: 3,
      day_position: 'wednesday',
      name: 'Carrera mantenimiento',
      format: 'intervals',
      methodology_group_id: MG.zona2,
      focus: 'Carrera en mantenimiento + estímulo de calidad',
      warmup: '2km warm up',
      cooldown: '1km cool down',
      capa1: '[=] Carrera EN MANTENIMIENTO + algún estímulo de calidad.',
      blocks: [
        {
          title: 'Series 400m (mantenimiento)',
          format: 'intervals',
          items: [
            item(EX.run, "6×400m a ritmo del test / 1' rest. Ritmo del test = referencia almacenada.", distIntervals(6, 400, 60, 'a ritmo del test')),
          ],
        },
      ],
    },
    {
      day_of_week: 4,
      day_position: 'thursday',
      name: 'Sled pesado + Estaciones',
      format: 'circuit',
      methodology_group_id: MG.simulaciones,
      focus: 'Sled pesado + estaciones de fuerza (cierre)',
      warmup: 'Activación + movilidad específica',
      cooldown: 'Movilidad + soltar',
      capa1: '[+] SLED pesado + estaciones de fuerza.',
      blocks: [
        {
          title: 'A · Sled (6 rounds)',
          format: 'circuit',
          items: [
            item(EX.sledPush, '6 rounds: 25m sled push 180kg / 90"', { scheme: 'rounds', rounds: 6, rest_s: 90, sets: [{ measure: { kind: 'distance', meters: 25 }, target: { kind: 'kg', value: 180 } }] }),
            item(EX.sledPull, '6 rounds: 25m sled pull 155kg / 90"', { scheme: 'rounds', rounds: 6, rest_s: 90, sets: [{ measure: { kind: 'distance', meters: 25 }, target: { kind: 'kg', value: 155 } }] }),
          ],
        },
        {
          title: 'B · Estaciones (4 rounds)',
          format: 'circuit',
          items: [
            item(EX.farmerCarry, '4 rounds: 25m farmer carry 2×34kg', wodDist(4, 25, 34)),
            item(EX.sandbagClean, '4 rounds: 10 sandbag clean 32kg', wodReps(4, 10, 32)),
          ],
        },
      ],
    },
    {
      day_of_week: 5,
      day_position: 'friday',
      name: 'Fuerza superior + Core',
      format: 'strength_block',
      methodology_group_id: MG.fuerza,
      focus: 'Fuerza superior + core',
      warmup: 'Movilidad hombro + activación escapular',
      cooldown: '10\' trote suave',
      capa1: '[+] FUERZA SUPERIOR + core.',
      blocks: [
        {
          title: 'A · Shoulder Press',
          format: 'strength_block',
          items: [item(EX.overheadPress, '5 rounds Shoulder Press 8/6/6/4/4 @74-84%', strengthSets([8, 6, 6, 4, 4], { pctRange: [74, 84] }))],
        },
        {
          title: 'B · Pull-ups + Dips',
          format: 'circuit',
          items: [
            item(EX.pullup, '5 rounds Pull-ups 10-8-8-6-6', bodyweightSets([10, 8, 8, 6, 6])),
            item(EX.dip, '5 rounds Dips 10-8-8-6-6', bodyweightSets([10, 8, 8, 6, 6])),
          ],
        },
        {
          title: 'C · Core',
          format: 'circuit',
          items: [item(EX.tgu, 'Core: Turkish get-up 4×4/lado', bodyweightSets([4, 4, 4, 4]))],
        },
      ],
    },
    {
      day_of_week: 6,
      day_position: 'saturday',
      name: 'WOD mixto largo (TC 50\')',
      format: 'for_time',
      methodology_group_id: MG.wods,
      focus: 'WOD mixto largo (transición a trabajo específico)',
      warmup: 'Activación + movilidad',
      cooldown: 'Movilidad + soltar',
      capa1: '[+] WOD mixto largo (transición a trabajo específico de Transformación).',
      blocks: [
        {
          title: 'WOD A — 3 rounds (TC 50\')',
          format: 'for_time',
          items: [
            item(EX.sledPush, 'WOD A 3 rounds: 25m sled push 150kg', wodDist(3, 25, 150)),
            item(EX.wallBall, 'WOD A 3 rounds: 15 wall ball', wodReps(3, 15, 9)),
            item(EX.run, 'WOD A 3 rounds: 300m run', wodDist(3, 300)),
          ],
        },
        {
          title: 'WOD B — 3 rounds',
          format: 'for_time',
          items: [
            item(EX.burpeeBroadJump, 'WOD B 3 rounds: 12 burpee broad jump', wodReps(3, 12)),
            item(EX.walkingLunge, 'WOD B 3 rounds: 10 lunge 30kg', wodReps(3, 10, 30)),
            item(EX.run, 'WOD B 3 rounds: 300m run. Puente al trabajo específico.', wodDist(3, 300)),
          ],
        },
      ],
    },
    {
      day_of_week: 7,
      day_position: 'saturday',
      name: 'Bike Z1 regenerativo',
      format: 'tempo',
      methodology_group_id: MG.zona2,
      focus: 'Bike Z1 regenerativo',
      warmup: '',
      cooldown: 'Movilidad',
      capa1: 'Bike Z1 regenerativo.',
      blocks: [
        {
          title: 'Bike Z1 regenerativo',
          format: 'tempo',
          items: [
            item(EX.bike, "1h Z1 regenerativo.", steadyZone(3600, 1)),
            item(EX.foamRoll, 'Movilidad', steady(600)),
          ],
        },
      ],
    },
  ],
};

const VARIANTS: Variant[] = [
  w4_balanced,
  w4_endurance,
  w4_strength,
  w5_balanced,
  w5_endurance,
  w5_strength,
];

// ── AUTO-QA: validate every prescription against the real Zod schema ────────
function validateAll(): void {
  let n = 0;
  for (const v of VARIANTS) {
    for (const s of v.sessions) {
      for (const b of s.blocks) {
        for (const it of b.items) {
          const r = prescriptionSchema.safeParse(it.prescription);
          if (!r.success) {
            throw new Error(
              `INVALID prescription [${v.name} · ${s.name} · ${b.title} · ex ${it.exercise_id}]: ${r.error.message}`,
            );
          }
          n++;
        }
      }
    }
  }
  console.log(`✓ ${n} prescriptions validated against Zod schema`);
}

// Build the slots_json for a variant (EXACT shape of pwt 51). day_of_week 7 with
// the __SUNDAY_BIKE__ sentinel becomes a real Sunday session; otherwise Sunday is
// an empty rest day.
function buildSlotsJson(
  v: Variant,
  templateIdByDow: Map<number, number>,
  exerciseNames: Map<number, string>,
): unknown {
  const days: unknown[] = [];
  for (let dow = 1; dow <= 7; dow++) {
    const session = v.sessions.find((s) => s.day_of_week === dow);
    if (!session) {
      days.push({ day_of_week: dow, sessions: [] });
      continue;
    }
    days.push({
      day_of_week: dow,
      sessions: [
        {
          kind: 'workout',
          focus: session.focus,
          notes: `CAPA1 — ${session.capa1}`,
          template_id: templateIdByDow.get(dow)!,
          blocks: session.blocks.map((b) => ({
            title: b.title,
            format: b.format,
            config_json: {},
            items: b.items.map((it) => ({
              notes: it.notes,
              exercise_id: it.exercise_id,
              // exercise_name is single-sourced from the catalog (parity with
              // week-1 slots, which all carry it for join-free display).
              exercise_name: exerciseNames.get(it.exercise_id) ?? '',
              params_json: it.params_json,
            })),
          })),
        },
      ],
    });
  }
  return { days };
}

async function main() {
  validateAll();

  const sql = getSql();
  try {
    await sql.begin(async (tx) => {
      // Idempotency: remove prior week-4/5 program week templates + their session
      // templates (deterministic names) so a re-run is clean.
      const weekNames = VARIANTS.map((v) => v.name);
      const oldWeeks = await tx<{ id: number }[]>`
        select id from program_week_templates
        where coach_id = ${COACH_ID} and name = any(${weekNames})
      `;
      if (oldWeeks.length > 0) {
        await tx`delete from program_week_templates where id = any(${oldWeeks.map((r) => r.id)})`;
      }

      // Session template names we own (variant week + day_position) — drop them so
      // their template_segments cascade-delete, then re-create fresh.
      const sessionNames: string[] = [];
      for (const v of VARIANTS) {
        for (const s of v.sessions) {
          sessionNames.push(sessionTemplateName(v, s));
        }
      }
      await tx`
        delete from templates
        where coach_id = ${COACH_ID} and name = any(${sessionNames})
      `;

      // Single-source exercise display names from the catalog (for slots_json
      // exercise_name parity with week 1). Fail loud if any id is missing.
      const usedIds = Array.from(
        new Set(VARIANTS.flatMap((v) => v.sessions.flatMap((s) => s.blocks.flatMap((b) => b.items.map((it) => it.exercise_id))))),
      );
      const exRows = await tx<{ id: number; name: string }[]>`
        select id, name from exercises where id = any(${usedIds})
      `;
      const exerciseNames = new Map(exRows.map((r) => [Number(r.id), r.name]));
      const missing = usedIds.filter((id) => !exerciseNames.has(id));
      if (missing.length > 0) {
        throw new Error(`exercise ids not found in catalog: ${missing.join(', ')}`);
      }

      let totalSegments = 0;

      for (const v of VARIANTS) {
        const templateIdByDow = new Map<number, number>();

        for (const s of v.sessions) {
          // Insert the session template.
          const [tpl] = await tx<{ id: number }[]>`
            insert into templates
              (coach_id, name, format, target_block, day_position,
               methodology_group_id, warmup, cooldown, coach_notes)
            values
              (${COACH_ID}, ${sessionTemplateName(v, s)}, ${s.format}, ${TARGET_BLOCK},
               ${s.day_position}, ${s.methodology_group_id}, ${s.warmup}, ${s.cooldown},
               ${`CAPA1 — ${s.capa1}`})
            returning id
          `;
          templateIdByDow.set(s.day_of_week, tpl!.id);

          // Insert its segments (one row per item; block_position increments per
          // block; position is global within the template).
          let position = 0;
          let blockPosition = 0;
          for (const b of s.blocks) {
            for (const it of b.items) {
              await tx`
                insert into template_segments
                  (template_id, position, exercise_id, params_json, notes,
                   block_position, block_format, block_title, prescription_json)
                values
                  (${tpl!.id}, ${position}, ${it.exercise_id},
                   ${tx.json(it.params_json)}, ${it.notes}, ${blockPosition},
                   ${b.format}, ${b.title}, ${tx.json(it.prescription as never)})
              `;
              position++;
              totalSegments++;
            }
            blockPosition++;
          }
        }

        // Insert the program_week_template carrying the slots_json.
        const slots = buildSlotsJson(v, templateIdByDow, exerciseNames);
        await tx`
          insert into program_week_templates
            (coach_id, name, level, atr_block_hint, athlete_profile, week_number,
             focus, slots_json)
          values
            (${COACH_ID}, ${v.name}, ${LEVEL}, ${ATR}, ${v.athlete_profile},
             ${v.week_number}, ${v.focus}, ${tx.json(slots as never)})
        `;
      }

      console.log(`✓ inserted ${VARIANTS.length} program_week_templates`);
      console.log(`✓ inserted ${totalSegments} template_segments`);
    });
  } finally {
    await sql.end();
  }
}

// Deterministic session-template name: "<week name> · <Day>" so it is unique per
// variant + weekday and idempotent across runs.
const DOW_LABEL: Record<number, string> = {
  1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 7: 'Dom',
};
function sessionTemplateName(v: Variant, s: Session): string {
  return `${v.name} · ${DOW_LABEL[s.day_of_week]} · ${s.name}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
