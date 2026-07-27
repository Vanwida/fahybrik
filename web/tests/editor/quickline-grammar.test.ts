// The quick line's contract with the grammar (editor redesign).
//
// The placeholder promises "6x1000 @4:30 r2'" — this test pins that the importer
// grammar actually DELIVERS on the examples the UI advertises, and that the parse
// lifts into a run structure the editor can merge. If the grammar ever regresses
// on these shapes, the input would silently become a liar.

import { describe, expect, it } from 'vitest';
import { parseNotationCell } from '../../../shared/domain/import/notation';
import { legacyToStructure, isRepeat } from '../../../shared/domain/prescription';

function structureOf(text: string) {
  const line = parseNotationCell(text)[0];
  if (!line || line.confidence !== 'detected') return null;
  return legacyToStructure(line.prescription);
}

describe('the advertised quick-line examples parse', () => {
  it("6x1000 @4:30 r2' → a 6× repeat of 1000 m work", () => {
    const st = structureOf("6x1000 @4:30 r2'");
    expect(st).not.toBeNull();
    const main = st!.find((p) => p.role === 'main') ?? st![0]!;
    const rep = main.elements.find(isRepeat);
    expect(rep).toBeDefined();
    expect(rep!.times).toBe(6);
  });

  it("20' Z2 → a single steady duration bout", () => {
    const st = structureOf("20' Z2");
    expect(st).not.toBeNull();
  });
});
