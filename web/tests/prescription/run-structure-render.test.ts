// #61 — render smoke test for the structured-run editor. renderToString exercises
// the whole component tree (hooks, JSX, all sub-forms) in node and throws on any
// render error — a cheap guard that the editor mounts for a fresh, a legacy-seeded
// and a fully-nested prescription without crashing.

import { describe, expect, test } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { parsePrescription, prescriptionFromStructure, type RunStructure } from '@fahybrid/shared/domain/prescription';
import { RunStructureForm } from '@/components/v2/editor/archetype-forms/run-structure/RunStructureForm';

const render = (value: Parameters<typeof RunStructureForm>[0]['value']) =>
  renderToString(createElement(RunStructureForm, { value, onChange: () => {} }));

describe('#61 · RunStructureForm renders without crashing', () => {
  test('fresh intervals seed (no structure yet)', () => {
    const value = parsePrescription({ scheme: 'intervals', modality: 'run', rounds: 6, rest_s: 120, sets: [{ measure: { kind: 'distance', meters: 1000 } }] });
    const html = render(value);
    expect(html).toContain('Principal');
    expect(html).toContain('Repetir');
  });

  test('legacy steady block (seeds via legacyToStructure)', () => {
    const value = parsePrescription({ scheme: 'steady', modality: 'run', total_s: 2700, target: { kind: 'hr_zone', value: 2 } });
    const html = render(value);
    expect(html).toContain('Principal');
  });

  test('full three-phase nested structure', () => {
    const structure: RunStructure = [
      { role: 'warmup', elements: [{ kind: 'work', measure: { type: 'duration', s: 900 }, target: { type: 'pace_zone', zone: 1 } }] },
      {
        role: 'main',
        elements: [
          {
            times: 3,
            elements: [
              { times: 4, elements: [{ kind: 'work', measure: { type: 'distance', m: 400 }, target: { type: 'rpe', value: 9 } }, { kind: 'recovery', measure: { type: 'duration', s: 60 }, target: null, recovery_mode: 'parado' }] },
              { kind: 'recovery', measure: { type: 'duration', s: 180 }, target: null, recovery_mode: 'parado' },
            ],
          },
        ],
      },
      { role: 'cooldown', elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: { type: 'pace_zone', zone: 1 } }] },
    ];
    const value = prescriptionFromStructure(structure);
    const html = render(value);
    expect(html).toContain('Calentamiento');
    expect(html).toContain('Vuelta a la calma');
  });
});
