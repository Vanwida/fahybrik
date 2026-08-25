/**
 * Card 128 · hueco 6. Importador de ciclo: lector, propuesta de un SLICE
 * (nunca las 12 semanas a la base), nota declarada, confirm bloqueado
 * bajo el trinquete.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { importCycleProposalRequestSchema } from '@/lib/import/cycle-proposal';
import { assertCycleCoverage, importCycleConfirmRequestSchema } from '@/lib/import/cycle-confirm';
import { ImportError } from '@/lib/import/import-shared';
import { foldUntypedToDeclaredNotes } from '@/lib/import/cycle-notes';
import {
  cycleJsonToImportedWeeks,
  readCycleDocument,
} from '@/lib/import/cycle-source';
import { buildImportProposal, type ImportProposal } from '@/lib/import/build-proposal';
import { buildReviewModel } from '@/lib/dashboard/v2/import-review';
import { buildCycleConfirmBody, cycleStretchWeekRefs } from '@/lib/dashboard/v2/import-cycle-review';
import { createFakeSql } from '../utils/fake-sql';

const SYNTHETIC = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/cycle-import-synthetic.json'), 'utf8'),
) as Parameters<typeof cycleJsonToImportedWeeks>[0];

const CORPUS = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/macrociclo-hyrox-12-semanas.json'), 'utf8'),
) as { semanas: Array<{ numero: number }> };

const NO_MATCH_SQL = createFakeSql(() => []);

describe('lector del documento', () => {
  test('el JSON sintético son 2 semanas, 7 días cada una, Lunes tipable', () => {
    const weeks = cycleJsonToImportedWeeks(SYNTHETIC);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]!.week).toBe(1);
    expect(weeks[0]!.days).toHaveLength(7);
    const lunes = weeks[0]!.days.find((d) => d.day_of_week === 1);
    expect(lunes?.cards?.some((c) => c.kind === 'workout')).toBe(true);
    expect(lunes?.cards?.some((c) => c.kind === 'note')).toBe(true);
    expect(lunes?.prioridad).toBe('Esencial');
  });

  test('Miercoles sin tilde cae en el día 3', () => {
    const weeks = cycleJsonToImportedWeeks(SYNTHETIC);
    expect(weeks[1]!.days.find((d) => d.day_of_week === 3)?.stimulus).toBe('Z2');
  });

  test('markdown con SEMANA y un día entra', () => {
    const md = [
      '## Semana 1',
      '',
      '### Lunes',
      '',
      '- Back Squat 5x5',
    ].join('\n');
    const { kind, weeks } = readCycleDocument(md);
    expect(kind).toBe('markdown');
    expect(weeks[0]!.week).toBe(1);
    const lunes = weeks[0]!.days.find((d) => d.day_of_week === 1);
    expect(lunes?.cards?.[0]?.lines.join(' ')).toContain('Back Squat');
  });
});

describe('propuesta desde un SLICE del corpus (no las 12 semanas)', () => {
  test('las primeras 4 semanas del corpus son un tramo, no el ciclo entero', async () => {
    expect(CORPUS.semanas).toHaveLength(12);
    const slice = { semanas: CORPUS.semanas.filter((s) => s.numero <= 4) };
    expect(slice.semanas).toHaveLength(4);
    const weeks = cycleJsonToImportedWeeks(slice as Parameters<typeof cycleJsonToImportedWeeks>[0]);
    expect(weeks.map((w) => w.week)).toEqual([1, 2, 3, 4]);
    expect(weeks.some((w) => w.week > 4)).toBe(false);

    const proposal = await buildImportProposal({
      coach_id: 1,
      weeks,
      client: NO_MATCH_SQL,
    });
    expect(proposal.weeks).toHaveLength(4);
    expect(proposal.summary.total_items).toBeGreaterThan(0);
    expect(proposal.weeks.flatMap((w) => w.days)).toHaveLength(28);
  });
});

describe('lo no tipado entra como nota declarada', () => {
  test('una línea review deja de ser ítem y queda en coach_note', () => {
    const proposal: ImportProposal = {
      weeks: [
        {
          week: 1,
          sheet: 't',
          fell_back: false,
          days: [
            {
              day_of_week: 1,
              dow: 'Lunes',
              stimulus: 'Fuerza',
              state: 'review',
              sessions: [
                {
                  uid: 's',
                  slot: 'am',
                  blocks: [
                    {
                      uid: 'b',
                      title: 'Fuerza',
                      format: 'sets',
                      items: [
                        {
                          uid: 'typed',
                          exercise_id: 1,
                          exercise_name: 'Back Squat',
                          prescription: {
                            scheme: 'sets',
                            modality: 'strength',
                            sets: [{ measure: { kind: 'reps', value: 5 } }],
                          },
                        },
                        {
                          uid: 'untyped',
                          exercise_id: null,
                          exercise_name: '',
                          prescription: {
                            scheme: 'sets',
                            note: 'Esta linea no es una dosis de nadie',
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
              flags: [
                {
                  uid: 'typed',
                  confidence: 'detected',
                  review_reasons: [],
                  unresolved_exercise: false,
                  exercise_token: 'Back Squat',
                },
                {
                  uid: 'untyped',
                  confidence: 'review',
                  review_reasons: ['dense'],
                  unresolved_exercise: true,
                  exercise_token: '',
                },
              ],
            },
          ],
        },
      ],
      summary: { total_items: 2, detected: 1, review: 1, unresolved: 1 },
    };

    const folded = foldUntypedToDeclaredNotes(proposal);
    const block = folded.weeks[0]!.days[0]!.sessions[0]!.blocks[0]!;
    expect(block.items).toHaveLength(1);
    expect(block.items[0]!.exercise_name).toBe('Back Squat');
    expect(block.coach_note).toContain('Esta linea no es una dosis de nadie');
    expect(folded.summary.detected).toBe(1);
    expect(folded.summary.review).toBe(1);
  });

  test('el sintético, pasado por la gramática, pliega la prosa a nota', async () => {
    const weeks = cycleJsonToImportedWeeks(SYNTHETIC);
    const raw = await buildImportProposal({
      coach_id: 1,
      weeks: [weeks[0]!],
      client: NO_MATCH_SQL,
    });
    const folded = foldUntypedToDeclaredNotes(raw);
    const lunes = folded.weeks[0]!.days.find((d) => d.day_of_week === 1);
    const notes = [
      lunes?.notes,
      ...(lunes?.sessions ?? []).flatMap((s) => s.blocks.map((b) => b.coach_note)),
    ]
      .filter(Boolean)
      .join('\n');
    expect(notes).toMatch(/dosis de nadie|Nota del dia/i);
    const items = (lunes?.sessions ?? []).flatMap((s) => s.blocks.flatMap((b) => b.items));
    expect(items.every((it) => it.exercise_name !== '')).toBe(true);
  });
});

describe('el request del ciclo', () => {
  test('mode cycle no pide microcycle_id', () => {
    const ok = importCycleProposalRequestSchema.safeParse({
      mode: 'cycle',
      document_text: '{"semanas":[]}',
      week_from: 1,
      week_to: 4,
    });
    expect(ok.success).toBe(true);
  });

  test('confirm sin cobertura se rechaza ANTES de escribir', () => {
    expect(() => assertCycleCoverage({ total_items: 10, detected: 5 })).toThrow(ImportError);
    try {
      assertCycleCoverage({ total_items: 10, detected: 5 });
    } catch (err) {
      expect(err).toBeInstanceOf(ImportError);
      expect((err as ImportError).code).toBe('coverage_below_threshold');
    }
  });

  test('confirm con el trinquete pasa el gate de cobertura', () => {
    expect(() => assertCycleCoverage({ total_items: 1238, detected: 884 })).not.toThrow();
  });

  test('el body de confirm lleva week_index, no un id de plantilla ajena', () => {
    const proposal: ImportProposal = {
      weeks: [
        {
          week: 1,
          sheet: 't',
          fell_back: false,
          days: [
            {
              day_of_week: 1,
              dow: 'Lunes',
              stimulus: 'Fuerza',
              state: 'detected',
              sessions: [
                {
                  uid: 's',
                  slot: 'am',
                  blocks: [
                    {
                      uid: 'b',
                      title: 'Fuerza',
                      format: 'sets',
                      items: [
                        {
                          uid: 'i',
                          exercise_id: 9,
                          exercise_name: 'Back Squat',
                          prescription: {
                            scheme: 'sets',
                            modality: 'strength',
                            sets: [{ measure: { kind: 'reps', value: 5 } }],
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
              flags: [],
            },
          ],
        },
      ],
      summary: { total_items: 1, detected: 1, review: 0, unresolved: 0 },
    };
    const model = buildReviewModel(proposal, cycleStretchWeekRefs(1));
    const body = buildCycleConfirmBody({
      name: 'Prueba',
      source_summary: { total_items: 10, detected: 8 },
      weeks: model,
    });
    expect(body.mode).toBe('cycle');
    expect(body.weeks[0]!.week_index).toBe(0);
    expect(body.weeks[0]!.day_of_week).toBe(1);
    expect(
      importCycleConfirmRequestSchema.safeParse(body).success,
    ).toBe(true);
  });
});
