// El contrato de honestidad del quickline del DÍA (rediseño de microciclos):
// una entrada → UN bloque tipado; lo entendido entra con su prescripción tal
// cual, lo no entendido entra a revisar con su verbatim en `note`, y JAMÁS se
// fabrica un `exercise_id`. Si esto regresa, el quickline se vuelve un mentiroso.

import { describe, expect, it } from 'vitest';
import { parseNotationCell } from '../../../shared/domain/import/notation';
import { blockFromQuickLines } from '@/components/v2/editor/quickline-block';

describe('blockFromQuickLines — el quickline es honesto', () => {
  it('press banca 4x4 @78-80% r90 → bloque de fuerza tipado, sin exercise_id inventado', () => {
    const lines = parseNotationCell('press banca 4x4 @78-80% r90');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]!.confidence).toBe('detected');

    const block = blockFromQuickLines(lines);
    expect(block.format).toBe('strength_block');
    expect(block.title.toLowerCase()).toContain('press banca');
    expect(block.items).toHaveLength(lines.length);
    for (const item of block.items) {
      expect(item.exercise_id).toBeNull(); // NUNCA fabricado: lo resuelve el catálogo
    }
    expect(block.items[0]!.prescription.scheme).toBe('sets');
  });

  it("10x400m r1' → intervalos con título derivado del formateador canónico", () => {
    const lines = parseNotationCell("10x400m r1'");
    expect(lines[0]!.confidence).toBe('detected');

    const block = blockFromQuickLines(lines);
    expect(block.format).toBe('intervals');
    expect(block.title.length).toBeGreaterThan(0);
    expect(block.items[0]!.exercise_id).toBeNull();
  });

  it('lo no entendido entra a revisar con el verbatim en note, sin números inventados', () => {
    const raw = 'wod hyrox raro con cosas 3x que no se entienden, sled y mas';
    const lines = parseNotationCell(raw);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.confidence === 'review')).toBe(true);

    const block = blockFromQuickLines(lines);
    expect(block.format).toBeNull(); // sin chip de formato que la gramática no probó
    expect(block.title).toBe('Para revisar');
    expect(block.items[0]!.prescription.note).toBeTruthy();
    expect(block.items[0]!.prescription.sets).toBeUndefined();
    expect(block.items[0]!.exercise_id).toBeNull();
  });
});
