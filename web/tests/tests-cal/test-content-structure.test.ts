import { describe, it, expect } from 'vitest';
import { DEFAULT_CALIBRATION_BATTERY } from '@fahybrid/shared/domain/coach/test-battery';
import { safeParsePrescription } from '@fahybrid/shared/domain/prescription';
import { mainPhase, phaseByRole } from '@fahybrid/shared/domain/prescription/run-structure';

// #61 — the default RESISTANCE tests must materialize a real prescribed session the
// guided cursor can drive (not an empty segment). Pure: the content prescriptions are
// valid and shaped as specified. No DB.

describe('#61 default resistance tests carry structured content', () => {
  const byPrimary = new Map(DEFAULT_CALIBRATION_BATTERY.map((p) => [p.primary_modality, p]));

  it('the 5K is ONE run segment with a valid 3-phase RunStructure (warmup·5000m·cooldown)', () => {
    const run = byPrimary.get('run')!;
    expect(run.content).toHaveLength(1);
    const seg = run.content![0]!;
    expect(seg.exercise).toContain('run');

    const parsed = safeParsePrescription(seg.prescription);
    expect(parsed.success).toBe(true);
    const p = parsed.success ? parsed.data : null;
    expect(p?.modality).toBe('run');
    expect(p?.structure).toBeDefined();

    // Pin EVERY tramo the guided cursor drives — iOS asserts against this exact wire,
    // so a silent drift here would break the cursor (or a fixture) downstream.
    const s = p!.structure!;
    expect(s.map((ph) => ph.role)).toEqual(['warmup', 'main', 'cooldown']);
    expect(phaseByRole(s, 'warmup')!.elements[0]).toMatchObject({
      kind: 'work',
      measure: { type: 'duration', s: 600 },
      target: { type: 'rpe', value: 3 },
    });
    expect(mainPhase(s)!.elements[0]).toMatchObject({
      kind: 'work',
      measure: { type: 'distance', m: 5000 },
      target: { type: 'rpe', min: 9, max: 10 },
    });
    expect(phaseByRole(s, 'cooldown')!.elements[0]).toMatchObject({
      kind: 'work',
      measure: { type: 'duration', s: 600 },
      target: { type: 'rpe', value: 2 },
    });
  });

  it('the 2K row is warmup + a 2000 m erg main (valid erg prescriptions, modality row)', () => {
    const row = byPrimary.get('row')!;
    expect(row.content).toHaveLength(2);
    for (const seg of row.content!) {
      expect(seg.exercise).toContain('row');
      expect(seg.prescription.modality).toBe('row');
      expect(safeParsePrescription(seg.prescription).success).toBe(true);
    }
    // warmup = 10 min easy; main = 2000 m a fondo.
    expect(row.content![0]!.prescription.sets?.[0]?.measure).toMatchObject({ kind: 'duration', seconds: 600 });
    expect(row.content![1]!.prescription.sets?.[0]?.measure).toMatchObject({ kind: 'distance', meters: 2000 });
  });

  it('half-sim and the 1RM battery carry NO content (unchanged — generic materialization)', () => {
    expect(byPrimary.get('hyrox')!.content).toBeUndefined();
    expect(byPrimary.get('strength')!.content).toBeUndefined();
  });
});
