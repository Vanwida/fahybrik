// La lectura de una carrera en el panel del coach: qué número manda, qué
// troceado toca y qué se calla. Las carreras de aquí salen del cruce de ejes de
// la gramática (medida × objetivo × estructura × pendiente × archivo), no de un
// ejemplo: un ejemplo es la pregunta, nunca la especificación.

import { describe, expect, it } from 'vitest';
import { dominioDelRitmo } from '@/components/v2/carrera/eje';
import { leerCarrera } from '@/components/v2/carrera/lectura';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import type { CoachSessionDetail } from '@/lib/dashboard/coach/athlete-session-adapter';
import type { AssignmentDetailItem } from '@/lib/athlete/assignment-detail';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';
import type { RunComplianceResult, RunComplianceTramo } from '@/lib/dashboard/coach/run-compliance';

// ── Fábricas ────────────────────────────────────────────────────────────────

function item(uid: string, prescription: Prescription | null, nombre = 'Carrera'): AssignmentDetailItem {
  return {
    uid,
    template_segment_id: 1,
    exercise_id: 'e1',
    exercise_name: nombre,
    exercise_slug: 'carrera',
    exercise_category: 'run',
    exercise_video_url: null,
    cues: null,
    exercise_description: null,
    params_json: {},
    prescription_json: prescription,
    resolved_intensity: null,
    resolved_load: null,
    notes: null,
  };
}

function lap(over: Partial<SegmentActual> & { position: number }): SegmentActual {
  return {
    item_uid: 'seg-1',
    modality: 'run',
    duration_seconds: null,
    reps_completed: null,
    weight_used_kg: null,
    distance_meters: null,
    avg_pace_s_per_500m: null,
    avg_pace_s_per_km: null,
    avg_power_w: null,
    stroke_rate_spm: null,
    avg_hr: null,
    max_hr: null,
    calories: null,
    emom_rounds_completed: null,
    emom_rounds_prescribed: null,
    incline_pct: null,
    run_cadence_spm: null,
    source: null,
    zone_seconds: null,
    leg_index: null,
    leg_role: null,
    leg_phase: 'main',
    is_structural: false,
    run_splits: null,
    erg_splits: null,
    drag_factor: null,
    avg_calories_per_hour: null,
    ...over,
  } as SegmentActual;
}

function cumplimiento(tramos: RunComplianceTramo[]): RunComplianceResult {
  const dentro = tramos.filter((t) => t.verdict === 'dentro').length;
  const rapido = tramos.filter((t) => t.verdict === 'fuera_rapido').length;
  const lento = tramos.filter((t) => t.verdict === 'fuera_lento').length;
  const evaluable = dentro + rapido + lento;
  return {
    summary: {
      total: tramos.length,
      evaluable,
      dentro,
      fuera_rapido: rapido,
      fuera_lento: lento,
      sin_dato: tramos.length - evaluable,
      pct_dentro: evaluable > 0 ? Math.round((dentro / evaluable) * 100) : null,
    },
    tramos,
    recovery_summary: { total: 0, evaluable: 0, controlada: 0, demasiado_rapida: 0, sin_dato: 0, pct_controlada: null },
    recovery_tramos: [],
    work_duration_summary: { total: 0, evaluable: 0, completa: 0, incompleta: 0, sin_dato: 0, pct_completa: null },
    recovery_duration_summary: {
      total: 0,
      evaluable: 0,
      controlada: 0,
      excedida: 0,
      sin_dato: 0,
      pct_controlada: null,
    },
  };
}

function detalle(over: {
  items: AssignmentDetailItem[];
  actuals: SegmentActual[];
  compliance: RunComplianceResult;
  conTraza?: boolean;
  /** Los kilómetros los sirve la traza. Sin ellos no hay troceado por km. */
  kilometros?: number;
}): CoachSessionDetail {
  return {
    assignment_id: 'a1',
    iso_date: '2026-08-11',
    status: 'completed',
    display_title: 'Sesión',
    coach_notes: null,
    workout: {
      name: 'Sesión',
      focus: null,
      coach_note: null,
      estimated_duration_minutes: null,
      blocks: [
        { uid: 'b1', title: 'Bloque', format: 'straight', block_position: 1, coach_note: null, config_json: {}, items: over.items },
      ],
    },
    content_state: 'blocks',
    origin: 'coach',
    template_name: 'Sesión',
    execution: {
      duration_min: 47,
      rpe: 8,
      athlete_notes: null,
      ended_at: null,
      score_label: null,
      perceived_difficulty: null,
      pain_area: null,
      pain_note: null,
      trace: {
        available: over.conTraza !== false,
        splits: Array.from({ length: over.kilometros ?? 0 }, (_, i) => ({
          index: i + 1,
          partial: false,
          distance_m: 1000,
          duration_s: 286,
          avg_pace_s_per_km: 286,
          avg_hr: 150,
          elevation_gain_m: null,
        })),
        display_curve: { pace: null, hr: null },
      },
    },
    segment_actuals: over.actuals,
    run_compliance: over.compliance,
  } as CoachSessionDetail;
}

/** 6 × 800 a 3:30, banda 3:25 a 3:35, con 2′ de trote entre series. */
const SEIS_POR_OCHOCIENTOS: Prescription = {
  modality: 'run',
  structure: [
    {
      role: 'main',
      elements: [
        {
          times: 6,
          elements: [
            { kind: 'work', measure: { type: 'distance', m: 800 }, target: { type: 'pace', value_s: 210 } },
            { kind: 'recovery', measure: { type: 'duration', s: 120 }, target: null, recovery_mode: 'trote' },
          ],
        },
      ],
    },
  ],
} as unknown as Prescription;

describe('leerCarrera · el sujeto sale de la forma de la carrera', () => {
  it('un 6×800 con banda lee «los tramos en banda», trocea por tramos y no numera las recuperaciones', () => {
    const ritmos = [208, 210, 209, 212, 224, 213];
    const actuals: SegmentActual[] = [];
    const tramos: RunComplianceTramo[] = [];
    ritmos.forEach((skm, i) => {
      const pos = i * 2;
      actuals.push(
        lap({ position: pos, leg_index: i * 2, leg_role: 'work', distance_meters: 800, duration_seconds: Math.round(0.8 * skm), avg_pace_s_per_km: skm }),
      );
      actuals.push(
        lap({ position: pos + 1, leg_index: i * 2 + 1, leg_role: 'recovery', duration_seconds: 120, avg_pace_s_per_km: 320 }),
      );
      tramos.push({
        item_uid: 'seg-1',
        position: pos,
        verdict: skm > 215 ? 'fuera_lento' : 'dentro',
        duration_verdict: null,
        rep_ordinal: i + 1,
        band_axis: 'pace',
      });
    });

    const l = leerCarrera(detalle({ items: [item('seg-1', SEIS_POR_OCHOCIENTOS)], actuals, compliance: cumplimiento(tramos) }))!;

    expect(l.sujeto.clase).toBe('veredicto');
    if (l.sujeto.clase !== 'veredicto') throw new Error('sujeto');
    expect(l.sujeto.dentro).toBe(5);
    expect(l.sujeto.evaluables).toBe(6);
    expect(l.sujeto.sesgo).toBe('lento');
    expect(l.troceado).toBe('tramos');
    expect(l.eje).toBe('ritmo');
    // El 5.º se fue a 3:44 con el borde lento en 3:35: nueve segundos.
    expect(Math.round(l.sujeto.peorDesvioS!)).toBe(9);
    // Las recuperaciones existen como fila y NO se numeran.
    expect(l.tramos.filter((t) => t.papel === 'recuperacion')).toHaveLength(6);
    expect(l.tramos.filter((t) => t.papel === 'recuperacion').every((t) => t.n == null)).toBe(true);
    // El ordinal es el que emite el servidor, no un contador local.
    expect(l.tramos.filter((t) => t.papel === 'trabajo').map((t) => t.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('sin traza no hay curva ni kilómetros, pero la media medida SÍ se lee', () => {
    const l = leerCarrera(
      detalle({
        items: [item('seg-1', SEIS_POR_OCHOCIENTOS)],
        actuals: [lap({ position: 0, leg_index: 0, leg_role: 'work', distance_meters: 12000, duration_seconds: 3420 })],
        compliance: cumplimiento([]),
        conTraza: false,
      }),
    )!;
    expect(l.hayCurva).toBe(false);
    expect(l.troceado).toBe('ninguno');
    // 3420 s / 12 km = 285 s/km. Callar esto sería quedarse corto, no honesto.
    expect(l.sujeto.clase).toBe('ritmo-medio');
    if (l.sujeto.clase !== 'ritmo-medio') throw new Error('sujeto');
    expect(Math.round(l.sujeto.skm)).toBe(285);
  });

  it('sin traza pero CON tramos medidos, el troceado por tramos se lee igual', () => {
    // La traza sirve la curva y los kilómetros; los tramos y sus veredictos
    // salen de segment_executions y existen desde mucho antes. Gatear la tabla
    // en la traza escondía la mitad de la lectura de toda sesión ya guardada.
    const ritmos = [208, 224, 213];
    const actuals = ritmos.map((skm, i) =>
      lap({ position: i, leg_index: i, leg_role: 'work', distance_meters: 800, duration_seconds: Math.round(0.8 * skm), avg_pace_s_per_km: skm }),
    );
    const l = leerCarrera(
      detalle({
        items: [item('seg-1', SEIS_POR_OCHOCIENTOS)],
        actuals,
        compliance: cumplimiento(
          ritmos.map((skm, i) => ({
            item_uid: 'seg-1',
            position: i,
            verdict: (skm > 215 ? 'fuera_lento' : 'dentro') as 'fuera_lento' | 'dentro',
            duration_verdict: null,
            rep_ordinal: i + 1,
            band_axis: 'pace' as const,
          })),
        ),
        conTraza: false,
      }),
    )!;
    expect(l.hayCurva).toBe(false);
    expect(l.troceado).toBe('tramos');
    expect(l.sujeto.clase).toBe('veredicto');
    if (l.sujeto.clase !== 'veredicto') throw new Error('sujeto');
    expect(l.sujeto.dentro).toBe(2);
    expect(l.sujeto.evaluables).toBe(3);
  });

  it('en cuesta el troceado cambia de eje y el veredicto de ritmo se retira', () => {
    const actuals: SegmentActual[] = [];
    const tramos: RunComplianceTramo[] = [];
    [54, 56, 58, 61].forEach((dur, i) => {
      actuals.push(
        lap({ position: i, leg_index: i, leg_role: 'work', distance_meters: 200, duration_seconds: dur, avg_pace_s_per_km: (dur / 200) * 1000, incline_pct: 8 }),
      );
      tramos.push({ item_uid: 'seg-1', position: i, verdict: 'sin_dato', duration_verdict: null, rep_ordinal: i + 1, band_axis: null });
    });
    const l = leerCarrera(detalle({ items: [item('seg-1', null)], actuals, compliance: cumplimiento(tramos) }))!;
    expect(l.sujeto.clase).toBe('tiempo-por-tramo');
    expect(l.eje).toBe('tiempo');
    if (l.sujeto.clase !== 'tiempo-por-tramo') throw new Error('sujeto');
    expect(l.sujeto.primeraS).toBe(54);
    expect(l.sujeto.ultimaS).toBe(61);
  });

  it('un rodaje continuo lee la media y trocea por kilómetros', () => {
    const l = leerCarrera(
      detalle({
        items: [item('seg-1', null)],
        kilometros: 11,
        actuals: [lap({ position: 0, distance_meters: 11967, duration_seconds: 3420, avg_pace_s_per_km: 286 })],
        compliance: cumplimiento([
          { item_uid: 'seg-1', position: 0, verdict: 'dentro', duration_verdict: null, rep_ordinal: 1, band_axis: 'pace' },
        ]),
      }),
    )!;
    expect(l.sujeto.clase).toBe('ritmo-medio');
    expect(l.troceado).toBe('kilometros');
    if (l.sujeto.clase !== 'ritmo-medio') throw new Error('sujeto');
    expect(l.sujeto.veredicto).toBe('dentro');
  });

  it('sin objetivo de ritmo no hay franja que dibujar, aunque haya tramos', () => {
    const actuals = [0, 1, 2].map((i) =>
      lap({ position: i, leg_index: i, leg_role: 'work', duration_seconds: 60, avg_pace_s_per_km: 232 + i }),
    );
    const l = leerCarrera(
      detalle({
        items: [item('seg-1', null)],
        actuals,
        compliance: cumplimiento(
          actuals.map((a, i) => ({
            item_uid: 'seg-1',
            position: a.position,
            verdict: 'sin_dato' as const,
            duration_verdict: null,
            rep_ordinal: i + 1,
            band_axis: null,
          })),
        ),
      }),
    )!;
    expect(l.sujeto.clase).toBe('contraste');
    expect(l.tramos.every((t) => t.banda == null)).toBe(true);
  });
});

describe('dominioDelRitmo · el eje lo fija lo que se corrió', () => {
  const muestras = [
    { t: 0, v: 210 },
    { t: 10, v: 212 },
    // Andando: 11:40/km. Si entra en el eje, aplasta las series contra el borde.
    { t: 20, v: 700 },
    { t: 30, v: 700 },
    { t: 40, v: 208 },
  ];
  const andando = [
    { papel: 'recuperacion', modo: 'caminar', inicioS: 20, duracionS: 20 },
  ] as unknown as Parameters<typeof dominioDelRitmo>[1];

  it('deja fuera del eje lo que se anduvo', () => {
    const d = dominioDelRitmo(muestras, andando, null)!;
    expect(d.max).toBeLessThan(300);
  });

  it('sin ventanas que excluir, todo entra', () => {
    const d = dominioDelRitmo(muestras, [], null)!;
    expect(d.max).toBeGreaterThan(700);
  });

  it('si no se corrió nada, andar manda y el eje no sale degenerado', () => {
    const soloAndando = [
      { t: 0, v: 700 },
      { t: 10, v: 710 },
    ];
    const todo = [{ papel: 'recuperacion', modo: 'caminar', inicioS: 0, duracionS: 20 }] as unknown as Parameters<
      typeof dominioDelRitmo
    >[1];
    const d = dominioDelRitmo(soloAndando, todo, null)!;
    expect(d.min).toBeLessThan(700);
    expect(d.max).toBeGreaterThan(710);
  });

  it('la banda entra en el eje aunque la señal no llegue hasta ella', () => {
    const d = dominioDelRitmo([{ t: 0, v: 300 }, { t: 10, v: 302 }], [], { rapidoSkm: 205, lentoSkm: 215 })!;
    expect(d.min).toBeLessThan(205);
  });
});
