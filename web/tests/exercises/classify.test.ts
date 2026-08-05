/**
 * guessMovement (shared/domain/exercises/classify.ts) — the corpus is 30+
 * REAL, unresolved exercise names from an actual coach's photographed week
 * (web/tests/import/fixtures/screenshot-semana12-vision-payload.json — see
 * `photo-e2e.test.ts`'s "namedMisses"/"resolved" lists for how they surfaced).
 * Not invented, not curated to flatter the classifier: every name below is
 * asserted, including the ones that come back `null` — a wrong guess is worse
 * than no guess, so a `null` here is a PASS, not a gap.
 */
import { describe, expect, test } from 'vitest';
import {
  detectCardioModality,
  guessMovement,
  type MovementGuess,
} from '@fahybrid/shared/domain/exercises/classify';

interface Case {
  name: string;
  expect: MovementGuess | null;
}

// The real corpus, dumped verbatim from the fixture's workout cards (labels/
// bullets/counters stripped — those aren't movement names, see
// build-proposal.ts's own `dropTitleMisreadAsExercise`/`cardLostProse`, a
// different concern from THIS module, which only ever sees a bare name).
const CASES: Case[] = [
  // ── REFUERZO HOMBRO — shoulder accessory, all named band/cable work ────────
  { name: 'Cable External Rotation', expect: { category: 'strength', modality: 'strength', confidence: 'high' } },
  { name: 'Band Pull Apart', expect: { category: 'strength', modality: 'strength', confidence: 'high' } },
  { name: 'Prone Y Raise', expect: { category: 'strength', modality: 'strength', confidence: 'high' } },
  { name: 'Serratus wall slide', expect: { category: 'strength', modality: 'strength', confidence: 'high' } },
  { name: 'Band Scapular Retraction', expect: { category: 'strength', modality: 'strength', confidence: 'high' } },
  { name: 'Diagonal Band Pull Apart', expect: { category: 'strength', modality: 'strength', confidence: 'high' } },
  { name: 'Banded Front Raise', expect: { category: 'strength', modality: 'strength', confidence: 'high' } },
  { name: 'Banded Lateral Raise', expect: { category: 'strength', modality: 'strength', confidence: 'high' } },
  { name: 'Prone T Raise', expect: { category: 'strength', modality: 'strength', confidence: 'high' } },
  { name: 'Scapular Push Up', expect: { category: 'strength', modality: 'strength', confidence: 'high' } },

  // ── COMPENSATORIO GLÚTEO — corrective glute activation, core not strength ──
  { name: 'Puente de glúteo', expect: { category: 'core', modality: 'core', confidence: 'high' } },
  { name: 'Marcha desde puente de glúteo', expect: { category: 'core', modality: 'core', confidence: 'high' } },
  { name: 'Isometría en puente de glúteo', expect: { category: 'core', modality: 'core', confidence: 'high' } },
  { name: 'Single Leg Glute Bridge', expect: { category: 'core', modality: 'core', confidence: 'high' } },
  { name: 'Side Plank with Clam Shell Hold', expect: { category: 'core', modality: 'core', confidence: 'high' } },
  { name: 'Extension de cadera en cuadrúp...', expect: { category: 'core', modality: 'core', confidence: 'high' } },
  // The TRAP: "with band" carries a real signal (strength accessory work) but
  // this exact compound name isn't a recognized movement — LOW, not high.
  { name: 'Side Step Squat With Band', expect: { category: 'strength', modality: 'strength', confidence: 'low' } },

  // ── MOVILIDAD GENERAL — poses/drills with NO generic mobility word at all ──
  { name: 'Cat Cow', expect: { category: 'mobility', modality: 'mobility', confidence: 'high' } },
  // "90-90" is the real trap: a genuine mobility drill with ZERO letters to
  // catch on. Correctly null — this module does not guess from digits.
  { name: '90-90', expect: null },
  { name: 'Cossack Squat', expect: { category: 'mobility', modality: 'mobility', confidence: 'high' } },
  { name: 'Forward Leg Swing', expect: { category: 'mobility', modality: 'mobility', confidence: 'high' } },
  { name: 'Cobra Pose', expect: { category: 'mobility', modality: 'mobility', confidence: 'high' } },
  { name: 'Hip Flexor Stretch', expect: { category: 'mobility', modality: 'mobility', confidence: 'high' } },
  { name: 'Bird Dog', expect: { category: 'core', modality: 'core', confidence: 'high' } },

  // ── TRANSICIONES CARRERA / erg pieces — cardio, and the row/remo trap ──────
  { name: 'Remo', expect: { category: 'cardio', modality: 'row', confidence: 'high' } },
  { name: 'Step Ups Cajón', expect: { category: 'plyometric', modality: 'functional', confidence: 'high' } },
  { name: 'carrera', expect: { category: 'cardio', modality: 'run', confidence: 'high' } },
  { name: 'carrera mi', expect: { category: 'cardio', modality: 'run', confidence: 'high' } },
  { name: 'Bici Libre', expect: { category: 'cardio', modality: 'bike', confidence: 'high' } },

  // The trap named explicitly in the brief: an implement mention ("disco")
  // does NOT make this "skill" — "burpee" is the load-bearing word, and a
  // burpee is conditioning/plyometric, implement or not.
  { name: 'Burpee con salto a disco', expect: { category: 'plyometric', modality: 'functional', confidence: 'high' } },

  // ── FUERZA PARTE ALTA — named barbell/dumbbell/bodyweight lifts ───────────
  { name: 'Press Banca', expect: { category: 'strength', modality: 'strength', confidence: 'high' } },
  { name: 'Dominada (lastrada)', expect: { category: 'strength', modality: 'strength', confidence: 'high' } },
  { name: 'Push Press 2 DB', expect: { category: 'strength', modality: 'strength', confidence: 'high' } },
  { name: 'Push Jerk', expect: { category: 'strength', modality: 'strength', confidence: 'high' } },
  { name: 'Encogimientos KTB', expect: { category: 'strength', modality: 'strength', confidence: 'high' } },
];

describe('guessMovement — real corpus (30+ names, every one asserted)', () => {
  for (const { name, expect: want } of CASES) {
    test(`"${name}" → ${want ? `${want.category}/${want.modality} (${want.confidence})` : 'null'}`, () => {
      expect(guessMovement(name)).toEqual(want);
    });
  }

  test('accuracy readout — the real number, not a claim', () => {
    const classified = CASES.filter((c) => guessMovement(c.name) !== null);
    const rate = classified.length / CASES.length;
    // eslint-disable-next-line no-console
    console.log(
      `guessMovement classified ${classified.length}/${CASES.length} of the real corpus ` +
        `(${Math.round(rate * 100)}%); the rest correctly return null.`,
    );
    expect(rate).toBeGreaterThan(0); // sanity — the readout above is what matters
  });
});

describe('guessMovement — never invents a category from nothing', () => {
  test('pure noise / non-movement text returns null', () => {
    expect(guessMovement('')).toBeNull();
    expect(guessMovement('   ')).toBeNull();
    expect(guessMovement('xyz123')).toBeNull();
    expect(guessMovement('A)')).toBeNull();
  });
});

describe('guessMovement — specificity ordering resolves the SAME word meaning two things', () => {
  test('"remo" bare is the rowing ERG (cardio); a qualified row is the lift (strength)', () => {
    expect(guessMovement('Remo')).toEqual({ category: 'cardio', modality: 'row', confidence: 'high' });
    expect(guessMovement('Remo con barra')).toEqual({
      category: 'strength',
      modality: 'strength',
      confidence: 'high',
    });
  });

  test('a bare burpee is plyometric; the official HYROX station name wins when it IS that station', () => {
    expect(guessMovement('Burpee')).toEqual({ category: 'plyometric', modality: 'functional', confidence: 'high' });
    expect(guessMovement('Burpee Broad Jump')).toEqual({
      category: 'hyrox_station',
      modality: 'functional',
      confidence: 'high',
    });
  });
});

describe('detectCardioModality — the ONE cardio-name table, shared with suggestModality', () => {
  // web/lib/dashboard/exercises/catalog-ui.ts's suggestModality used to carry
  // its OWN, slightly different word list for the exact same job (which cardio
  // machine does this name point to). Reconciled here per team-lead's request
  // (two classifiers that can drift is the failure mode this module exists to
  // prevent) — these are the terms suggestModality's OWN test suite
  // (web/tests/exercises/suggest-modality.test.ts) already covers, asserted
  // here too so this shared table can never regress them independently.
  test.each([
    ['Remo 500m', 'row'],
    ['Bici 20 min', 'bike'],
    ['Carrera continua 40 min', 'run'],
    ['Rodaje suave', 'run'],
    ['Tirada larga', 'run'],
    ['Sprint 100m', 'run'],
    ['HYROX SkiErg', 'ski'],
  ] as const)('"%s" → %s', (name, expected) => {
    expect(detectCardioModality(name)).toBe(expected);
  });

  test('"airbike" as ONE compound word resolves to bike (suggestModality carried this, guessMovement did not)', () => {
    // The OLD guessMovement regex required a word BOUNDARY before "bike"
    // (`\bbike\b`), which "airbike" never satisfies (no boundary between "air"
    // and "bike") — a real gap suggestModality's simpler `airbike` alternative
    // already covered. Folded in during reconciliation, not lost.
    expect(detectCardioModality('Airbike Sprint')).toBe('bike');
  });

  test('no cardio signal in the name → null (the caller decides the fallback, this table never guesses one)', () => {
    expect(detectCardioModality('Cat Cow')).toBeNull();
    expect(detectCardioModality('')).toBeNull();
  });

  test('reconciliation did not regress guessMovement: "Sprint 100m" now classifies (it silently could not before)', () => {
    expect(guessMovement('Sprint 100m')).toEqual({ category: 'cardio', modality: 'run', confidence: 'high' });
  });
});
