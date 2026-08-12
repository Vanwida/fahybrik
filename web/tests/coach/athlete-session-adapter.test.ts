import { describe, expect, it } from 'vitest';
import {
  decodeCoachAssignmentNotes,
  encodeCoachAssignmentNotes,
} from '@/lib/dashboard/coach/day-sessions';
import {
  adaptAthleteSessionToDrawer,
  type CoachSessionDetail,
} from '@/lib/dashboard/coach/athlete-session-adapter';

// ─────────────────────────────────────────────────────────────────────────────
// decodeCoachAssignmentNotes — inversa exacta del encode existente
// ─────────────────────────────────────────────────────────────────────────────

describe('decodeCoachAssignmentNotes', () => {
  it('round-trips title + notes through encode', () => {
    const encoded = encodeCoachAssignmentNotes({
      display_title: 'Tren inferior + Ergos',
      notes: 'Cuida la técnica en el squat.\nSegunda línea.',
    });
    expect(decodeCoachAssignmentNotes(encoded)).toEqual({
      display_title: 'Tren inferior + Ergos',
      notes: 'Cuida la técnica en el squat.\nSegunda línea.',
    });
  });

  it('preserves the slot line invisibly (never surfaces it)', () => {
    const encoded = encodeCoachAssignmentNotes({
      display_title: 'AM Fuerza',
      notes: 'RPE controlado',
      existing_notes: 'slot:am\ncoach_title:Viejo título\nnota previa',
    });
    const decoded = decodeCoachAssignmentNotes(encoded);
    expect(decoded.display_title).toBe('AM Fuerza');
    expect(decoded.notes).toBe('RPE controlado');
    expect(decoded.notes).not.toContain('slot:');
  });

  it('handles null / empty / body-only notes', () => {
    expect(decodeCoachAssignmentNotes(null)).toEqual({ display_title: null, notes: null });
    expect(decodeCoachAssignmentNotes('')).toEqual({ display_title: null, notes: null });
    expect(decodeCoachAssignmentNotes('solo una nota libre')).toEqual({
      display_title: null,
      notes: 'solo una nota libre',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// adaptAthleteSessionToDrawer — assignment materializado → shape del drawer
// ─────────────────────────────────────────────────────────────────────────────

function baseDetail(overrides: Partial<CoachSessionDetail> = {}): CoachSessionDetail {
  return {
    assignment_id: '42',
    iso_date: '2026-06-11',
    status: 'scheduled',
    display_title: null,
    coach_notes: null,
    content_state: 'blocks',
    origin: 'coach',
    template_name: 'Fuerza base — Tren inferior',
    workout: {
      name: 'Fuerza base — Tren inferior',
      focus: null,
      coach_note: null,
      estimated_duration_minutes: null,
      blocks: [
        {
          uid: 'block-0',
          title: 'Fuerza base',
          format: 'strength_block',
          block_position: 0,
          coach_note: null,
          config_json: {},
          items: [
            {
              uid: 'segment-1',
              template_segment_id: 1,
              exercise_id: '7',
              exercise_name: 'Back Squat',
              exercise_slug: 'back-squat',
              exercise_category: 'strength',
              exercise_video_url: null,
              cues: null,
              exercise_description: null,
              params_json: { sets: 5, reps: 5, load_pct: 75, rest_seconds: 120 },
              prescription_json: null,
              resolved_intensity: null,
              resolved_load: null,
              notes: null,
            },
          ],
        },
      ],
    },
    execution: null,
    segment_actuals: [],
    run_compliance: {
      summary: { total: 0, evaluable: 0, dentro: 0, fuera_rapido: 0, fuera_lento: 0, sin_dato: 0, pct_dentro: null },
      tramos: [],
      recovery_summary: { total: 0, evaluable: 0, controlada: 0, demasiado_rapida: 0, sin_dato: 0, pct_controlada: null },
      recovery_tramos: [],
      work_duration_summary: { total: 0, evaluable: 0, completa: 0, incompleta: 0, sin_dato: 0, pct_completa: null },
      recovery_duration_summary: { total: 0, evaluable: 0, controlada: 0, excedida: 0, sin_dato: 0, pct_controlada: null },
    },
    ...overrides,
  };
}

describe('adaptAthleteSessionToDrawer', () => {
  it('maps blocks/items into the WeekSession shape with the template name as focus', () => {
    const session = adaptAthleteSessionToDrawer(baseDetail());
    expect(session.kind).toBe('workout');
    expect(session.focus).toBe('Fuerza base — Tren inferior');
    expect(session.blocks).toHaveLength(1);
    const block = session.blocks![0]!;
    expect(block.format).toBe('strength_block');
    expect(block.items[0]!.exercise_name).toBe('Back Squat');
    expect(block.items[0]!.params_json).toMatchObject({ sets: 5, reps: 5, load_pct: 75 });
  });

  it('prefers the per-assignment coach title override over the template name', () => {
    const session = adaptAthleteSessionToDrawer(
      baseDetail({ display_title: 'Pierna + Ergos (ajustado)' }),
    );
    expect(session.focus).toBe('Pierna + Ergos (ajustado)');
  });

  it('falls back to a valid format when the stored one is outside the shared enum', () => {
    const detail = baseDetail();
    detail.workout!.blocks[0]!.format = 'simulation';
    const session = adaptAthleteSessionToDrawer(detail);
    expect(session.blocks![0]!.format).toBe('circuit');
  });

  it('degrades to an empty-block session when the assignment has no template', () => {
    const session = adaptAthleteSessionToDrawer(baseDetail({ workout: null }));
    expect(session.blocks).toEqual([]);
    expect(session.focus).toBe('Entreno');
  });
});
