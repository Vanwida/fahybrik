import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { verdictForSessionReset } from './session-reset';

describe('verdictForSessionReset', () => {
  it('ya pendiente: no-op, no pide confirm', () => {
    expect(
      verdictForSessionReset({ status: 'scheduled', hasRecordedWork: true, confirm: false }),
    ).toEqual({ action: 'already_scheduled' });
  });

  it('missed / skipped no son Hecho: no se deshacen aquí', () => {
    expect(
      verdictForSessionReset({ status: 'missed', hasRecordedWork: false, confirm: false }),
    ).toEqual({ action: 'not_undoable' });
    expect(
      verdictForSessionReset({ status: 'skipped', hasRecordedWork: true, confirm: true }),
    ).toEqual({ action: 'not_undoable' });
  });

  it('trabajo real + confirm:false pide confirmación y no borra', () => {
    expect(
      verdictForSessionReset({ status: 'completed', hasRecordedWork: true, confirm: false }),
    ).toEqual({ action: 'needs_confirmation' });
    expect(
      verdictForSessionReset({ status: 'partial', hasRecordedWork: true, confirm: false }),
    ).toEqual({ action: 'needs_confirmation' });
  });

  it('trabajo real + confirm:true borra', () => {
    expect(
      verdictForSessionReset({ status: 'completed', hasRecordedWork: true, confirm: true }),
    ).toEqual({ action: 'reset' });
  });

  it('sin trabajo real (marcar hecha vacía) borra a la primera', () => {
    expect(
      verdictForSessionReset({ status: 'completed', hasRecordedWork: false, confirm: false }),
    ).toEqual({ action: 'reset' });
  });
});

describe('device ingest no flippea Hecho (card 183)', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'sync');

  it('HealthKit / Garmin / Polar no llaman markAssignmentDoneFromDevice', () => {
    for (const file of ['ingest-healthkit.ts', 'ingest-garmin.ts', 'ingest-polar.ts']) {
      const src = readFileSync(join(root, file), 'utf8');
      expect(src, file).not.toMatch(/markAssignmentDoneFromDevice/);
    }
  });
});
