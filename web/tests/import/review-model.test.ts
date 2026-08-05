// review-model — PURE tests (no DB) for the #28 review view model
// (lib/dashboard/v2/import-review). Focus: the coach's SELECTION of what gets
// imported — per-day and per-week exclusion. The honesty contract under test:
//   · buildConfirmBody sends ONLY included days of included weeks (sessions AND
//     the synonyms reconstructed from them);
//   · excluding a day with unresolved exercises UNBLOCKS confirming the rest
//     (totalUnresolved counts only what will be written);
//   · an excluded week needs no container-week mapping (unmappedWeekCount);
//   · dayTone surfaces the exclusion as 'skipped' (never just a colour change).

import { describe, expect, test } from 'vitest';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import type { EditorSession } from '@/lib/dashboard/v2/editor-types';
import type {
  ImportProposal,
  ProposalDay,
  ProposalFlag,
  ProposalWeek,
} from '@/lib/import/build-proposal';
import {
  acceptDayProposals,
  blockTruncation,
  buildConfirmBody,
  buildReviewModel,
  dayHiddenCount,
  dayProposedFields,
  dayTone,
  proposedFieldLabel,
  sessionIncompleteLines,
  totalExcludedDays,
  totalIncomplete,
  totalUnresolved,
  totalWritableDays,
  unmappedWeekCount,
  type MicroWeekRef,
  type ReviewWeek,
} from '@/lib/dashboard/v2/import-review';

// ── Fixture builders (minimal but REAL types — no `any`) ──────────────────────

let seq = 0;
const uid = (prefix: string) => `t-${prefix}-${++seq}`;

/** A REAL, executable prescription: 5×5 @80% r3'. These fixtures are about the
 *  coach's SELECTION, so their lines must clear the dose gate — a bare
 *  `{ scheme: 'sets' }` is a NAME, not a prescription, and is exactly what
 *  `totalIncomplete` exists to catch (see the 'sin dosis' describe below). */
const DOSED: Prescription = {
  scheme: 'sets',
  sets: [
    { measure: { kind: 'reps', value: 5 }, target: { kind: 'percent_rm', value: 80 }, rest_s: 180 },
  ],
};

/** A name with no work behind it — the garbage the review grid used to wave through. */
const NO_DOSE: Prescription = { scheme: 'sets' };

function makeSession(
  items: Array<{ uid: string; name: string; exerciseId: number | null; prescription?: Prescription }>,
): EditorSession {
  return {
    uid: uid('ses'),
    slot: 'am',
    blocks: [
      {
        uid: uid('blk'),
        title: 'Principal',
        format: 'sets',
        items: items.map((it) => ({
          uid: it.uid,
          exercise_id: it.exerciseId,
          exercise_name: it.name,
          prescription: it.prescription ?? DOSED,
        })),
      },
    ],
  };
}

function makeFlag(itemUid: string, token: string, overrides: Partial<ProposalFlag> = {}): ProposalFlag {
  return {
    uid: itemUid,
    confidence: 'detected',
    review_reasons: [],
    unresolved_exercise: false,
    exercise_token: token,
    ...overrides,
  };
}

function makeDay(
  dayOfWeek: number,
  dow: string,
  sessions: EditorSession[],
  flags: ProposalFlag[] = [],
): ProposalDay {
  return {
    day_of_week: dayOfWeek,
    dow,
    stimulus: null,
    sessions,
    flags,
    state: sessions.length > 0 ? 'detected' : 'rest',
  };
}

function makeWeek(n: number, days: ProposalDay[]): ProposalWeek {
  return { week: n, sheet: `Semana ${n}`, fell_back: false, days };
}

function makeProposal(weeks: ProposalWeek[]): ImportProposal {
  return { weeks, summary: { total_items: 0, detected: 0, review: 0, unresolved: 0 } };
}

function makeMicroWeek(id: string, index: number): MicroWeekRef {
  return { id, index, label: `Semana ${index + 1}`, session_count: 0 };
}

/** Two imported weeks: W1 = lunes ok (id 10) + martes with an UNRESOLVED
 *  exercise (token 'zercher jmp') + miércoles rest; W2 = lunes ok (id 20). */
function buildFixture(microWeeks: MicroWeekRef[]): ReviewWeek[] {
  const monUid = uid('item');
  const tueUid = uid('item');
  const w2MonUid = uid('item');
  const proposal = makeProposal([
    makeWeek(1, [
      makeDay(1, 'Lunes', [makeSession([{ uid: monUid, name: 'Back Squat', exerciseId: 10 }])], [
        makeFlag(monUid, 'Back Squat'),
      ]),
      makeDay(2, 'Martes', [makeSession([{ uid: tueUid, name: 'zercher jmp', exerciseId: null }])], [
        makeFlag(tueUid, 'zercher jmp', { unresolved_exercise: true }),
      ]),
      makeDay(3, 'Miércoles', []),
    ]),
    makeWeek(2, [
      makeDay(1, 'Lunes', [makeSession([{ uid: w2MonUid, name: 'Deadlift', exerciseId: 20 }])], [
        makeFlag(w2MonUid, 'Deadlift'),
      ]),
    ]),
  ]);
  return buildReviewModel(proposal, microWeeks);
}

const TWO_MICRO_WEEKS = [makeMicroWeek('101', 0), makeMicroWeek('102', 1)];

describe('buildReviewModel — selection defaults', () => {
  test('every week and day starts included', () => {
    const model = buildFixture(TWO_MICRO_WEEKS);
    expect(model.every((w) => w.included)).toBe(true);
    expect(model.every((w) => w.days.every((d) => d.included))).toBe(true);
  });

  test('with everything included, confirm carries all non-rest days', () => {
    const model = buildFixture(TWO_MICRO_WEEKS);
    const body = buildConfirmBody('7', model);
    expect(body.weeks).toHaveLength(3); // lun+mar (W1) + lun (W2); miércoles rest never writes
    expect(totalWritableDays(model)).toBe(3);
    expect(totalExcludedDays(model)).toBe(0);
    expect(totalUnresolved(model)).toBe(1); // the martes 'zercher jmp' line blocks
  });
});

describe('per-DAY exclusion', () => {
  test('excluding the unresolved day unblocks confirm and drops it from the body', () => {
    const model = buildFixture(TWO_MICRO_WEEKS);
    model[0]!.days[1]!.included = false; // martes (the unresolved one)

    expect(totalUnresolved(model)).toBe(0); // ← the point of the feature
    expect(totalWritableDays(model)).toBe(2);
    expect(totalExcludedDays(model)).toBe(1);

    const body = buildConfirmBody('7', model);
    expect(body.weeks).toHaveLength(2);
    expect(
      body.weeks.some((w) => w.target_week_template_id === 101 && w.day_of_week === 2),
    ).toBe(false); // martes W1 omitted
    expect(
      body.weeks.some((w) => w.target_week_template_id === 101 && w.day_of_week === 1),
    ).toBe(true); // lunes W1 still in
  });

  test('an excluded day teaches NO synonyms even if its exercise was resolved', () => {
    const model = buildFixture(TWO_MICRO_WEEKS);
    // Coach resolves the martes exercise in the drawer…
    model[0]!.days[1]!.sessions[0]!.blocks[0]!.items[0]!.exercise_id = 55;
    expect(buildConfirmBody('7', model).synonyms).toEqual([
      { term: 'zercher jmp', exercise_id: 55 },
    ]);
    // …but then leaves the day out: nothing of it is sent — not even the synonym.
    model[0]!.days[1]!.included = false;
    expect(buildConfirmBody('7', model).synonyms).toEqual([]);
  });

  test('dayTone flags the excluded day as skipped; rest days stay rest', () => {
    const model = buildFixture(TWO_MICRO_WEEKS);
    model[0]!.days[1]!.included = false;
    expect(dayTone(model[0]!.days[1]!)).toBe('skipped');
    expect(dayTone(model[0]!.days[0]!)).toBe('ok');
    expect(dayTone(model[0]!.days[2]!)).toBe('rest'); // rest wins over any exclusion
  });
});

describe('per-WEEK exclusion', () => {
  test('an excluded week sends none of its days', () => {
    const model = buildFixture(TWO_MICRO_WEEKS);
    model[1]!.included = false;
    const body = buildConfirmBody('7', model);
    expect(body.weeks.every((w) => w.target_week_template_id === 101)).toBe(true);
    expect(totalWritableDays(model)).toBe(2);
    expect(totalExcludedDays(model)).toBe(1); // W2's lunes
  });

  test('days of an excluded week read as skipped in the grid', () => {
    const model = buildFixture(TWO_MICRO_WEEKS);
    model[1]!.included = false;
    expect(dayTone(model[1]!.days[0]!, model[1]!.included)).toBe('skipped');
  });

  test('an excluded week with unresolved lines stops blocking confirm', () => {
    const model = buildFixture(TWO_MICRO_WEEKS);
    expect(totalUnresolved(model)).toBe(1);
    model[0]!.included = false; // the whole W1, unresolved martes inside
    expect(totalUnresolved(model)).toBe(0);
  });

  test('an excluded week needs no container-week mapping', () => {
    // Only ONE container week → imported W2 starts unmapped and blocks.
    const model = buildFixture([makeMicroWeek('101', 0)]);
    expect(model[1]!.target_week_id).toBeNull();
    expect(unmappedWeekCount(model)).toBe(1);
    model[1]!.included = false;
    expect(unmappedWeekCount(model)).toBe(0); // unblocked without picking a target
  });

  test('a week whose non-rest days are ALL individually excluded needs no mapping either', () => {
    const model = buildFixture([makeMicroWeek('101', 0)]);
    expect(unmappedWeekCount(model)).toBe(1);
    model[1]!.days[0]!.included = false; // its only non-rest day
    expect(unmappedWeekCount(model)).toBe(0);
    expect(buildConfirmBody('7', model).weeks.every((w) => w.target_week_template_id === 101)).toBe(true);
  });
});

// ── The dose gate ────────────────────────────────────────────────────────────
// The regression this exists for: a whole week of items that named an exercise
// and prescribed NOTHING sailed through as "26 items, 0 sin resolver" and lit up
// Confirmar. Resolving the exercise was the only thing the grid ever checked, so
// "Back Squat" with no series and "Run" with no distance counted as typed.

/** One included day, one line: a resolved exercise + whatever prescription. */
function oneLineModel(prescription: Prescription): ReviewWeek[] {
  const itemUid = uid('item');
  return buildReviewModel(
    makeProposal([
      makeWeek(1, [
        makeDay(
          1,
          'Lunes',
          [makeSession([{ uid: itemUid, name: 'Back Squat', exerciseId: 10, prescription }])],
          [makeFlag(itemUid, 'Back Squat')],
        ),
      ]),
    ]),
    [makeMicroWeek('101', 0)],
  );
}

describe('lines with no dose block confirm', () => {
  test('a resolved "Back Squat" with no prescription is NOT confirmable', () => {
    const model = oneLineModel(NO_DOSE);
    expect(totalUnresolved(model)).toBe(0); // the old gate saw nothing wrong…
    expect(totalIncomplete(model)).toBe(1); // …this one does.
    expect(dayTone(model[0]!.days[0]!)).toBe('incomplete');
  });

  test('a resolved "Run" with no distance and no time is NOT confirmable', () => {
    const model = oneLineModel({ scheme: 'steady', modality: 'run' });
    expect(totalIncomplete(model)).toBe(1);
    expect(sessionIncompleteLines(model[0]!.days[0]!.sessions[0]!)[0]!.reasons.join(' ')).toMatch(
      /dosis/i,
    );
  });

  test('the incomplete line names itself and says what is missing', () => {
    const lines = sessionIncompleteLines(oneLineModel(NO_DOSE)[0]!.days[0]!.sessions[0]!);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.exercise_name).toBe('Back Squat');
    expect(lines[0]!.reasons.length).toBeGreaterThan(0);
  });

  test('a real 5×5 @80% r3\' passes', () => {
    const model = oneLineModel(DOSED);
    expect(totalIncomplete(model)).toBe(0);
    expect(dayTone(model[0]!.days[0]!)).toBe('ok');
  });

  test('excluding the day drops its undosed lines from the count, like unresolved', () => {
    const model = oneLineModel(NO_DOSE);
    expect(totalIncomplete(model)).toBe(1);
    model[0]!.days[0]!.included = false;
    expect(totalIncomplete(model)).toBe(0);
    expect(dayTone(model[0]!.days[0]!)).toBe('skipped');
  });

  test('a line with NO exercise counts as unresolved only — never twice', () => {
    // Fix order is pick-the-exercise then prescribe-it, so each line reports ONE
    // next action and the two counters stay disjoint.
    const itemUid = uid('item');
    const model = buildReviewModel(
      makeProposal([
        makeWeek(1, [
          makeDay(
            1,
            'Lunes',
            [makeSession([{ uid: itemUid, name: 'zercher jmp', exerciseId: null, prescription: NO_DOSE }])],
            [makeFlag(itemUid, 'zercher jmp', { unresolved_exercise: true })],
          ),
        ]),
      ]),
      [makeMicroWeek('101', 0)],
    );
    expect(totalUnresolved(model)).toBe(1);
    expect(totalIncomplete(model)).toBe(0);
    expect(dayTone(model[0]!.days[0]!)).toBe('unresolved');
  });

  test('what Pablo actually writes still passes: an easy jog with no pace, bodyweight pull-ups', () => {
    // The importer TRANSCRIBES. Requiring an intensity here would redden ~57% of
    // his real workbook: an easy 30' jog needs no pace, a bodyweight pull-up has
    // no %RM. Both are executable, so both import.
    expect(totalIncomplete(oneLineModel({ scheme: 'steady', modality: 'run', total_s: 1800 }))).toBe(0);
    expect(
      totalIncomplete(
        oneLineModel({
          scheme: 'sets',
          modality: 'strength',
          sets: [{ measure: { kind: 'reps', value: 10 } }],
        }),
      ),
    ).toBe(0);
  });
});

// ── LEÍDO frente a PROPUESTO, y lo que la fuente cortó ────────────────────────
// Lo que trae la rama de FOTO: los huecos que rellenó el importador con los
// valores por defecto del coach, y las tarjetas que la captura cortó. Las dos
// cosas viven SOLO en la revisión: se pintan, se aceptan o se cambian, y al
// confirmar desaparecen. Aquí se fija justo eso.

/** Un día con una línea de fuerza y `filled` marcando el descanso y el RIR. */
function photoDay(
  itemUid: string,
  filled: Array<{ item_uid: string; field: string; path: string }>,
  truncations: Array<{ block_uid: string; hidden_count: number | null }> = [],
): ProposalDay {
  const session = makeSession([
    {
      uid: itemUid,
      name: 'Back Squat',
      exerciseId: 10,
      prescription: {
        scheme: 'sets',
        modality: 'strength',
        sets: [
          { measure: { kind: 'reps', value: 8, max: 12 }, target: { kind: 'rir', value: 2 }, rest_s: 90 },
          { measure: { kind: 'reps', value: 8, max: 12 }, target: { kind: 'rir', value: 2 } },
        ],
      },
    },
  ]);
  return {
    ...makeDay(1, 'Lunes', [session], [makeFlag(itemUid, 'Back Squat')]),
    // Los dos campos que añade la foto: opcionales en la propuesta, así que se
    // adjuntan como los adjunta el servidor y el modelo los lee con desconfianza.
    ...{ filled, truncations },
  } as ProposalDay;
}

/** El uid de la línea lo pone el llamador para poder apuntar a ella en `filled`,
 *  igual que hace el servidor: la marca de lo propuesto viaja POR UID. */
function photoModel(
  itemUid: string,
  filled: Array<{ item_uid: string; field: string; path: string }>,
  truncations: Array<{ block_uid: string; hidden_count: number | null }> = [],
): ReviewWeek[] {
  return buildReviewModel(
    makeProposal([makeWeek(1, [photoDay(itemUid, filled, truncations)])]),
    [makeMicroWeek('101', 0)],
  );
}

describe('lo propuesto por el importador', () => {
  test('se lee de la propuesta y se congela el valor que dejó', () => {
    const itemUid = uid('item');
    const model = photoModel(itemUid, [
      { item_uid: itemUid, field: 'rest', path: 'sets[0].rest_s' },
      { item_uid: itemUid, field: 'intensity', path: 'sets[0].target' },
    ]);
    const day = model[0]!.days[0]!;
    const pending = dayProposedFields(day);
    expect(pending).toHaveLength(2);
    expect(pending.map((p) => proposedFieldLabel(p.field, p.snapshot))).toEqual([
      'descanso 90 s',
      'RIR 2',
    ]);
  });

  test('editar un propuesto lo da por confirmado: deja de contar', () => {
    const itemUid = uid('item');
    const model = photoModel(itemUid, [
      { item_uid: itemUid, field: 'rest', path: 'sets[0].rest_s' },
      { item_uid: itemUid, field: 'intensity', path: 'sets[0].target' },
    ]);
    const day = model[0]!.days[0]!;
    // El coach cambia el descanso en el editor de bloque.
    day.sessions[0]!.blocks[0]!.items[0]!.prescription.sets![0]!.rest_s = 120;
    const pending = dayProposedFields(day);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.field).toBe('intensity');
  });

  test('«aceptar todos» los da por buenos sin tocar un solo valor', () => {
    const itemUid = uid('item');
    const model = photoModel(itemUid, [
      { item_uid: itemUid, field: 'rest', path: 'sets[0].rest_s' },
    ]);
    const accepted = acceptDayProposals(model[0]!.days[0]!);
    expect(dayProposedFields(accepted)).toHaveLength(0);
    expect(accepted.sessions[0]!.blocks[0]!.items[0]!.prescription.sets![0]!.rest_s).toBe(90);
  });

  test('un día con propuestas es ámbar, nunca verde', () => {
    const itemUid = uid('item');
    const model = photoModel(itemUid, [
      { item_uid: itemUid, field: 'rest', path: 'sets[0].rest_s' },
    ]);
    expect(dayTone(model[0]!.days[0]!)).toBe('review');
    expect(dayTone(acceptDayProposals(model[0]!.days[0]!))).toBe('ok');
  });

  test('lo que no se entiende se tira: campo raro, línea que no existe, ruta inventada', () => {
    const itemUid = uid('item');
    const model = photoModel(itemUid, [
      { item_uid: itemUid, field: 'peso', path: 'sets[0].rest_s' },
      { item_uid: 'no-existe', field: 'rest', path: 'sets[0].rest_s' },
      { item_uid: itemUid, field: 'rest', path: 'items[0].loco' },
      { item_uid: itemUid, field: 'rest', path: 'sets[1].rest_s' }, // la 2ª serie no lo lleva
    ]);
    expect(dayProposedFields(model[0]!.days[0]!)).toHaveLength(0);
  });

  test('las repeticiones propuestas se leen como el rango que son', () => {
    const itemUid = uid('item');
    const model = photoModel(itemUid, [
      { item_uid: itemUid, field: 'reps', path: 'sets[0].measure' },
    ]);
    const [pending] = dayProposedFields(model[0]!.days[0]!);
    expect(proposedFieldLabel(pending!.field, pending!.snapshot)).toBe('8-12 reps');
  });

  test('nada de esto se guarda: el confirmar manda la prescripción a secas', () => {
    const itemUid = uid('item');
    const model = photoModel(itemUid, [
      { item_uid: itemUid, field: 'rest', path: 'sets[0].rest_s' },
    ]);
    const body = buildConfirmBody('7', model);
    expect(JSON.stringify(body)).not.toContain('propuesto');
    expect(JSON.stringify(body)).not.toContain('not_visible_in_source');
    // Y el valor propuesto SÍ viaja, porque es la prescripción del coach.
    expect(body.weeks[0]!.sessions[0]!.blocks[0]!.items[0]!.prescription.sets![0]!.rest_s).toBe(90);
  });
});

describe('lo que la fuente cortó', () => {
  test('se cuenta lo que dijo que escondía, y 1 cuando no lo dijo', () => {
    const model = photoModel(uid('item'), [], [
      { block_uid: 'blk-a', hidden_count: 4 },
      { block_uid: 'blk-b', hidden_count: null },
    ]);
    const day = model[0]!.days[0]!;
    expect(dayHiddenCount(day)).toBe(5);
    expect(blockTruncation(day, 'blk-a')?.hidden_count).toBe(4);
    expect(blockTruncation(day, 'blk-z')).toBeNull();
  });

  test('un día con trabajo sin ver es ámbar', () => {
    const model = photoModel(uid('item'), [], [{ block_uid: 'blk-a', hidden_count: 4 }]);
    expect(dayTone(model[0]!.days[0]!)).toBe('review');
  });

  test('sin nada de la foto, el día se revisa como siempre', () => {
    const model = photoModel(uid('item'), []);
    const day = model[0]!.days[0]!;
    expect(day.proposed).toEqual([]);
    expect(day.truncations).toEqual([]);
    expect(dayTone(day)).toBe('ok');
  });
});
