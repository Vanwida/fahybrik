import { describe, expect, it } from 'vitest';
import { buildAssignmentDetail } from '@/lib/athlete/assignment-detail';
import { EXERCISE_TO_1RM_BENCHMARK } from '@fahybrid/shared/domain/strength';
import { flattenSegments } from '@fahybrid/shared/domain/prescription';
import type { AthleteAnchors } from '@fahybrid/shared/domain/prescription/resolve-relative';

const SQ_1RM = EXERCISE_TO_1RM_BENCHMARK['back-squat']!; // 'back_squat_1rm'

const baseAssignment = {
  id: '101',
  athlete_id: '42',
  scheduled_for: '2026-05-27',
  status: 'scheduled' as const,
  notes: null,
  template_id: '500',
  template_version: 1,
  partner_visibility: 'shared' as const,
};

const baseTemplate = {
  id: '500',
  name: 'Heavy Sled Day',
  format: 'strength_block',
  warmup: null,
  cooldown: null,
  coach_notes: 'Mantén la cadera baja en sled push.',
  meta_json: null,
};

describe('athlete/assignment-detail · buildAssignmentDetail', () => {
  it('returns workout=null when the template is missing', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: null,
      segments: [],
    });
    expect(result.workout).toBeNull();
    expect(result.assignment.id).toBe('101');
    expect(result.assignment.template_id).toBe('500');
    expect(result.assignment.status).toBe('scheduled');
    expect(result.assignment.completed_at).toBeNull();
    expect(result.assignment.perceived_exertion).toBeNull();
  });

  it('returns workout=null when the template has ZERO renderable blocks (root fix)', () => {
    // A template that exists but resolves to no segments must NOT emit the
    // pathological `workout = { …, blocks: [] }` shape — the single root cause of
    // the cross-view inconsistency (brief "Sin detalle" / list "Sin ejercicios" /
    // done-detail rendering from execution). It must collapse to workout=null so
    // every iOS surface shows the same honest rest/empty state.
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [],
    });
    expect(result.workout).toBeNull();
  });

  it('keeps the execution block on an empty-blocks completed day (done-detail survives)', () => {
    // The empty-blocks → null collapse must NOT strip the executed result: a
    // completed day with no prescription segments still shows its done-detail.
    const result = buildAssignmentDetail({
      assignment: { ...baseAssignment, status: 'completed' as const },
      execution: { ended_at: '2026-05-27T10:00:00Z', perceived_exertion: 7 },
      template: baseTemplate,
      segments: [],
    });
    expect(result.workout).toBeNull();
    expect(result.execution).not.toBeNull();
    expect(result.execution?.completeness).toBe('completed');
    expect(result.execution?.perceived_exertion).toBe(7);
  });

  it('parses am/pm slot from assignment notes', () => {
    const pm = buildAssignmentDetail({
      assignment: { ...baseAssignment, notes: 'slot:pm' },
      execution: null,
      template: null,
      segments: [],
    });
    expect(pm.assignment.slot).toBe('pm');

    const am = buildAssignmentDetail({
      assignment: { ...baseAssignment, notes: 'am session' },
      execution: null,
      template: null,
      segments: [],
    });
    expect(am.assignment.slot).toBe('am');

    const nothing = buildAssignmentDetail({
      assignment: { ...baseAssignment, notes: 'random note' },
      execution: null,
      template: null,
      segments: [],
    });
    expect(nothing.assignment.slot).toBeNull();
  });

  it('groups segments into blocks ordered by block_position', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [
        {
          id: '10',
          position: 0,
          block_position: 1,
          block_format: 'amrap',
          block_title: 'AMRAP 12',
          params_json: { reps: 10 },
          prescription_json: null,
          notes: null,
          exercise_id: '900',
          exercise_name: 'Wall Ball',
          exercise_slug: 'wall-ball',
          exercise_category: 'hyrox_station',
          exercise_video_url: null,
          exercise_cues: null,
          exercise_description: null,
        },
        {
          id: '11',
          position: 0,
          block_position: 0,
          block_format: null,
          block_title: null,
          params_json: { sets: 3, reps: 5, weight_kg: 100 },
          prescription_json: null,
          notes: 'Cinturón opcional',
          exercise_id: '901',
          exercise_name: 'Back Squat',
          exercise_slug: 'back-squat',
          exercise_category: 'strength',
          exercise_video_url: 'https://yt/back-squat',
          exercise_cues: 'Pecho arriba',
          exercise_description: null,
        },
      ],
    });

    expect(result.workout).not.toBeNull();
    const blocks = result.workout!.blocks;
    expect(blocks.length).toBe(2);

    // Block 0 (no override → falls back to template.format, title to "Bloque 1")
    expect(blocks[0]!.block_position).toBe(0);
    expect(blocks[0]!.format).toBe('strength_block');
    expect(blocks[0]!.title).toBe('Bloque 1');
    expect(blocks[0]!.items.length).toBe(1);
    expect(blocks[0]!.items[0]!.exercise_slug).toBe('back-squat');
    expect(blocks[0]!.items[0]!.cues).toBe('Pecho arriba');

    // Block 1 (override → amrap / "AMRAP 12")
    expect(blocks[1]!.block_position).toBe(1);
    expect(blocks[1]!.format).toBe('amrap');
    expect(blocks[1]!.title).toBe('AMRAP 12');
    expect(blocks[1]!.items[0]!.exercise_slug).toBe('wall-ball');
  });

  it('falls back the single-block title to the template name', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [
        {
          id: '20',
          position: 0,
          block_position: 0,
          block_format: null,
          block_title: null,
          params_json: { sets: 5, reps: 5 },
          prescription_json: null,
          notes: null,
          exercise_id: '902',
          exercise_name: 'Deadlift',
          exercise_slug: 'deadlift',
          exercise_category: 'strength',
          exercise_video_url: null,
          exercise_cues: null,
          exercise_description: null,
        },
      ],
    });
    expect(result.workout!.blocks[0]!.title).toBe('Heavy Sled Day');
  });

  it('normalizes DB segment params to the wire shape', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [
        {
          id: '30',
          position: 0,
          block_position: 0,
          block_format: null,
          block_title: null,
          params_json: {
            sets: 4,
            reps: 8,
            weight_kg: 80,
            weight_pct_1rm: 70,
            rpe: 8,
            rest_seconds: 120,
            time_seconds: 60,
            distance_meters: 1000,
            pace_sec_per_km: 270,
            hr_zone: 4,
            // extra garbage that must NOT show up
            unknown_field: 'noise',
            stringy_number: '5',
          },
          prescription_json: null,
          notes: null,
          exercise_id: '903',
          exercise_name: 'Run',
          exercise_slug: 'run',
          exercise_category: 'cardio',
          exercise_video_url: null,
          exercise_cues: null,
          exercise_description: null,
        },
      ],
    });

    const p = result.workout!.blocks[0]!.items[0]!.params_json;
    expect(p.sets).toBe(4);
    expect(p.reps).toBe(8);
    expect(p.load_kg).toBe(80);
    expect(p.load_pct).toBe(70);
    expect(p.rpe).toBe(8);
    expect(p.rest_seconds).toBe(120);
    expect(p.duration_seconds).toBe(60);
    expect(p.distance_meters).toBe(1000);
    expect(p.distance_km).toBe(1);
    expect(p.pace_sec_per_km).toBe(270);
    expect(p.hr_zone).toBe(4);
    // Unknown / non-numeric fields must be dropped.
    expect(Object.keys(p)).not.toContain('unknown_field');
    expect(Object.keys(p)).not.toContain('stringy_number');
  });

  it('derives rich params from prescription_json when the thin params are bare', () => {
    // The bug: the thin params_json carries only `{sets:4}`, but the real
    // targets live in prescription_json. The loader must surface reps/load from
    // the structured prescription, not the bare scalar bag.
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [
        {
          id: '40',
          position: 0,
          block_position: 0,
          block_format: null,
          block_title: null,
          // Bare — what the buggy path used to expose.
          params_json: { sets: 4 },
          // Rich — uniform reps 8 @ 75% across 4 sets.
          prescription_json: {
            scheme: 'sets',
            sets: [
              { measure: { kind: 'reps', value: 8 }, target: { kind: 'percent_rm', value: 75 } },
              { measure: { kind: 'reps', value: 8 }, target: { kind: 'percent_rm', value: 75 } },
              { measure: { kind: 'reps', value: 8 }, target: { kind: 'percent_rm', value: 75 } },
              { measure: { kind: 'reps', value: 8 }, target: { kind: 'percent_rm', value: 75 } },
            ],
          },
          notes: null,
          exercise_id: '904',
          exercise_name: 'Bench Press',
          exercise_slug: 'bench-press',
          exercise_category: 'strength',
          exercise_video_url: null,
          exercise_cues: null,
          exercise_description: null,
        },
      ],
    });

    const item = result.workout!.blocks[0]!.items[0]!;
    expect(item.params_json.sets).toBe(4);
    expect(item.params_json.reps).toBe(8); // recovered from prescription
    expect(item.params_json.load_pct).toBe(75); // recovered from prescription
    // The structured form is passed through verbatim for iOS.
    expect(item.prescription_json).not.toBeNull();
    expect(item.prescription_json!.sets?.length).toBe(4);
  });

  it('derives distance_meters + hr_zone from a steady/interval prescription', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [
        // Steady Z2 run — params bare, zone only in prescription.
        {
          id: '41',
          position: 0,
          block_position: 0,
          block_format: null,
          block_title: null,
          params_json: { time_seconds: 3000 },
          prescription_json: {
            scheme: 'steady',
            total_s: 3000,
            target: { kind: 'hr_zone', value: 2 },
          },
          notes: null,
          exercise_id: '905',
          exercise_name: 'Run',
          exercise_slug: 'run',
          exercise_category: 'cardio',
          exercise_video_url: null,
          exercise_cues: null,
          exercise_description: null,
        },
        // 8×400m intervals — distance only in prescription set measures.
        {
          id: '42',
          position: 1,
          block_position: 0,
          block_format: null,
          block_title: null,
          params_json: { sets: 8, rest_seconds: 60 },
          prescription_json: {
            scheme: 'interval',
            rounds: 8,
            rest_s: 60,
            sets: Array.from({ length: 8 }, () => ({
              measure: { kind: 'distance', meters: 400 },
            })),
          },
          notes: null,
          exercise_id: '906',
          exercise_name: 'Run',
          exercise_slug: 'run',
          exercise_category: 'cardio',
          exercise_video_url: null,
          exercise_cues: null,
          exercise_description: null,
        },
      ],
    });

    const items = result.workout!.blocks[0]!.items;
    expect(items[0]!.params_json.hr_zone).toBe(2);
    expect(items[0]!.params_json.duration_seconds).toBe(3000);
    expect(items[1]!.params_json.distance_meters).toBe(400);
    expect(items[1]!.params_json.distance_km).toBe(0.4);
    expect(items[1]!.params_json.sets).toBe(8);
  });

  it('accepts the legacy distance_m alias in the scalar fallback path', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [
        {
          id: '43',
          position: 0,
          block_position: 0,
          block_format: null,
          block_title: null,
          // No prescription → scalar fallback. Stored key is `distance_m`,
          // which the iOS consumer reads as `distance_meters`.
          params_json: { sets: 4, distance_m: 1000, rest_seconds: 90 },
          prescription_json: null,
          notes: null,
          exercise_id: '907',
          exercise_name: 'Rowing',
          exercise_slug: 'rowing',
          exercise_category: 'cardio',
          exercise_video_url: null,
          exercise_cues: null,
          exercise_description: null,
        },
      ],
    });
    const p = result.workout!.blocks[0]!.items[0]!.params_json;
    expect(p.distance_meters).toBe(1000);
    expect(p.distance_km).toBe(1);
  });

  it('surfaces completed_at + perceived_exertion from the execution row', () => {
    const result = buildAssignmentDetail({
      assignment: { ...baseAssignment, status: 'completed' as const },
      execution: { ended_at: '2026-05-27T18:30:00+00:00', perceived_exertion: 7 },
      template: baseTemplate,
      segments: [],
    });
    expect(result.assignment.completed_at).toBe('2026-05-27T18:30:00+00:00');
    expect(result.assignment.perceived_exertion).toBe(7);
  });

  it('surfaces the outdoor route polyline from the execution row (#64), null when absent', () => {
    const polyline = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const withRoute = buildAssignmentDetail({
      assignment: { ...baseAssignment, status: 'completed' as const },
      execution: { ended_at: '2026-05-27T18:30:00+00:00', perceived_exertion: 7, route_polyline: polyline },
      template: baseTemplate,
      segments: [],
    });
    const rp: string | null = withRoute.execution!.route_polyline; // type pinned string | null
    expect(rp).toBe(polyline);

    const noRoute = buildAssignmentDetail({
      assignment: { ...baseAssignment, status: 'completed' as const },
      execution: { ended_at: '2026-05-27T18:30:00+00:00', perceived_exertion: 7 },
      template: baseTemplate,
      segments: [],
    });
    expect(noRoute.execution!.route_polyline).toBeNull(); // absent → null, never fabricated
  });

  // The execution block returns what the athlete's session actually holds. Each
  // of these columns has been WRITTEN for a while and never came back on the
  // wire, so no surface could show it: the app said «A mano» over a live PM5
  // session (source alone cannot tell those apart — recorded_via can), and the
  // post-workout feedback the athlete typed vanished the moment they saved it.
  it('returns the provenance pair + the post-workout feedback', () => {
    const result = buildAssignmentDetail({
      assignment: { ...baseAssignment, status: 'completed' as const },
      execution: {
        ended_at: '2026-05-27T18:30:00+00:00',
        perceived_exertion: 7,
        source: 'concept2',
        recorded_via: 'live',
        contributing_sources: ['concept2', 'treadmill'],
        perceived_difficulty: 'too_hard',
        pain_area: 'rodilla',
        pain_note: 'molestia al bajar',
      },
      template: baseTemplate,
      segments: [],
    });
    const e = result.execution!;
    expect(e.source).toBe('concept2'); // WHICH apparatus
    expect(e.recorded_via).toBe('live'); // HOW it was recorded — a different question
    expect(e.contributing_sources).toEqual(['concept2', 'treadmill']);
    expect(e.perceived_difficulty).toBe('too_hard');
    expect(e.pain_area).toBe('rodilla');
    expect(e.pain_note).toBe('molestia al bajar');
  });

  // started_at + las tres columnas de la 0154 (measured-header.ts) tenían el
  // MISMO problema que la provenance de arriba: la fila las lleva, la
  // consulta las selecciona (started_at, para anclar la traza) o no las
  // selecciona en absoluto (las tres de la 0154), y ninguna llegaba al
  // execution block. `started_at` es el ancla temporal que necesita
  // `display_curve.offsets_s` para situar un tramo en el eje — sin ella no
  // hay sombra de serie ni franja de lo pedido que pintar.
  it('surfaces started_at (el ancla de la curva) y las tres columnas de la 0154, presentes o ausentes', () => {
    const withAll = buildAssignmentDetail({
      assignment: { ...baseAssignment, status: 'completed' as const },
      execution: {
        ended_at: '2026-05-27T18:30:00+00:00',
        started_at: '2026-05-27T18:00:00+00:00',
        perceived_exertion: 7,
        elevation_gain_m: 42.5,
        elevation_loss_m: 38.1,
        hr_recovery_60_bpm: 23,
        decoupling_pct: 4.7,
      },
      template: baseTemplate,
      segments: [],
    });
    const e = withAll.execution!;
    expect(e.started_at).toBe('2026-05-27T18:00:00+00:00');
    expect(e.elevation_gain_m).toBe(42.5);
    expect(e.elevation_loss_m).toBe(38.1);
    expect(e.hr_recovery_60_bpm).toBe(23);
    expect(e.decoupling_pct).toBe(4.7);

    const withNone = buildAssignmentDetail({
      assignment: { ...baseAssignment, status: 'completed' as const },
      execution: { ended_at: '2026-05-27T18:30:00+00:00', perceived_exertion: 7 },
      template: baseTemplate,
      segments: [],
    });
    const n = withNone.execution!;
    expect(n.started_at).toBeNull();
    expect(n.elevation_gain_m).toBeNull();
    expect(n.elevation_loss_m).toBeNull();
    expect(n.hr_recovery_60_bpm).toBeNull();
    expect(n.decoupling_pct).toBeNull();
  });

  // numeric(x,y) llega de Postgres como STRING (pg preserva la precisión
  // decimal) — la coerción tiene que sobrevivir eso o rompe en producción
  // aunque el fixture con números JS ya diera verde.
  it('coacciona numeric(x,y) desde string — como llega realmente de Postgres', () => {
    const result = buildAssignmentDetail({
      assignment: { ...baseAssignment, status: 'completed' as const },
      execution: {
        ended_at: '2026-05-27T18:30:00+00:00',
        perceived_exertion: 7,
        elevation_gain_m: '42.50' as unknown as number,
        decoupling_pct: '4.70' as unknown as number,
      },
      template: baseTemplate,
      segments: [],
    });
    const e = result.execution!;
    expect(e.elevation_gain_m).toBe(42.5);
    expect(e.decoupling_pct).toBe(4.7);
  });

  it('leaves provenance unknown for pre-0144 rows, and never returns a null roster', () => {
    const result = buildAssignmentDetail({
      assignment: { ...baseAssignment, status: 'completed' as const },
      execution: { ended_at: '2026-05-27T18:30:00+00:00', perceived_exertion: 7 },
      template: baseTemplate,
      segments: [],
    });
    const e = result.execution!;
    expect(e.recorded_via).toBeNull(); // "no se sabe" — honest, never guessed
    expect(e.contributing_sources).toEqual([]); // a set is empty, never null
    expect(e.perceived_difficulty).toBeNull();
    expect(e.pain_area).toBeNull();
    expect(e.pain_note).toBeNull();
  });

  // ── G1 — zone target resolved to an absolute pace band ────────────────────
  // A run zone profile: threshold 4:00/km (240s); the standard per_km offsets
  // give Z4 = +[0,14] → 4:00–4:14, Z2 = +[28,42] → 4:28–4:42, Z1 = +44 open.
  // Built as a stored snapshot the way the resolver/test-result endpoint writes.
  function runProfile(threshold_s: number) {
    const offsets = [
      { code: 'Z1', role: 'recovery', sort: 1, lo: 44, hi: null },
      { code: 'Z2', role: 'aerobic_base', sort: 2, lo: 28, hi: 42 },
      { code: 'Z3', role: 'aerobic_threshold', sort: 3, lo: 16, hi: 26 },
      { code: 'Z4', role: 'threshold', sort: 4, lo: 0, hi: 14 },
      { code: 'Z5', role: 'vo2max', sort: 5, lo: -6, hi: -2 },
      { code: 'Z6', role: 'sprint', sort: 6, lo: -14, hi: -8 },
    ] as const;
    return {
      id: 1,
      athlete_id: 42,
      modality: 'run' as const,
      threshold_s,
      pace_unit: 'per_km' as const,
      source_test_slug: null,
      source_benchmark_id: null,
      source: 'coach_test' as const,
      needs_review: false,
      version: 1,
      recorded_at: '2026-05-20T10:00:00.000Z',
      created_at: '2026-05-20T10:00:00.000Z',
      zones_json: offsets.map((o) => ({
        code: o.code,
        label: o.code,
        color: '#000000',
        role: o.role,
        sort_order: o.sort,
        fast_s: threshold_s + o.lo,
        slow_s: o.hi === null ? null : threshold_s + o.hi,
      })),
    };
  }

  const runSeg = (target: unknown) => ({
    id: '60',
    position: 0,
    block_position: 0,
    block_format: null,
    block_title: null,
    params_json: { time_seconds: 1800 },
    prescription_json: { scheme: 'steady', modality: 'run', total_s: 1800, target },
    notes: null,
    exercise_id: '950',
    exercise_name: 'Run',
    exercise_slug: 'run',
    exercise_category: 'cardio',
    exercise_video_url: null,
    exercise_cues: null,
    exercise_description: null,
  });

  it('resolves a @Z4 run target to the absolute pace band from the profile', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [runSeg({ kind: 'hr_zone', value: 4 })],
      zoneProfiles: [runProfile(240)],
    });
    const item = result.workout!.blocks[0]!.items[0]!;
    expect(item.params_json.hr_zone).toBe(4); // badge kept
    expect(item.resolved_intensity).not.toBeNull();
    expect(item.resolved_intensity!.zone_label).toBe('Z4');
    expect(item.resolved_intensity!.range_label).toBe('4:00–4:14/km');
    expect(item.resolved_intensity!.fast_s).toBe(240);
    expect(item.resolved_intensity!.slow_s).toBe(254);
    expect(item.resolved_intensity!.pace_unit).toBe('per_km');
  });

  // #71 — el veredicto de cumplimiento (band vs ejecutado) lo lee el ATLETA
  // primero: es el sujeto que Alex eligió para la pantalla de después de
  // correr. Se computa DENTRO de buildAssignmentDetail (un solo motor,
  // shared/domain/adherence vía web/lib/dashboard/coach/run-compliance) —
  // este test fija que el atleta lo recibe, no sólo el coach.
  it('surfaces run_compliance (#71) — el atleta ve si clavó el objetivo, no sólo el coach', () => {
    const actual = {
      position: 0,
      item_uid: 'segment-60',
      modality: 'run' as const,
      started_at: '2026-05-27T18:00:00Z',
      duration_seconds: 245,
      reps_completed: null,
      weight_used_kg: null,
      distance_meters: 1000,
      avg_pace_s_per_500m: null,
      avg_pace_s_per_km: 245, // dentro de la banda 240-254 resuelta abajo
      avg_power_w: null,
      stroke_rate_spm: null,
      avg_hr: null,
      max_hr: null,
      calories: null,
      emom_rounds_completed: null,
      emom_rounds_prescribed: null,
      incline_pct: null,
      avg_gradient_pct: null,
      run_cadence_spm: null,
      drag_factor: null,
      avg_calories_per_hour: null,
      peak_drive_force_lbs: null,
      avg_drive_force_lbs: null,
      erg_splits: null,
      run_splits: null,
      source: null,
      zone_seconds: null,
      leg_index: null,
      leg_role: null,
      leg_phase: null,
      is_structural: false,
      sets: [],
    };
    const result = buildAssignmentDetail({
      assignment: { ...baseAssignment, status: 'completed' as const },
      execution: { ended_at: '2026-05-27T18:30:00Z', perceived_exertion: 6 },
      template: baseTemplate,
      segments: [runSeg({ kind: 'hr_zone', value: 4 })],
      zoneProfiles: [runProfile(240)],
      executionSegments: [actual],
    });
    expect(result.run_compliance.summary).toMatchObject({ total: 1, evaluable: 1, dentro: 1, pct_dentro: 100 });
    expect(result.run_compliance.tramos[0]).toMatchObject({
      item_uid: 'segment-60',
      verdict: 'dentro',
      band_axis: 'pace',
      band: { axis: 'pace', fast_s: 240, slow_s: 254 },
    });
  });

  it('sesión sin nada que juzgar: run_compliance vacío y declarado, nunca un veredicto inventado', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [], // sin plantilla con contenido → workout: null
    });
    expect(result.workout).toBeNull();
    expect(result.run_compliance).toEqual({
      summary: { total: 0, evaluable: 0, dentro: 0, fuera_rapido: 0, fuera_lento: 0, sin_dato: 0, pct_dentro: null },
      tramos: [],
      recovery_summary: { total: 0, evaluable: 0, controlada: 0, demasiado_rapida: 0, sin_dato: 0, pct_controlada: null },
      recovery_tramos: [],
      work_duration_summary: { total: 0, evaluable: 0, completa: 0, incompleta: 0, sin_dato: 0, pct_completa: null },
      recovery_duration_summary: { total: 0, evaluable: 0, controlada: 0, excedida: 0, sin_dato: 0, pct_controlada: null },
      // Sin umbral resuelto por el llamador: NULL, «usa tu suelo». Nunca un 3
      // inventado aquí — un coach de trail vería el suyo en una pantalla y el
      // nuestro en otra.
      gradient_retires_pace_pct: null,
    });
  });

  it('resolves a @Z1 open band to "> fast/km"', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [runSeg({ kind: 'hr_zone', value: 1 })],
      zoneProfiles: [runProfile(240)],
    });
    const ri = result.workout!.blocks[0]!.items[0]!.resolved_intensity!;
    expect(ri.range_label).toBe('> 4:44/km');
    expect(ri.slow_s).toBeNull();
  });

  it('resolves a Z2–Z4 zone SPAN to the union band (fast of Z4, slow of Z2)', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [runSeg({ kind: 'hr_zone', min: 2, max: 4 })],
      zoneProfiles: [runProfile(240)],
    });
    const ri = result.workout!.blocks[0]!.items[0]!.resolved_intensity!;
    expect(ri.zone_label).toBe('Z2–Z4');
    expect(ri.fast_s).toBe(240); // Z4 fast edge
    expect(ri.slow_s).toBe(282); // Z2 slow edge (240+42)
    expect(ri.range_label).toBe('4:00–4:42/km');
  });

  it('keeps only the zone badge (no resolved pace) when the athlete has no profile', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [runSeg({ kind: 'hr_zone', value: 4 })],
      zoneProfiles: [], // no test yet
    });
    const item = result.workout!.blocks[0]!.items[0]!;
    expect(item.params_json.hr_zone).toBe(4);
    expect(item.resolved_intensity).toBeNull();
  });

  it('does not resolve when the target is not a zone (e.g. an absolute pace)', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [runSeg({ kind: 'pace', unit: 'per_km', value_s: 245 })],
      zoneProfiles: [runProfile(240)],
    });
    expect(result.workout!.blocks[0]!.items[0]!.resolved_intensity).toBeNull();
  });

  // ── %RM → kg resolved from the athlete's 1RM ──────────────────────────────
  const strengthSeg = (slug: string, target: unknown) => ({
    id: '70',
    position: 0,
    block_position: 0,
    block_format: null,
    block_title: null,
    params_json: { sets: 5 },
    prescription_json: {
      scheme: 'sets',
      modality: 'strength',
      sets: [{ measure: { kind: 'reps', value: 5 }, target }],
    },
    notes: null,
    exercise_id: '960',
    exercise_name: 'Back Squat',
    exercise_slug: slug,
    exercise_category: 'strength',
    exercise_video_url: null,
    exercise_cues: null,
    exercise_description: null,
  });

  it('resolves a %RM range to a kg range using the athlete 1RM', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [strengthSeg('back-squat', { kind: 'percent_rm', min: 65, max: 80 })],
      oneRms: new Map([[SQ_1RM, { one_rm_kg: 80, needs_review: false }]]),
    });
    const item = result.workout!.blocks[0]!.items[0]!;
    expect(item.params_json.load_pct).toBe(65); // % kept
    expect(item.resolved_load).not.toBeNull();
    expect(item.resolved_load!.pct_label).toBe('65–80%');
    expect(item.resolved_load!.kg_label).toBe('52–64 kg');
    expect(item.resolved_load!.min_kg).toBe(52);
    expect(item.resolved_load!.max_kg).toBe(64);
    expect(item.resolved_load!.one_rm_kg).toBe(80);
    expect(item.resolved_load!.needs_review).toBe(false);
  });

  it('resolves a single %RM value to a single kg', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [strengthSeg('back-squat', { kind: 'percent_rm', value: 75 })],
      oneRms: new Map([[SQ_1RM, { one_rm_kg: 100, needs_review: false }]]),
    });
    const rl = result.workout!.blocks[0]!.items[0]!.resolved_load!;
    expect(rl.pct_label).toBe('75%');
    expect(rl.kg_label).toBe('75 kg');
    expect(rl.min_kg).toBe(75);
    expect(rl.max_kg).toBeNull();
  });

  it('keeps the % honest (no resolved kg) when the athlete has no 1RM', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [strengthSeg('back-squat', { kind: 'percent_rm', value: 75 })],
      oneRms: new Map(), // no 1RM on file
    });
    const item = result.workout!.blocks[0]!.items[0]!;
    expect(item.params_json.load_pct).toBe(75); // % still shown
    expect(item.resolved_load).toBeNull(); // never fabricated
  });

  it('does not resolve a lift that is not a tracked 1RM exercise', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      // front-squat is intentionally NOT mapped (a different lift, not the squat 1RM).
      segments: [strengthSeg('front-squat', { kind: 'percent_rm', value: 75 })],
      oneRms: new Map([[SQ_1RM, { one_rm_kg: 100, needs_review: false }]]),
    });
    expect(result.workout!.blocks[0]!.items[0]!.resolved_load).toBeNull();
  });

  it('carries the unconfirmed (needs_review) flag from the 1RM source', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [strengthSeg('back-squat', { kind: 'percent_rm', value: 80 })],
      oneRms: new Map([[SQ_1RM, { one_rm_kg: 120, needs_review: true }]]),
    });
    const rl = result.workout!.blocks[0]!.items[0]!.resolved_load!;
    expect(rl.kg_label).toBe('96 kg');
    expect(rl.needs_review).toBe(true);
  });

  // ── Card 130/134 — objetivos RELATIVOS resueltos al leer el día ───────────
  // La plantilla guarda «al 50% del peso corporal» para siempre; aquí se
  // comprueba que el camino del día lo convierte en el número de ESTE atleta
  // (o en la verdad, cuando falta la marca) — nunca en el `kind: 'relative'`
  // crudo. El resolutor en sí (resolveRelativeTarget/resolvePrescriptionReferences)
  // ya está probado a fondo en tests/domain/relative-target.test.ts; esto sólo
  // fija que assignment-detail lo ENCHUFA en el sitio y orden correctos.
  const relativeSeg = (target: unknown) => ({
    id: '75',
    position: 0,
    block_position: 0,
    block_format: null,
    block_title: null,
    params_json: {},
    prescription_json: { scheme: 'sets', modality: 'strength', target },
    notes: null,
    exercise_id: '970',
    exercise_name: 'Sled Push',
    exercise_slug: 'sled-push',
    exercise_category: 'strength',
    exercise_video_url: null,
    exercise_cues: null,
    exercise_description: null,
  });

  const anchorsConPeso: AthleteAnchors = {
    racePace: {},
    thresholdPace: {},
    bodyweightKg: 80,
  };

  it('resuelve un objetivo relativo al número de ESTE atleta y manda la frase aparte', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [relativeSeg({ kind: 'relative', ref: { of: 'bodyweight' }, percent: 50 })],
      anchors: anchorsConPeso,
    });
    const item = result.workout!.blocks[0]!.items[0]!;
    expect(item.prescription_json?.target).toEqual({ kind: 'kg', value: 40 });
    expect(item.resolved_references).toEqual([
      { phrase: 'al 50 % del peso corporal', target: { kind: 'kg', value: 40 }, source: 'bodyweight', estimated: false },
    ]);
  });

  it('sin la marca que le falta, la línea sale SIN objetivo pero con la frase — nunca un relativo crudo', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [relativeSeg({ kind: 'relative', ref: { of: 'bodyweight' }, percent: 50 })],
      // Anclas SIN peso: la marca que le falta a ESTE atleta.
      anchors: { racePace: {}, thresholdPace: {}, bodyweightKg: null },
    });
    const item = result.workout!.blocks[0]!.items[0]!;
    expect(item.prescription_json?.target).toBeUndefined();
    expect(item.prescription_json?.target?.kind).not.toBe('relative');
    expect(item.resolved_references).toEqual([
      { phrase: 'al 50 % del peso corporal', target: null, source: null, estimated: false },
    ]);
  });

  it('al cable NUNCA viaja un kind: "relative", con o sin anclas', () => {
    const sinAnclas = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [relativeSeg({ kind: 'relative', ref: { of: 'bodyweight' }, percent: 50 })],
      // Sin pasar `anchors` en absoluto — el llamador que se olvida no debe
      // colar un relativo crudo: resuelve contra anclas vacías, que es la
      // verdad honesta («no sabemos nada de este atleta»).
    });
    const item = sinAnclas.workout!.blocks[0]!.items[0]!;
    expect(item.prescription_json?.target?.kind).not.toBe('relative');
    expect(item.resolved_references).toEqual([
      { phrase: 'al 50 % del peso corporal', target: null, source: null, estimated: false },
    ]);
  });

  it('a peso de competición usa la tabla inyectada y manda la frase aparte', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [
        relativeSeg({ kind: 'relative', ref: { of: 'competition_load', station: 'hyrox-sled-push' } }),
      ],
      anchors: {
        racePace: {},
        thresholdPace: {},
        competitionLoad: (slug) =>
          slug === 'hyrox-sled-push' ? { kind: 'sled', kg: 152 } : null,
      },
    });
    const item = result.workout!.blocks[0]!.items[0]!;
    expect(item.prescription_json?.target).toEqual({ kind: 'kg', value: 152 });
    expect(item.resolved_references).toEqual([
      {
        phrase: 'a peso de competición',
        target: { kind: 'kg', value: 152 },
        source: 'competition_load:hyrox-sled-push',
        estimated: false,
      },
    ]);
  });

  it('el snapshot sellado manda sobre un retest: el número no se reescribe', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [
        {
          ...relativeSeg({
            kind: 'relative',
            ref: { of: 'competition_load', station: 'hyrox-sled-push' },
          }),
          sealed_prescription_json: {
            scheme: 'sets',
            modality: 'strength',
            target: { kind: 'kg', value: 152 },
          },
        },
      ],
      anchors: {
        racePace: {},
        thresholdPace: {},
        competitionLoad: (slug) =>
          slug === 'hyrox-sled-push' ? { kind: 'sled', kg: 200 } : null,
      },
    });
    const item = result.workout!.blocks[0]!.items[0]!;
    expect(item.prescription_json?.target).toEqual({ kind: 'kg', value: 152 });
    expect(item.resolved_references[0]?.phrase).toBe('a peso de competición');
    expect(item.resolved_references[0]?.target).toEqual({ kind: 'kg', value: 152 });
  });

  it('sin ningún objetivo relativo, la prescripción no cambia (idempotente, coste cero)', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment,
      execution: null,
      template: baseTemplate,
      segments: [strengthSeg('back-squat', { kind: 'percent_rm', value: 75 })],
      anchors: anchorsConPeso,
      oneRms: new Map([[SQ_1RM, { one_rm_kg: 100, needs_review: false }]]),
    });
    const item = result.workout!.blocks[0]!.items[0]!;
    expect(item.prescription_json?.sets?.[0]?.target).toEqual({ kind: 'percent_rm', value: 75 });
    expect(item.resolved_references).toEqual([]);
  });

  // ===========================================================================
  // ENTRENO LIBRE with content (regression: "No pudimos cargar tu entreno")
  //
  // A free workout is persisted by create-free-workout.ts as a one-segment
  // instance template whose `params_json` is the EMPTY object `{}` and whose
  // rich targets live ENTIRELY in `prescription_json` (measure × target ×
  // modality). This is the exact shape behind the athlete-created "Correr ·
  // 12×400m" / "Remo · 5×500m" report. The loader MUST emit a non-null `workout`
  // with ONE block + ONE item (never the empty-blocks → null collapse, never a
  // throw), and surface the rich params derived from the prescription — so the
  // executed/active surfaces always have content to render.
  // ===========================================================================

  // Mirror of the row create-free-workout.ts writes: params_json '{}', the whole
  // dose in prescription_json, block_position 1 / block_format = the scheme.
  const freeSeg = (
    id: string,
    slug: string,
    category: string,
    title: string,
    prescription: Record<string, unknown>,
  ) => ({
    id,
    position: 1,
    block_position: 1,
    block_format: 'intervals',
    block_title: title,
    params_json: {}, // create-free-workout persists '{}'::jsonb
    prescription_json: prescription,
    notes: null,
    exercise_id: '3479',
    exercise_name: slug === 'run' ? 'Run' : 'Rowing',
    exercise_slug: slug,
    exercise_category: category,
    exercise_video_url: null,
    exercise_cues: null,
    exercise_description: null,
  });

  it('loads a free RUN workout (12×400m) — workout non-null, params derived from prescription', () => {
    const result = buildAssignmentDetail({
      assignment: { ...baseAssignment, status: 'partial' as const },
      execution: { ended_at: '2026-06-30T12:09:45Z', perceived_exertion: 7 },
      template: { ...baseTemplate, name: 'Correr · 12×400m', format: 'intervals' },
      segments: [
        freeSeg('3320', 'run', 'cardio', 'Correr · 12×400m', {
          scheme: 'intervals',
          modality: 'run',
          sets: [
            {
              measure: { kind: 'distance', meters: 400 },
              target: { kind: 'pace', unit: 'per_km', value_s: 285 },
              rest_s: 90,
            },
          ],
          rounds: 12,
          rest_s: 90,
          target: { kind: 'pace', unit: 'per_km', value_s: 285 },
        }),
      ],
    });

    // The single root invariant: content exists → workout is NON-null with content.
    expect(result.workout).not.toBeNull();
    const blocks = result.workout!.blocks;
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.items.length).toBe(1);

    const item = blocks[0]!.items[0]!;
    expect(item.exercise_slug).toBe('run');
    // Modality drives the display category (not the bare catalog 'cardio').
    expect(item.exercise_category).toBe('running');
    // params_json '{}' on the segment, yet rich params are DERIVED from prescription.
    expect(item.params_json.distance_meters).toBe(400);
    expect(item.params_json.pace_sec_per_km).toBe(285);
    expect(item.prescription_json).not.toBeNull();

    // The executed block survives so the done/partial detail renders.
    expect(result.execution).not.toBeNull();
    expect(result.execution!.completeness).toBe('partial');
  });

  it('loads a free ROW workout (5×500m) — erg modality + /500m pace prescription', () => {
    const result = buildAssignmentDetail({
      assignment: { ...baseAssignment, status: 'completed' as const },
      execution: { ended_at: '2026-06-30T10:07:20Z', perceived_exertion: 8 },
      template: { ...baseTemplate, name: 'Remo 5×500 libre', format: 'intervals' },
      segments: [
        freeSeg('3308', 'row', 'cardio', 'Remo 5×500 libre', {
          scheme: 'intervals',
          modality: 'row',
          sets: [
            {
              measure: { kind: 'distance', meters: 500 },
              target: { kind: 'pace', unit: 'per_500m', value_s: 112 },
              rest_s: 90,
            },
          ],
          rounds: 5,
          rest_s: 90,
          target: { kind: 'pace', unit: 'per_500m', value_s: 112 },
        }),
      ],
    });

    expect(result.workout).not.toBeNull();
    const item = result.workout!.blocks[0]!.items[0]!;
    expect(item.exercise_slug).toBe('row');
    expect(item.exercise_category).toBe('rowing');
    expect(item.params_json.distance_meters).toBe(500);
    expect(item.prescription_json).not.toBeNull();
    expect(result.execution!.completeness).toBe('completed');
  });

  // ── #61 — the athlete wire emits the STRUCTURED running grammar per run block ──
  const runSegRow = (prescription_json: unknown, id = '80') => ({
    id, position: 0, block_position: 0, block_format: null, block_title: null,
    params_json: {}, prescription_json, notes: null,
    exercise_id: '960', exercise_name: 'Run', exercise_slug: 'run',
    exercise_category: 'cardio', exercise_video_url: null, exercise_cues: null, exercise_description: null,
  });
  const emittedStructure = (segRow: unknown, zoneProfiles?: unknown[]) =>
    buildAssignmentDetail({
      assignment: baseAssignment, execution: null, template: baseTemplate,
      segments: [segRow as never],
      ...(zoneProfiles ? { zoneProfiles: zoneProfiles as never } : {}),
    }).workout!.blocks[0]!.items[0]!.prescription_json!.structure;

  it('#61 · a sets-only pyramid seeds a structure with 3 DISTINCT measures', () => {
    // The real shape that motivated the ola: no `rounds`, one distance set per bout,
    // heterogeneous distances the legacy scalar path drops. legacyToStructure keeps
    // all three, per bout.
    const structure = emittedStructure(runSegRow({
      scheme: 'interval', modality: 'run',
      sets: [1200, 1000, 800].map((m) => ({ measure: { kind: 'distance', meters: m } })),
    }));
    expect(structure).toBeDefined();
    const works = flattenSegments(structure!).filter((s) => s.kind === 'work');
    expect(works.map((w) => w.measure)).toEqual([
      { type: 'distance', m: 1200 },
      { type: 'distance', m: 1000 },
      { type: 'distance', m: 800 },
    ]);
  });

  it('#61 · each zone bout carries the athlete RESOLVED pace band (same source as resolved_intensity)', () => {
    const structure = emittedStructure(
      runSegRow({ scheme: 'steady', modality: 'run', total_s: 1200, target: { kind: 'hr_zone', value: 4 } }),
      [runProfile(240)],
    )!;
    const work = flattenSegments(structure).find((s) => s.kind === 'work')!;
    expect(work.target).toEqual({ type: 'pace_zone', zone: 4 }); // run zone → pace zone
    expect(work.resolved).toBeDefined();
    expect(work.resolved!.zone_label).toBe('Z4');
    expect(work.resolved!.range_label).toBe('4:00–4:14/km');
    expect(work.resolved!.fast_s).toBe(240);
    expect(work.resolved!.slow_s).toBe(254);
    expect(work.resolved!.pace_unit).toBe('per_km');
  });

  it('#61 · with NO tested profile the structure emits without a fabricated band', () => {
    const structure = emittedStructure(
      runSegRow({ scheme: 'steady', modality: 'run', total_s: 1200, target: { kind: 'hr_zone', value: 4 } }),
    )!;
    const work = flattenSegments(structure).find((s) => s.kind === 'work')!;
    expect(work.target).toEqual({ type: 'pace_zone', zone: 4 });
    expect(work.resolved).toBeUndefined(); // zone label alone, never an invented pace
  });

  it('#61 · a STORED structure is emitted + enriched, not re-derived', () => {
    // The stored structure carries an incline the legacy flatten cannot express — so
    // seeing it on the wire proves the STORED tree was used (not legacyToStructure).
    const structure = emittedStructure(
      runSegRow({
        scheme: 'intervals', modality: 'run',
        structure: [{
          role: 'main',
          elements: [{ kind: 'work', measure: { type: 'distance', m: 400 }, target: { type: 'pace_zone', zone: 4 }, incline_pct: 8 }],
        }],
      }),
      [runProfile(240)],
    )!;
    const work = flattenSegments(structure)[0]!;
    expect(work.incline_pct).toBe(8);          // stored tree preserved
    expect(work.resolved!.fast_s).toBe(240);   // and enriched per athlete
  });

  it('#61 · una zona de PULSO autorizada NO se resuelve como banda de ritmo', () => {
    // El bug que esto vigila: `resolveSegmentBand` aceptaba `hr_zone` y la pasaba
    // por el resolvedor de RITMO, así que una zona de pulso salía al wire como
    // "4:00–4:14/km" y el atleta veía un ritmo que nadie había prescrito.
    //
    // Ojo con no confundirlo con el caso de arriba: en el formato VIEJO una zona
    // sobre carrera significa zona de ritmo y se convierte a `pace_zone` (eso sigue
    // resolviéndose). Aquí el coach ha escrito una zona de PULSO explícita en la
    // gramática estructurada, y eso no se puede expresar como ritmo.
    const structure = emittedStructure(
      runSegRow({
        scheme: 'intervals', modality: 'run',
        structure: [{
          role: 'main',
          elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: { type: 'hr_zone', zone: 4 } }],
        }],
      }),
      [runProfile(240)], // el atleta SÍ tiene perfil: antes esto bastaba para fabricar la banda
    )!;
    const work = flattenSegments(structure)[0]!;
    expect(work.target).toEqual({ type: 'hr_zone', zone: 4 }); // la zona de pulso se respeta
    expect(work.resolved).toBeUndefined();                     // y NO se inventa un ritmo
  });

  it('#61 · a non-run (strength) block emits NO structure', () => {
    const result = buildAssignmentDetail({
      assignment: baseAssignment, execution: null, template: baseTemplate,
      segments: [{
        id: '82', position: 0, block_position: 0, block_format: null, block_title: null,
        params_json: {}, notes: null,
        prescription_json: { scheme: 'sets', modality: 'strength', sets: [{ measure: { kind: 'reps', value: 5 }, target: { kind: 'kg', value: 100 } }] },
        exercise_id: '962', exercise_name: 'Back Squat', exercise_slug: 'back-squat',
        exercise_category: 'strength', exercise_video_url: null, exercise_cues: null, exercise_description: null,
      }],
    });
    expect(result.workout!.blocks[0]!.items[0]!.prescription_json!.structure).toBeUndefined();
  });
});
