// Pure unit tests for the lead pipeline NO-RETREAT rule
// (@fahybrid/shared/domain/leads/status). The rule: a coach transition is valid iff
// the target is coach-settable (contactado/agendado/descartado), the lead is not
// terminal (convertido/descartado), and the target rank is strictly greater than the
// current — so the lead only ever ADVANCES or is discarded, never regresses.

import { describe, expect, test } from 'vitest';
import {
  canReopenLead,
  canTransitionLead,
  leadStatusAllowedNext,
  type LeadStatus,
} from '@fahybrid/shared/domain/leads/status';

describe('canTransitionLead — forward moves allowed', () => {
  test.each<[LeadStatus, LeadStatus]>([
    ['nuevo', 'contactado'],
    ['nuevo', 'agendado'], // skipping ahead is still forward
    ['contactado', 'agendado'],
    ['parcial', 'contactado'], // a pursued abandoned lead moves forward
  ])('%s → %s is allowed', (from, to) => {
    expect(canTransitionLead(from, to)).toBe(true);
  });
});

describe('canTransitionLead — discard allowed from any live state', () => {
  test.each<LeadStatus>(['parcial', 'nuevo', 'contactado', 'agendado'])(
    '%s → descartado is allowed',
    (from) => {
      expect(canTransitionLead(from, 'descartado')).toBe(true);
    },
  );
});

describe('canTransitionLead — NO RETREAT (backwards forbidden)', () => {
  test.each<[LeadStatus, LeadStatus]>([
    ['agendado', 'contactado'],
    ['contactado', 'contactado'], // same rank is not "forward"
    ['agendado', 'agendado'],
  ])('%s → %s is rejected', (from, to) => {
    expect(canTransitionLead(from, to)).toBe(false);
  });
});

describe('canTransitionLead — non-settable targets rejected', () => {
  test.each<LeadStatus>(['parcial', 'nuevo', 'convertido'])(
    'target %s is never coach-settable',
    (to) => {
      expect(canTransitionLead('nuevo', to)).toBe(false);
    },
  );
});

describe('canTransitionLead — terminal states are final', () => {
  test.each<[LeadStatus, LeadStatus]>([
    ['convertido', 'contactado'],
    ['convertido', 'descartado'],
    ['descartado', 'contactado'],
    ['descartado', 'agendado'],
  ])('%s cannot leave to %s', (from, to) => {
    expect(canTransitionLead(from, to)).toBe(false);
  });
});

describe('leadStatusAllowedNext — the coach-facing transition menu', () => {
  test('nuevo → contactado, agendado, descartado', () => {
    expect(leadStatusAllowedNext('nuevo')).toEqual(['contactado', 'agendado', 'descartado']);
  });
  test('contactado → agendado, descartado', () => {
    expect(leadStatusAllowedNext('contactado')).toEqual(['agendado', 'descartado']);
  });
  test('agendado → descartado only', () => {
    expect(leadStatusAllowedNext('agendado')).toEqual(['descartado']);
  });
  test('parcial → contactado, agendado, descartado', () => {
    expect(leadStatusAllowedNext('parcial')).toEqual(['contactado', 'agendado', 'descartado']);
  });
  test('terminal states offer nothing', () => {
    expect(leadStatusAllowedNext('convertido')).toEqual([]);
    expect(leadStatusAllowedNext('descartado')).toEqual([]);
  });
});

describe('reopen — the explicit human-correction exception', () => {
  test('only descartado can be reopened', () => {
    expect(canReopenLead('descartado')).toBe(true);
    for (const s of ['parcial', 'nuevo', 'contactado', 'agendado', 'convertido'] as LeadStatus[]) {
      expect(canReopenLead(s)).toBe(false);
    }
  });
  test('the generic pipeline still rejects descartado → nuevo (no-retreat)', () => {
    // Reopen is a SEPARATE path; the automatic pipeline never allows this backwards move.
    expect(canTransitionLead('descartado', 'nuevo')).toBe(false);
  });
});
